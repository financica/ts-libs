import type { Datapoint, TaxonomyModule } from "./taxonomy.js";
import type { NbbFilingInput, RubricAmounts } from "./types.js";
import { TAXONOMY_MODULES } from "./generated/index.js";

/** The taxonomy release used when a filing does not name one. */
export const DEFAULT_TAXONOMY = "26.0.15";

/** A single value to report, bound to the datapoint that carries it. */
export interface NbbFact {
	datapoint: Datapoint;
	/** Which column of the model, for datapoints that have both. */
	period?: "current" | "previous";
	/** Reported value, already in the lexical form the taxonomy expects. */
	value: string;
	/** Statutory rubric code, where the datapoint has one. */
	code?: string;
}

/** A filing, resolved against a taxonomy and ready to validate or render. */
export interface NbbFiling {
	input: NbbFilingInput;
	module: TaxonomyModule;
	facts: readonly NbbFact[];
}

/**
 * Identification datapoints, addressed by the dimensional signature the model
 * gives them rather than by a rubric code, because the model prints none for
 * section 1. The signature is a sorted `dimension=member` list.
 */
const IDENTIFICATION = {
	enterpriseNumber: "dim:bas=bas:m26,dim:part=part:m2,dim:psn=psn:m1,dim:qlt=qlt:m1",
	name: "dim:bas=bas:m29,dim:part=part:m2,dim:psn=psn:m1",
	street: "dim:bas=bas:m31,dim:ctc=ctc:m1,dim:part=part:m2,dim:psn=psn:m1",
	houseNumber: "dim:bas=bas:m31,dim:ctc=ctc:m2,dim:part=part:m2,dim:psn=psn:m1",
	postbox: "dim:bas=bas:m31,dim:ctc=ctc:m3,dim:part=part:m2,dim:psn=psn:m1",
	generalMeetingDate: "dim:bas=bas:m27,dim:evt=evt:m1,dim:part=part:m2",
	exerciseStart: "dim:bas=bas:m27,dim:mmt=mmt:m1,dim:part=part:m2",
	exerciseEnd: "dim:bas=bas:m27,dim:mmt=mmt:m2,dim:part=part:m2",
	previousExerciseStart:
		"dim:bas=bas:m27,dim:dcl=dcl:m1,dim:mmt=mmt:m1,dim:part=part:m2",
	previousExerciseEnd:
		"dim:bas=bas:m27,dim:dcl=dcl:m1,dim:mmt=mmt:m2,dim:part=part:m2",
	previousPeriodDataUnchanged: "dim:bas=bas:m28,dim:dcl=dcl:m1,dim:part=part:m2",
	isCorrection: "dim:bas=bas:m28,dim:dcl=dcl:m2,dim:part=part:m2",
	inLiquidation: "dim:bas=bas:m28,dim:dcl=dcl:m39,dim:part=part:m2",
} as const;

/** Sorted `dimension=member` signature of a datapoint. */
function signature(dimensions: Readonly<Record<string, string>>): string {
	return Object.entries(dimensions)
		.map(([dimension, member]) => `${dimension}=${member}`)
		.sort()
		.join(",");
}

/**
 * Assemble a filing from the caller's input and a taxonomy release.
 *
 * Rubric codes are resolved against the generated datapoint table, so an
 * unknown code is an error rather than a silently dropped figure.
 *
 * @throws {Error} if the taxonomy release or model is not available, or a
 * rubric code does not exist in the chosen model.
 */
export function buildNbbFiling(input: NbbFilingInput): NbbFiling {
	const version = input.taxonomy ?? DEFAULT_TAXONOMY;
	const part = { full: "f", "annual-accounts": "a", "other-documents": "o" }[
		input.part ?? "full"
	];
	const key = `${version}/${input.model}-${part}`;
	const taxonomyModule = TAXONOMY_MODULES[key];
	if (!taxonomyModule) {
		throw new Error(
			`no generated taxonomy for "${key}"; available: ${Object.keys(TAXONOMY_MODULES).join(", ")}`,
		);
	}

	const byCode = new Map<string, Datapoint>();
	for (const datapoint of taxonomyModule.datapoints) {
		if (datapoint.code && !byCode.has(datapoint.code))
			byCode.set(datapoint.code, datapoint);
	}
	const bySignature = new Map<string, Datapoint>();
	for (const datapoint of taxonomyModule.datapoints) {
		const signed = signature(datapoint.dimensions);
		if (!bySignature.has(signed)) bySignature.set(signed, datapoint);
	}

	const facts: NbbFact[] = [];

	const identify = (
		field: keyof typeof IDENTIFICATION,
		value: string | undefined,
	): void => {
		if (value === undefined) return;
		const datapoint = bySignature.get(IDENTIFICATION[field]);
		if (!datapoint) return;
		facts.push({ datapoint, value });
	};

	identify("enterpriseNumber", input.entity.enterpriseNumber);
	identify("name", input.entity.name);
	identify("street", input.entity.address.street);
	identify("houseNumber", input.entity.address.houseNumber);
	identify("postbox", input.entity.address.postbox);
	identify("generalMeetingDate", input.identification.generalMeetingDate);
	identify("exerciseStart", input.identification.exercise.startDate);
	identify("exerciseEnd", input.identification.exercise.endDate);
	identify("previousExerciseStart", input.identification.previousExercise.startDate);
	identify("previousExerciseEnd", input.identification.previousExercise.endDate);
	identify(
		"previousPeriodDataUnchanged",
		String(input.identification.previousPeriodDataUnchanged),
	);
	identify("isCorrection", String(input.identification.isCorrection ?? false));
	identify("inLiquidation", String(input.identification.inLiquidation ?? false));
	// The software producer is deliberately not written here. Its section
	// (s.01.00.4) belongs to the m101-r module, which is filed as its own
	// instance and is not published; putting it in the annual accounts would
	// report a datapoint the entry point does not declare.

	const addRubrics = (amounts: RubricAmounts | undefined, section: string): void => {
		for (const [code, amount] of Object.entries(amounts ?? {})) {
			const datapoint = byCode.get(code);
			if (!datapoint) {
				throw new Error(`unknown rubric code "${code}" in ${section}`);
			}
			if (amount.current !== undefined && amount.current !== null) {
				facts.push({
					datapoint,
					period: datapoint.currentPeriod ? "current" : undefined,
					value: formatAmount(amount.current),
					code,
				});
			}
			if (amount.previous !== undefined && amount.previous !== null) {
				facts.push({
					datapoint,
					period: "previous",
					value: formatAmount(amount.previous),
					code,
				});
			}
		}
	};

	addRubrics(input.balanceSheet, "balanceSheet");
	addRubrics(input.incomeStatement, "incomeStatement");
	addRubrics(input.appropriation, "appropriation");
	addRubrics(input.notes, "notes");

	return { input, module: taxonomyModule, facts };
}

/**
 * Amounts go out with two decimal places and a plain minus sign, which is what
 * the taxonomy's monetary types allow and the NBB's DAT 31 check polices.
 */
function formatAmount(value: number): string {
	return value.toFixed(2);
}

/** Value reported for a rubric in a given column, if the filing has one. */
export function filingValue(
	filing: NbbFiling,
	code: string,
	period: "current" | "previous",
): number | undefined {
	const fact = filing.facts.find(
		(candidate) =>
			candidate.code === code && (candidate.period ?? "current") === period,
	);
	return fact ? Number(fact.value) : undefined;
}
