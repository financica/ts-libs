import { StripeTaxInvoiceParseError } from "./errors.js";
import { parseHeaderFields, parseIdentity, parseParties } from "./header.js";
import { rowText } from "./layout.js";
import { ACCOUNT_ID_RE, REVERSE_CHARGE_NOTE, TITLE } from "./patterns.js";
import { readPdf } from "./pdf.js";
import { parseSections } from "./sections.js";
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

	const fields = parseHeaderFields(rows);
	const sections = parseSections(rows);
	if (sections.length === 0) {
		throw new StripeTaxInvoiceParseError(
			"missing_field",
			"Stripe tax invoice has no fee table",
		);
	}

	return {
		...parseIdentity(fields),
		...parseParties(rows, fields),
		reverseCharge: fullText.includes(REVERSE_CHARGE_NOTE),
		sections,
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
