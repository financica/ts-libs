import type { Check, CheckKind } from "./taxonomy.js";
import type { Finding, ValidationResult } from "./types.js";
import { filingValue, type NbbFiling } from "./build.js";
import {
	describeExpression,
	evaluateExpression,
	ExpressionError,
} from "./expression.js";

/**
 * Result of validating a filing, plus what could not be checked.
 *
 * A check is skipped when one of its variables does not resolve to a rubric in
 * the chosen model — the taxonomy filters some variables loosely enough that
 * they match nothing addressable. Skipped checks are reported rather than
 * silently dropped, because a validator that quietly ignores rules is worse
 * than one that says which it could not run.
 */
export interface NbbValidationResult extends ValidationResult {
	/** Identifiers of checks that could not be evaluated. */
	skipped: readonly string[];
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
	const skipped: string[] = [];

	for (const check of filing.module.checks) {
		const outcome = runCheck(filing, check);
		if (outcome === "skipped") {
			skipped.push(check.id);
			continue;
		}
		if (outcome === "passed") continue;
		(check.kind === "legal" ? errors : warnings).push(outcome);
	}

	for (const finding of structuralFindings(filing)) {
		(finding.severity === "error" ? errors : warnings).push(finding);
	}

	return { errors, warnings, skipped };
}

/** Severity a check's failure carries. */
function severityOf(kind: CheckKind): "error" | "warning" {
	return kind === "legal" ? "error" : "warning";
}

type CheckOutcome = "passed" | "skipped" | Finding;

function runCheck(filing: NbbFiling, check: Check): CheckOutcome {
	// Each variable binds to every rubric its filter reaches. Where a filter is
	// loose enough to reach several, the check has to hold for all of them.
	const bindings: { name: string; values: { code: string; value: number }[] }[] = [];
	let reported = false;

	for (const variable of check.variables) {
		// A variable the generator could not pin to exactly one rubric is not
		// safe to evaluate: guessing which one it meant would invent failures
		// on filings that are in fact correct, and a validator whose job is to
		// prevent rejection must never do that.
		if (variable.codes.length !== 1) return "skipped";
		const period = variable.period === "prd:m2" ? "previous" : "current";
		const values = variable.codes.map((code) => {
			const value = filingValue(filing, code, period);
			if (value !== undefined) reported = true;
			return { code, value: value ?? fallbackOf(variable.fallback) };
		});
		if (values.some((entry) => Number.isNaN(entry.value))) return "skipped";
		bindings.push({ name: variable.name, values });
	}
	if (bindings.length === 0) return "skipped";
	// Every value fell back, so the filing says nothing about this part of the
	// model. Reporting a failure there would flag sections left out on purpose.
	if (!reported) return "skipped";

	for (const combination of combinations(bindings)) {
		let result: boolean;
		try {
			const evaluated = evaluateExpression(check.test, combination.values);
			if (typeof evaluated !== "boolean") return "skipped";
			result = evaluated;
		} catch (error) {
			if (error instanceof ExpressionError) return "skipped";
			throw error;
		}
		if (result) continue;

		const codes = [...new Set(Object.values(combination.codes))];
		return {
			severity: severityOf(check.kind),
			check: check.id,
			rule: describeExpression(
				check.test,
				Object.fromEntries(check.variables.map((v) => [v.name, v.codes])),
			),
			codes,
			message: `${check.id}: ${describeExpression(
				check.test,
				Object.fromEntries(
					check.variables.map((v) => [
						v.name,
						[`${combination.codes[v.name]}=${combination.values[v.name]}`],
					]),
				),
			)} does not hold`,
		};
	}
	return "passed";
}

function fallbackOf(fallback: string | undefined): number {
	if (fallback === undefined) return Number.NaN;
	const value = Number(fallback);
	return Number.isFinite(value) ? value : Number.NaN;
}

/** Cartesian product over the values each variable can bind to. */
function* combinations(
	bindings: { name: string; values: { code: string; value: number }[] }[],
): Generator<{ values: Record<string, number>; codes: Record<string, string> }> {
	if (bindings.length === 0) return;
	const indices: number[] = Array.from({ length: bindings.length }, () => 0);
	for (;;) {
		const values: Record<string, number> = {};
		const codes: Record<string, string> = {};
		bindings.forEach((binding, position) => {
			const chosen = binding.values[indices[position]!]!;
			values[binding.name] = chosen.value;
			codes[binding.name] = chosen.code;
		});
		yield { values, codes };

		let position = bindings.length - 1;
		for (;;) {
			if (position < 0) return;
			indices[position]!++;
			if (indices[position]! < bindings[position]!.values.length) break;
			indices[position] = 0;
			position--;
		}
	}
}

/**
 * Checks the NBB applies to the filing as a whole rather than to its
 * arithmetic, each mapped to the rejection code it would produce.
 */
function structuralFindings(filing: NbbFiling): Finding[] {
	const findings: Finding[] = [];
	const { identification, entity } = filing.input;

	const finding = (
		severity: "error" | "warning",
		check: string,
		message: string,
		codes: string[] = [],
	): Finding => ({ severity, check, rule: check, codes, message });

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
