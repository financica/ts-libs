/**
 * What is printed below the last fee table: the totals across every section,
 * the rates they were converted at, and the notes.
 *
 * These only appear when an account settles in more than one currency, because
 * a single-currency invoice has nothing to convert and nothing to add up.
 */
import { parseAmount } from "./amount.js";
import { indentedItems, leftText } from "./layout.js";
import {
	EXCHANGE_RATE_PAIR_RE,
	EXCHANGE_RATES_HEADING_RE,
	FOOTNOTE_RE,
	INVOICE_TOTAL_RE,
} from "./patterns.js";
import type { ExchangeRate, FeeSection, InvoiceTotals, TextRow } from "./types.js";

/**
 * `Total fees in EUR` and `Total VAT in EUR`.
 *
 * These are printed whenever any section had to be converted — including on an
 * invoice with a single section, when that one section is not in the currency
 * Stripe reports in. Only an invoice with nothing to convert prints neither,
 * and there its sole section's own totals are the invoice's.
 */
export const parseInvoiceTotals = (
	rows: readonly TextRow[],
	sections: readonly FeeSection[],
): InvoiceTotals => {
	const totals: InvoiceTotals = {
		currency: sections[0]?.currency ?? "",
		fees: null,
		vat: null,
	};

	let printed = false;
	for (const row of rows) {
		const items = indentedItems(row);
		// The label is what is left once the amount is set aside.
		const match = items
			.filter((item) => parseAmount(item.str) === null)
			.map((item) => item.str)
			.join(" ")
			.match(INVOICE_TOTAL_RE);
		if (!match) continue;
		const amount = parseAmount(items.at(-1)?.str);
		if (amount === null) continue;
		printed = true;
		totals.currency = match[2] ?? totals.currency;
		if (match[1] === "fees") totals.fees = amount;
		else totals.vat = amount;
	}

	const [only] = sections;
	if (!printed && only && sections.length === 1) {
		totals.fees = only.totals.stripeFees;
		totals.vat = only.totals.totalVat;
	}

	return totals;
};

/** The `Exchange Rates` table and the basis printed in its heading. */
export const parseExchangeRates = (
	rows: readonly TextRow[],
): { rates: ExchangeRate[]; basis: string | null } => {
	const rates: ExchangeRate[] = [];
	let basis: string | null = null;

	for (const row of rows) {
		const heading = leftText(row).match(EXCHANGE_RATES_HEADING_RE);
		if (heading) {
			basis = heading[1] ?? null;
			continue;
		}

		const items = indentedItems(row);
		const pair = items[0]?.str.match(EXCHANGE_RATE_PAIR_RE);
		if (!pair) continue;
		const rate = parseAmount(items[1]?.str);
		if (rate === null) continue;
		rates.push({ from: pair[1] ?? "", to: pair[2] ?? "", rate });
	}

	return { rates, basis };
};

/**
 * The prose under the last table: what happened to the money, and any footnote
 * a fee description's marker points at.
 *
 * The settlement sentence has several wordings — the total has been debited,
 * the totals have been debited, it will be debited — so it is kept verbatim
 * rather than reduced to a flag it does not quite fit.
 */
export const parseNotes = (
	rows: readonly TextRow[],
): { settlementNote: string | null; footnotes: string[] } => {
	let settlementNote: string | null = null;
	const footnotes: string[] = [];

	for (const row of rows) {
		const text = leftText(row);
		if (!text) continue;
		if (FOOTNOTE_RE.test(text)) {
			footnotes.push(text);
			continue;
		}
		// The only line on the invoice that mentions the balance is this one; the
		// legal paragraph below it does not.
		if (!settlementNote && /\bbalance\b/i.test(text)) settlementNote = text;
	}

	return { settlementNote, footnotes };
};
