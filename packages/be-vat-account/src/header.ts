import { EUROPEAN_AMOUNT_RE, parseLocalizedAmount } from "./amount.js";
import { dotDateToIso, longDateToIso, slashDateToIso } from "./dates.js";
import { VatAccountParseError } from "./errors.js";
import { rowText } from "./layout.js";
import { BALANCE_LABELS, PATTERNS, PFORM671_MARKER, TITLE_FR } from "./patterns.js";
import type { BalanceType, IsoDate, StatementHeader, TextRow } from "./types.js";

/**
 * The closing balance, read from the first balance label in the document.
 *
 * "First" matters: the explanatory notice on the trailing pages quotes all
 * three labels, so a search that took the last match would report whichever
 * label the boilerplate happens to end on.
 */
const parseBalanceSummary = (
	rows: readonly TextRow[],
): { balanceType: BalanceType; balanceAmount: number } => {
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		if (!row) continue;
		const label = BALANCE_LABELS.find(({ pattern }) => pattern.test(rowText(row)));
		if (!label) continue;

		// The figure sits on the label's row or just under it, depending on
		// whether the label wrapped.
		let balanceAmount = 0;
		for (let offset = 0; offset <= 3 && index + offset < rows.length; offset++) {
			const candidate = rows[index + offset];
			const amount = candidate?.items.find((item) =>
				EUROPEAN_AMOUNT_RE.test(item.str),
			);
			if (!amount) continue;
			balanceAmount = parseLocalizedAmount(amount.str) ?? 0;
			break;
		}

		return { balanceType: label.type, balanceAmount };
	}

	return { balanceType: "zero", balanceAmount: 0 };
};

/** Try the modern pattern, then the legacy one, then give up with a reason. */
const requireDate = (
	fullText: string,
	patterns: readonly { pattern: RegExp; toIso: (value: string) => IsoDate | null }[],
	field: string,
): IsoDate => {
	for (const { pattern, toIso } of patterns) {
		const match = fullText.match(pattern);
		const iso = match?.[1] ? toIso(match[1]) : null;
		if (iso) return iso;
	}
	throw new VatAccountParseError("missing_field", `Could not parse ${field}`);
};

export const parseHeader = (
	fullText: string,
	rows: readonly TextRow[],
): StatementHeader => {
	const layout = fullText.includes(PFORM671_MARKER) ? "pform671" : "legacy";
	// The French title is the only positive marker printed; a statement without
	// it is the Dutch edition.
	const language = fullText.includes(TITLE_FR) ? "fr" : "nl";

	let vatNumber: string;
	let formReference: string;

	if (layout === "pform671") {
		const formRefMatch = fullText.match(PATTERNS.formReference);
		if (!formRefMatch) {
			throw new VatAccountParseError(
				"missing_field",
				"PFORM671 marker found but no form reference",
			);
		}
		formReference = formRefMatch[0];
		vatNumber = fullText.match(PATTERNS.vatNumber)?.[1] ?? "";
	} else {
		const match = fullText.match(PATTERNS.vatNumberLegacy);
		vatNumber = (match?.[1] ?? match?.[2] ?? "").replace(/\./g, "");
		if (!vatNumber) {
			throw new VatAccountParseError(
				"missing_field",
				"Could not find a VAT number",
			);
		}
		// Filled in below, once the situation date is known.
		formReference = "";
	}

	const statementDate = requireDate(
		fullText,
		[
			...(layout === "pform671"
				? [
						{
							pattern:
								language === "fr"
									? PATTERNS.statementDateFr
									: PATTERNS.statementDateNl,
							toIso: longDateToIso,
						},
					]
				: []),
			{ pattern: PATTERNS.statementDateLegacy, toIso: slashDateToIso },
		],
		"statement date",
	);

	const situationDate = requireDate(
		fullText,
		[
			{ pattern: PATTERNS.situationDate, toIso: dotDateToIso },
			{ pattern: PATTERNS.situationDateLegacy, toIso: slashDateToIso },
		],
		"situation date",
	);

	const periodStartDate = requireDate(
		fullText,
		[
			{ pattern: PATTERNS.periodStartDate, toIso: dotDateToIso },
			{ pattern: PATTERNS.periodStartDateLegacy, toIso: slashDateToIso },
		],
		"period start date",
	);

	if (!formReference) {
		formReference = `BE${vatNumber}/VAT-STATEMENT/${situationDate}`;
	}

	return {
		vatNumber,
		formReference,
		documentUuid: fullText.match(PATTERNS.documentUuid)?.[1] ?? null,
		statementDate,
		situationDate,
		periodStartDate,
		language,
		layout,
		...parseBalanceSummary(rows),
		structuredCommunication:
			fullText.match(PATTERNS.structuredCommunication)?.[0] ?? null,
	};
};

/** Exported for tests; the balance rule is the subtlest part of the header. */
export { parseBalanceSummary };
