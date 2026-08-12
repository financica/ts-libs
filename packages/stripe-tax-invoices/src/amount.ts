/**
 * Stripe prints these invoices in English with US number formatting whatever
 * the currency or the customer's country: `€1,242.00`, `$8,800.00`, `¥1,234`.
 *
 * Parsing is therefore strict rather than tolerant. A European-formatted
 * `1.242,00` is not something this document produces, and reading it as `1.242`
 * would be a silent hundred-fold error, so anything that does not match the
 * printed convention is rejected instead of guessed at.
 *
 * Strictness is also what makes `parseAmount` usable as a column test: the
 * currency symbol must abut the digits, so `Aug 2025` in the neighbouring
 * column is not mistaken for the number 2025.
 */

/**
 * An amount as printed: an optional sign (the `Debited from your Balance` row
 * uses an en dash, not a hyphen), an optional symbol with the odd letter in
 * front of it (`A$`, `US$`), digits grouped in threes, an optional decimal
 * part.
 */
const AMOUNT_RE =
	/^([-‐-―−])?\s*(?:[A-Za-z]{0,3}\p{Sc})?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?$/u;

/**
 * Parse an amount exactly as the invoice prints it. Returns `null` when the
 * text is not an amount.
 */
export const parseAmount = (value?: string | null): number | null => {
	if (!value) return null;
	// Non-breaking spaces survive text extraction and are not separators here.
	const match = value.replace(/ /g, " ").trim().match(AMOUNT_RE);
	if (!match) return null;

	const parsed = Number.parseFloat(
		`${(match[2] ?? "").replace(/,/g, "")}.${match[3] ?? "0"}`,
	);
	if (!Number.isFinite(parsed)) return null;
	return match[1] ? -parsed : parsed;
};
