import { StripeTaxInvoiceParseError } from "./errors.js";
import {
	parseHeaderFields,
	parseIdentity,
	parseParties,
	parseReverseChargeNote,
} from "./header.js";
import { leftText, rowText } from "./layout.js";
import { ACCOUNT_ID_RE, CURRENCY_HEADING_RE, TITLE } from "./patterns.js";
import { readPdf } from "./pdf.js";
import { parseSections } from "./sections.js";
import { parseExchangeRates, parseInvoiceTotals, parseNotes } from "./summary.js";
import type { StripeTaxInvoice, TextItem, TextRow } from "./types.js";

const looksLikeTaxInvoice = (fullText: string): boolean =>
	fullText.includes(TITLE) && ACCOUNT_ID_RE.test(fullText);

/**
 * Parse a tax invoice from already-extracted text.
 *
 * Use this when the positioned text is yours already, from your own PDF
 * pipeline. Rows must be grouped per page and concatenated in page order;
 * `parseStripeTaxInvoice` does that for you.
 *
 * @throws {StripeTaxInvoiceParseError} if the text is not a Stripe tax invoice,
 * or a required field is missing.
 */
export const parseStripeTaxInvoiceRows = (
	items: readonly TextItem[],
	rows: readonly TextRow[],
): StripeTaxInvoice => {
	const fullText = items.map((item) => item.str).join(" ");
	if (!looksLikeTaxInvoice(fullText)) {
		throw new StripeTaxInvoiceParseError(
			"not_a_stripe_tax_invoice",
			"Not a Stripe tax invoice",
		);
	}

	// Everything above the first fee table is the identity block. Cutting there
	// keeps the totals — which share the label column — out of the header.
	const tableStart = rows.findIndex((row) => CURRENCY_HEADING_RE.test(leftText(row)));
	const headerRows = tableStart === -1 ? rows : rows.slice(0, tableStart);

	const sections = parseSections(rows);
	if (sections.length === 0) {
		throw new StripeTaxInvoiceParseError(
			"missing_field",
			"Stripe tax invoice has no fee table",
		);
	}

	const fields = parseHeaderFields(headerRows);
	const reverseChargeNote = parseReverseChargeNote(headerRows);
	const { rates, basis } = parseExchangeRates(rows);

	return {
		...parseIdentity(fields),
		...parseParties(headerRows, fields),
		reverseCharge: reverseChargeNote !== null,
		reverseChargeNote,
		sections,
		totals: parseInvoiceTotals(rows, sections),
		exchangeRates: rates,
		exchangeRateBasis: basis,
		...parseNotes(rows),
	};
};

/**
 * Parse a Stripe tax invoice PDF — the monthly invoice for Stripe's own fees,
 * downloaded from the Dashboard under Settings › Plans and fees › Invoice
 * history.
 *
 * @throws {StripeTaxInvoiceParseError} if the PDF is not a Stripe tax invoice,
 * or a required field is missing.
 */
export const parseStripeTaxInvoice = async (
	pdf: ArrayBuffer | Uint8Array,
): Promise<StripeTaxInvoice> => {
	const { items, rows } = await readPdf(pdf);
	return parseStripeTaxInvoiceRows(items, rows);
};

/**
 * Whether a PDF is a Stripe tax invoice, without parsing it.
 *
 * Cheap enough to use as a format gate in front of a multi-format importer: it
 * reads the text but does none of the header or table work, and never throws.
 */
export const isStripeTaxInvoice = async (
	pdf: ArrayBuffer | Uint8Array,
): Promise<boolean> => {
	try {
		const { rows } = await readPdf(pdf);
		return looksLikeTaxInvoice(rows.map(rowText).join(" "));
	} catch {
		return false;
	}
};
