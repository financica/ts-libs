import type { Check, CheckKind } from "./taxonomy.js";
import type { Finding, ValidationResult } from "./types.js";
import { filingValue, type NbbFiling } from "./build.js";
import {
	describeExpression,
	evaluateExpression,
	ExpressionError,
} from "./expression.js";

/**
 * Result of validating a filing, plus an account of what was not checked.
 *
 * Two very different things get called "not checked" and they are kept apart
 * here. A check is *not applicable* when it is about a section this model does
 * not have, which is the taxonomy's own doing. A check is *skipped* when the
 * filing reports nothing it reads, or when we could not work out which rubrics
 * it means — the second of which is a gap in this package, and is worth
 * knowing about rather than burying in a total.
 */
export interface NbbValidationResult extends ValidationResult {
	/** Identifiers of checks evaluated against the filing. */
	evaluated: readonly string[];
	/** Identifiers of checks the filing gave nothing to evaluate. */
	skipped: readonly string[];
	/** Identifiers of checks belonging to sections this model does not have. */
	notApplicable: readonly string[];
	/**
	 * Identifiers of checks whose rubrics we could not determine. A release
	 * where this is not empty is one where some rules go unenforced.
	 */
	unresolved: readonly string[];
}

/**
 * Run the NBB's published checks against a filing.
 *
 * Statutory checks land in `errors`: failing one is disqualifying and the
 * filing will be refused (rejection code DAT 33). The complementary checks
 * from Annex 1.2 and the social balance sheet checks from Annex 1.3 land in
 * `warnings`, since failing those does not block acceptance.
 */
export function validateNbbFiling(filing: NbbFiling): NbbValidationResult {
	const errors: Finding[] = [];
	const warnings: Finding[] = [];
	const evaluated: string[] = [];
	const skipped: string[] = [];
	const notApplicable: string[] = [];
	const unresolved: string[] = [];

	for (const check of filing.module.checks) {
		if (!check.bindings) {
			(check.notApplicable ? notApplicable : unresolved).push(check.id);
			continue;
		}
		const outcome = runCheck(filing, check);
		if (outcome === "skipped") {
			skipped.push(check.id);
			continue;
		}
		evaluated.push(check.id);
		if (outcome === "passed") continue;
		(check.kind === "legal" ? errors : warnings).push(outcome);
	}

	for (const finding of structuralFindings(filing)) {
		(finding.severity === "error" ? errors : warnings).push(finding);
	}

	return { errors, warnings, evaluated, skipped, notApplicable, unresolved };
}

/** Severity a check's failure carries. */
function severityOf(kind: CheckKind): "error" | "warning" {
	return kind === "legal" ? "error" : "warning";
}

type CheckOutcome = "passed" | "skipped" | Finding;

/**
 * Run one check over every assignment of rubrics the taxonomy permits.
 *
 * The assignments come from the generated table rather than being reconstructed
 * here, because working out which rubrics a variable means needs the taxonomy
 * itself — the dimension filters, and the equation the NBB states in the
 * message it shows when the check fails.
 */
function runCheck(filing: NbbFiling, check: Check): CheckOutcome {
	let ran = false;
	for (const binding of check.bindings ?? []) {
		const values: Record<string, number> = {};
		let reported = false;
		let usable = true;

		for (const variable of check.variables) {
			const code = binding[variable.name];
			if (code === undefined) {
				usable = false;
				break;
			}
			const period =
				variable.period === "prd:m2" ||
				check.precedingColumn?.includes(variable.name)
					? "previous"
					: "current";
			const value = filingValue(filing, code, period);
			if (value !== undefined) reported = true;
			const resolved = value ?? fallbackOf(variable.fallback);
			if (Number.isNaN(resolved)) {
				usable = false;
				break;
			}
			values[variable.name] = resolved;
		}
		// Every value fell back, so the filing says nothing about this part of
		// the model. Reporting a failure there would flag sections left out on
		// purpose — a micro filing omits most of the annexes by right.
		if (!usable || !reported) continue;

		let result: boolean;
		try {
			const evaluated = evaluateExpression(check.test, values);
			if (typeof evaluated !== "boolean") continue;
			result = evaluated;
		} catch (error) {
			if (error instanceof ExpressionError) continue;
			throw error;
		}
		ran = true;
		if (result) continue;

		const named = Object.fromEntries(
			check.variables.map((v) => [v.name, [binding[v.name] ?? v.name]]),
		);
		return {
			severity: severityOf(check.kind),
			check: check.id,
			rule: check.equation ?? describeExpression(check.test, named),
			codes: [...new Set(Object.values(binding))],
			message: `${check.id}: ${describeExpression(
				check.test,
				Object.fromEntries(
					check.variables.map((v) => [
						v.name,
						[`${binding[v.name]}=${values[v.name]}`],
					]),
				),
			)} does not hold`,
		};
	}
	return ran ? "passed" : "skipped";
}

function fallbackOf(fallback: string | undefined): number {
	if (fallback === undefined) return Number.NaN;
	const value = Number(fallback);
	return Number.isFinite(value) ? value : Number.NaN;
}

/** `rule` mirrors `check`: the NBB names each of these by its check id. */
const finding = (
	severity: "error" | "warning",
	check: string,
	message: string,
	codes: string[] = [],
): Finding => ({ severity, check, rule: check, codes, message });

/**
 * Checks the NBB applies to the filing as a whole rather than to its
 * arithmetic, each mapped to the rejection code it would produce.
 */
function structuralFindings(filing: NbbFiling): Finding[] {
	const findings: Finding[] = [];
	const { identification, entity } = filing.input;

	// The business court is a mandatory mention. The taxonomy has no formula for
	// it — it is a rule of the filing application, which refuses the deposit with
	// "Le tribunal d'entreprise est une mention obligatoire" — so it is asserted
	// here rather than being discovered on upload.
	if (!entity.businessCourt) {
		findings.push(
			finding(
				"error",
				"mandatory-mention",
				"the business court is a mandatory mention and is absent",
			),
		);
	}

	// DAT 26: the exercise dates have to be consistent with each other.
	if (identification.exercise.startDate >= identification.exercise.endDate) {
		findings.push(
			finding(
				"error",
				"DAT 26",
				`exercise starts on ${identification.exercise.startDate}, on or after its end on ${identification.exercise.endDate}`,
			),
		);
	}
	// A first exercise has no preceding one, and then there are no dates to
	// check against: the checks below apply only once one is declared.
	const preceding = identification.previousExercise;
	if (preceding) {
		if (preceding.startDate >= preceding.endDate) {
			findings.push(
				finding(
					"error",
					"DAT 26",
					`preceding exercise starts on ${preceding.startDate}, on or after its end on ${preceding.endDate}`,
				),
			);
		}
		if (preceding.endDate >= identification.exercise.startDate) {
			findings.push(
				finding(
					"error",
					"DAT 26",
					`the preceding exercise ends on ${preceding.endDate}, on or after the exercise being filed starts on ${identification.exercise.startDate}`,
				),
			);
		}
	}
	if (identification.generalMeetingDate < identification.exercise.endDate) {
		findings.push(
			finding(
				"error",
				"DAT 26",
				`the general meeting on ${identification.generalMeetingDate} predates the close of the exercise on ${identification.exercise.endDate}`,
			),
		);
	}

	// The balance sheet has to balance. The taxonomy states this as
	// va_03.01.0_0015, but writes it loosely enough that a variable there
	// matches both sides, so it is asserted directly instead.
	for (const period of ["current", "previous"] as const) {
		const assets = filingValue(filing, "20/58", period);
		const liabilities = filingValue(filing, "10/49", period);
		if (assets === undefined || liabilities === undefined) continue;
		if (Math.abs(assets - liabilities) > 0.005) {
			findings.push(
				finding(
					"error",
					"va_03.01.0_0015",
					`20/58 = 10/49 does not hold for the ${
						period === "current" ? "exercise" : "preceding exercise"
					}: ${assets} against ${liabilities}`,
					["20/58", "10/49"],
				),
			);
		}
	}

	// DAT 31: amounts are accepted to two decimal places, no further.
	for (const fact of filing.facts) {
		if (!fact.datapoint.metric.startsWith("am")) continue;
		const decimals = fact.value.split(".")[1];
		if (decimals && decimals.length > 2) {
			findings.push(
				finding(
					"error",
					"DAT 31",
					`${fact.code ?? fact.datapoint.metric} has more than two decimal places: ${fact.value}`,
					fact.code ? [fact.code] : [],
				),
			);
		}
	}

	if (!/^[01]\d{9}$/.test(entity.enterpriseNumber)) {
		findings.push(
			finding(
				"error",
				"enterprise-number",
				`"${entity.enterpriseNumber}" is not a ten-digit enterprise number starting 0 or 1`,
			),
		);
	} else if (
		97 - (Number(entity.enterpriseNumber.slice(0, 8)) % 97) !==
		Number(entity.enterpriseNumber.slice(8))
	) {
		findings.push(
			finding(
				"error",
				"enterprise-number",
				`the check digits of "${entity.enterpriseNumber}" are wrong`,
			),
		);
	}

	// The valuation rules are mandatory and free text, so only emptiness is
	// something we can check.
	if (filing.input.valuationRules.trim() === "") {
		findings.push(
			finding("error", "valuation-rules", "the valuation rules are empty"),
		);
	}

	// An instance must carry at least one non-nil monetary balance sheet value
	// for the current exercise.
	const hasBalanceSheet = Object.values(filing.input.balanceSheet).some(
		(amount) => amount.current !== undefined && amount.current !== null,
	);
	if (!hasBalanceSheet) {
		findings.push(
			finding(
				"error",
				"balance-sheet-present",
				"the filing reports no balance sheet figure for the current exercise",
			),
		);
	}

	// No page count is checked. The taxonomy has no datapoint for one — it is a
	// concept of the PDF filing route, where the pages of the printed model are
	// counted — so an XBRL instance never carries it and warning about it only
	// gives the filer something they cannot act on.

	return findings;
}
