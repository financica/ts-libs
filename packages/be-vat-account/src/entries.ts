import { EUROPEAN_AMOUNT_RE, parseLocalizedAmount } from "./amount.js";
import { anyDateToIso, MONTH_NAMES } from "./dates.js";
import { columnText, COLUMNS, rowText } from "./layout.js";
import {
	COLUMN_LABEL_PATTERNS,
	PATTERNS,
	WRAPPED_LABEL_MAX_LENGTH,
} from "./patterns.js";
import type { StatementEntry, TextRow } from "./types.js";

/** The two money columns, which every row kind reads the same way. */
const readAmounts = (row: TextRow) => {
	const inFavor = columnText(row, COLUMNS.amountInFavor);
	const owed = columnText(row, COLUMNS.amountOwed);
	return {
		amountInFavor: EUROPEAN_AMOUNT_RE.test(inFavor)
			? parseLocalizedAmount(inFavor)
			: null,
		amountOwed: EUROPEAN_AMOUNT_RE.test(owed) ? parseLocalizedAmount(owed) : null,
	};
};

const isColumnLabel = (text: string): boolean => {
	if (COLUMN_LABEL_PATTERNS.some((pattern) => pattern.test(text))) return true;
	// "Date de prise d'effet" wraps; the second line arrives alone.
	return /d'effet/i.test(text) && text.trim().length < WRAPPED_LABEL_MAX_LENGTH;
};

/** The month and year a situation row reports, in either layout. */
const readSituation = (text: string): { month: number | null; year: number } | null => {
	const named =
		text.match(PATTERNS.situationLineFr) ?? text.match(PATTERNS.situationLineNl);
	if (named) {
		return {
			month: MONTH_NAMES[named[1]?.toLowerCase() ?? ""] ?? null,
			year: Number.parseInt(named[2] ?? "0", 10),
		};
	}

	const numeric =
		text.match(PATTERNS.situationLineLegacyFr) ??
		text.match(PATTERNS.situationLineLegacyNl);
	if (numeric) {
		return {
			month: Number.parseInt(numeric[1] ?? "0", 10),
			year: Number.parseInt(numeric[2] ?? "0", 10),
		};
	}

	return null;
};

/**
 * The detailed table, read row by row between its start heading and the notice
 * that closes it. Anything outside that span is covering text and is ignored,
 * which is what keeps the trailing boilerplate from being read as data.
 */
export const parseEntries = (rows: readonly TextRow[]): StatementEntry[] => {
	const entries: StatementEntry[] = [];
	let lineOrder = 0;
	let inTable = false;

	for (const row of rows) {
		const text = rowText(row);

		if (PATTERNS.tableStart.test(text)) {
			inTable = true;
			continue;
		}
		if (PATTERNS.tableEnd.test(text)) break;
		if (!inTable) continue;
		if (isColumnLabel(text)) continue;

		if (PATTERNS.previousBalance.test(text)) {
			const date = text.match(PATTERNS.anyDate)?.[1];
			entries.push({
				entryType: "previous_balance",
				registrationDate: null,
				operationCode: null,
				effectiveDate: date ? anyDateToIso(date) : null,
				...readAmounts(row),
				situationMonth: null,
				situationYear: null,
				lineOrder: lineOrder++,
			});
			continue;
		}

		if (PATTERNS.operationsHeading.test(text)) continue;

		const situation = readSituation(text);
		if (situation) {
			entries.push({
				entryType: "situation",
				registrationDate: null,
				operationCode: null,
				effectiveDate: null,
				...readAmounts(row),
				situationMonth: situation.month,
				situationYear: situation.year,
				lineOrder: lineOrder++,
			});
			continue;
		}

		// A movement is any row whose first column holds a date.
		const registrationDate = anyDateToIso(
			columnText(row, COLUMNS.registrationDate),
		);
		if (!registrationDate) continue;

		entries.push({
			entryType: "transaction",
			registrationDate,
			operationCode: columnText(row, COLUMNS.operationCode) || null,
			effectiveDate: anyDateToIso(columnText(row, COLUMNS.effectiveDate)),
			...readAmounts(row),
			situationMonth: null,
			situationYear: null,
			lineOrder: lineOrder++,
		});
	}

	return entries;
};
