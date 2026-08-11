import { parseEntries } from "./entries.js";
import { VatAccountParseError } from "./errors.js";
import { parseHeader } from "./header.js";
import { rowText } from "./layout.js";
import { PFORM671_MARKER, TITLE_FR, TITLE_NL } from "./patterns.js";
import { readPdf } from "./pdf.js";
import type { TextItem, TextRow, VatAccountStatement } from "./types.js";

const looksLikeStatement = (fullText: string): boolean =>
	fullText.includes(PFORM671_MARKER) ||
	fullText.includes(TITLE_FR) ||
	fullText.includes(TITLE_NL);

/**
 * Parse a statement from already-extracted text.
 *
 * Use this when the PDF text is yours already — from your own pipeline, or from
 * a page-image OCR of a scan. Rows must be grouped per page and concatenated in
 * page order; `parseVatAccountStatement` does that for you.
 *
 * @throws {VatAccountParseError} if the text is not a statement, or a required
 * header field is missing.
 */
export const parseVatAccountStatementRows = (
	items: readonly TextItem[],
	rows: readonly TextRow[],
): VatAccountStatement => {
	const fullText = items.map((item) => item.str).join(" ");
	if (!looksLikeStatement(fullText)) {
		throw new VatAccountParseError(
			"not_a_vat_statement",
			"Not a Belgian VAT account statement",
		);
	}

	return { header: parseHeader(fullText, rows), entries: parseEntries(rows) };
};

/**
 * Parse a Belgian VAT account statement PDF, in either the PFORM671 (Q4 2022
 * onwards) or the legacy layout, in French or Dutch.
 *
 * @throws {VatAccountParseError} if the PDF is not a statement, or a required
 * header field is missing.
 */
export const parseVatAccountStatement = async (
	pdf: ArrayBuffer | Uint8Array,
): Promise<VatAccountStatement> => {
	const { items, rows } = await readPdf(pdf);
	return parseVatAccountStatementRows(items, rows);
};

/**
 * Whether a PDF is a Belgian VAT account statement, without parsing it.
 *
 * Cheap enough to use as a format gate in front of a multi-format importer: it
 * reads the text but does none of the header or table work, and never throws.
 */
export const isVatAccountStatement = async (
	pdf: ArrayBuffer | Uint8Array,
): Promise<boolean> => {
	try {
		const { rows } = await readPdf(pdf);
		return looksLikeStatement(rows.map(rowText).join(" "));
	} catch {
		return false;
	}
};
