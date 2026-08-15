import type { Datapoint, TaxonomyModule } from "./taxonomy.js";
import type { NbbFilingInput, RubricAmounts } from "./types.js";

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
	statutesDate: "dim:bas=bas:m27,dim:evt=evt:m2,dim:part=part:m2",
	legalForm: "dim:bas=bas:m30,dim:part=part:m2,dim:psn=psn:m1",
	postalCode: "dim:bas=bas:m31,dim:ctc=ctc:m4,dim:part=part:m2,dim:psn=psn:m1",
	country: "dim:bas=bas:m31,dim:ctc=ctc:m6,dim:part=part:m2,dim:psn=psn:m1",
	businessCourt: "dim:bas=bas:m32,dim:part=part:m2",
} as const;

/**
 * The enumeration each identification field draws its value from.
 *
 * These are reported not as text but as a member of a closed list, in an
 * element of that list's own namespace — the legal form as `lgf-enum:list2`
 * carrying `lgf:m610`. The datapoint knows the element; this says what the
 * value has to look like.
 */
const ENUMERATED = {
	legalForm: "lgf",
	postalCode: "pcd",
	country: "cty",
	businessCourt: "cct",
} as const;

/**
 * A caller's code as the taxonomy's member QName.
 *
 * Members are the code with an `m` in front — postal code 5000 is `pcd:m5000`
 * and Belgium is `cty:mBE` — and a caller who has already written the `m` is
 * taken at their word.
 */
function enumMember(domain: string, value: string): string {
	const trimmed = value.trim();
	return `${domain}:${trimmed.startsWith("m") ? trimmed : `m${trimmed}`}`;
}

/**
 * Section 6.5, the valuation rules, addressed the same way: free text with no
 * rubric code. The model also offers the section as a PDF (`bsb1`); we file the
 * text form, which is what an accepted filing carries.
 */
const VALUATION_RULES = "dim:bas=bas:m107,dim:part=part:m6";

/** Sorted `dimension=member` signature of a datapoint. */
function signature(dimensions: Readonly<Record<string, string>>): string {
	return Object.entries(dimensions)
		.map(([dimension, member]) => `${dimension}=${member}`)
		.sort()
		.join(",");
}

/**
 * What makes two datapoints the same reported fact.
 *
 * The model prints one figure in more than one place: the closing net value of
 * a fixed-asset class is `(22/27)` in the statement of fixed assets and
 * `22/27` on the face of the balance sheet, and the result carried forward is
 * `14` under equity and `(14)` in the appropriation account. Those are one
 * metric with one set of dimensions, so an instance carries them once. The
 * section differs and is deliberately not part of the key.
 */
function factKey(datapoint: Datapoint, period: string | undefined): string {
	return `${datapoint.metric}|${signature(datapoint.dimensions)}|${period ?? ""}`;
}

/**
 * The cell of the model a rubric names in the column asked for.
 *
 * A rubric can have a cell per column, and the two are separate datapoints:
 * the annexes mark the preceding exercise with a member of their own, so
 * `22/27` this year and `22/27` last year differ by more than the period.
 *
 * Where the rubric has no cell in the column asked for it has only one cell,
 * and that is what is meant. An opening balance is numbered as its own rubric
 * — `8199P` beside `8199` — and exists only in the preceding exercise's
 * column, being last year's close, so a caller reporting "the opening balance
 * for this year" is reporting that cell.
 */
function columnOf(
	variants: readonly Datapoint[],
	asked: "current" | "previous",
): [Datapoint, NbbFact["period"]] {
	const wanted = asked === "current" ? "currentPeriod" : "previousPeriod";
	const exact = variants.find((variant) => variant[wanted]);
	if (exact) return [exact, asked];
	const only = variants[0]!;
	if (only.previousPeriod) return [only, "previous"];
	return [only, only.currentPeriod ? "current" : undefined];
}

/**
 * Assemble a filing from the caller's input and a taxonomy release.
 *
 * Rubric codes are resolved against the generated datapoint table, so an
 * unknown code is an error rather than a silently dropped figure.
 *
 * @throws {Error} if a rubric code does not exist in the chosen model.
 */
export function buildNbbFiling(input: NbbFilingInput): NbbFiling {
	const taxonomyModule = input.taxonomy;

	const byCode = new Map<string, Datapoint[]>();
	for (const datapoint of taxonomyModule.datapoints) {
		if (!datapoint.code) continue;
		byCode.set(datapoint.code, [...(byCode.get(datapoint.code) ?? []), datapoint]);
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
	identify("previousExerciseStart", input.identification.previousExercise?.startDate);
	identify("previousExerciseEnd", input.identification.previousExercise?.endDate);
	identify(
		"previousPeriodDataUnchanged",
		String(input.identification.previousPeriodDataUnchanged),
	);
	identify("isCorrection", String(input.identification.isCorrection ?? false));
	identify("inLiquidation", String(input.identification.inLiquidation ?? false));
	identify("statutesDate", input.entity.statutesDate);
	identify("legalForm", enumMember(ENUMERATED.legalForm, input.entity.legalForm));
	identify(
		"postalCode",
		enumMember(ENUMERATED.postalCode, input.entity.address.postalCode),
	);
	identify(
		"country",
		enumMember(ENUMERATED.country, input.entity.address.country ?? "BE"),
	);
	if (input.entity.businessCourt !== undefined) {
		identify(
			"businessCourt",
			enumMember(ENUMERATED.businessCourt, input.entity.businessCourt),
		);
	}
	const valuationRules = bySignature.get(VALUATION_RULES);
	if (valuationRules) {
		facts.push({ datapoint: valuationRules, value: input.valuationRules });
	}
	// The software producer is deliberately not written here. Its section
	// (s.01.00.4) belongs to the m101-r module, which is filed as its own
	// instance and is not published; putting it in the annual accounts would
	// report a datapoint the entry point does not declare.

	// One fact per datapoint and period, however many rubrics name it.
	const reported = new Map<string, NbbFact>();
	const addRubrics = (amounts: RubricAmounts | undefined, section: string): void => {
		for (const [code, amount] of Object.entries(amounts ?? {})) {
			const variants = byCode.get(code);
			if (!variants || variants.length === 0) {
				throw new Error(`unknown rubric code "${code}" in ${section}`);
			}
			const add = (asked: "current" | "previous", value: number): void => {
				const [datapoint, period] = columnOf(variants, asked);
				const fact: NbbFact = {
					datapoint,
					...(period ? { period } : {}),
					value: formatAmount(value),
					code,
				};
				const key = factKey(datapoint, period);
				const existing = reported.get(key);
				if (!existing) {
					reported.set(key, fact);
					facts.push(fact);
					return;
				}
				// The same figure reached twice under two of its names is fine
				// and reported once. Two different figures is a contradiction
				// the filer has to settle, not something to pick between.
				if (existing.value !== fact.value) {
					throw new Error(
						`"${code}" and "${existing.code}" are the same figure but were given as ${fact.value} and ${existing.value}`,
					);
				}
			};
			if (amount.current !== undefined && amount.current !== null) {
				add("current", amount.current);
			}
			if (amount.previous !== undefined && amount.previous !== null) {
				add("previous", amount.previous);
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

/**
 * Value reported for a rubric in a given column, if the filing has one.
 *
 * Looked up by the datapoint the rubric names rather than by the rubric
 * itself, so a figure given as `(14)` answers a check written against `14`.
 * They are one fact, and a filer should not have to state it twice.
 */
export function filingValue(
	filing: NbbFiling,
	code: string,
	period: "current" | "previous",
): number | undefined {
	const variants = filing.module.datapoints.filter(
		(datapoint) => datapoint.code === code,
	);
	if (variants.length === 0) return undefined;
	const [wanted, column] = columnOf(variants, period);
	const key = factKey(wanted, column);
	const fact = filing.facts.find(
		(candidate) => factKey(candidate.datapoint, candidate.period) === key,
	);
	return fact ? Number(fact.value) : undefined;
}
