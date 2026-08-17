/**
 * What an operation code on the statement means.
 *
 * The administration names every movement on the VAT current account with a
 * letter code, sometimes carrying a period suffix (`A-12.2025`). The letter is
 * the only significant part; the suffix, where there is one, names the period.
 */

import type { IsoDate } from "./types.js";

/** The kind of movement an operation code stands for. */
export type OperationKind =
	| "declaration"
	/** Payment to, or reimbursement from, the state. */
	| "settlement"
	| "late-interest"
	| "fine"
	/** Cancellations, corrections, regularizations, and codes not yet known. */
	| "other";

/**
 * Classify an operation by its code. Only the leading letter is significant, so
 * `A-12.2025` and `A` classify the same.
 */
export const operationKind = (operationCode?: string | null): OperationKind => {
	switch (operationCode?.trim().charAt(0).toUpperCase()) {
		case "A":
			return "declaration";
		case "H":
		case "N":
			return "settlement";
		case "L":
		case "M":
		case "U":
			return "late-interest";
		case "P":
		case "R":
		case "V":
			return "fine";
		default:
			// C cancellations, K payment corrections, X and Y regularizations, and
			// anything the administration introduces later.
			return "other";
	}
};

const DECLARATION_CODE_RE = /^A-(\d{2})\.(\d{4})$/i;

/**
 * The period a declaration covers, from its operation code. The administration
 * names the code after the period's last month, so `A-06.2025` declares the
 * quarter (or month) ending 30 June 2025.
 *
 * This is not the date the statement registers the declaration on: that falls
 * ~20 days into the *next* period, so a caller measuring the period at the
 * registration date would drag the next period's VAT into this one.
 *
 * Returns `null` for anything that is not a declaration code.
 */
export const declarationPeriodEnd = (operationCode?: string | null): IsoDate | null => {
	const match = operationCode?.trim().match(DECLARATION_CODE_RE);
	if (!match) return null;
	const month = Number(match[1]);
	const year = Number(match[2]);
	if (!month || month > 12 || !year) return null;
	// Day 0 of the following month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
