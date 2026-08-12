/**
 * The only part of the package that touches a PDF. These invoices are generated
 * by Stripe and carry native text, so extraction is exact and no OCR is
 * involved.
 */
import { getDocumentProxy } from "unpdf";
import { groupIntoRows } from "./layout.js";
import type { TextItem, TextRow } from "./types.js";

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

const extractTextItems = async (page: PdfPage): Promise<TextItem[]> => {
	const content = await page.getTextContent();
	const items: TextItem[] = [];
	for (const item of content.items) {
		if (!("str" in item) || typeof item.str !== "string") continue;
		const str = item.str.trim();
		if (!str) continue;
		const x = Math.round(item.transform[4]);
		const width =
			"width" in item && typeof item.width === "number" ? item.width : 0;
		items.push({
			str,
			x,
			right: Math.round(x + width),
			y: Math.round(item.transform[5]),
		});
	}
	return items;
};

/**
 * Positioned text for a whole document.
 *
 * An account with many products or several settlement currencies runs to more
 * than one page. Rows are grouped per page and then concatenated, because Y
 * coordinates restart on each page and grouping across the document would fuse
 * unrelated lines.
 */
export const readPdf = async (
	source: ArrayBuffer | Uint8Array,
): Promise<{ items: TextItem[]; rows: TextRow[] }> => {
	const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
	const doc = await getDocumentProxy(bytes);

	const items: TextItem[] = [];
	const rows: TextRow[] = [];
	for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
		// Sequential on purpose: pages must land in document order, and the
		// underlying reader shares one worker, so Promise.all buys nothing.
		// oxlint-disable-next-line eslint/no-await-in-loop -- see above
		const page = await doc.getPage(pageNumber);
		// oxlint-disable-next-line eslint/no-await-in-loop -- see above
		const pageItems = await extractTextItems(page);
		items.push(...pageItems);
		rows.push(...groupIntoRows(pageItems));
	}

	return { items, rows };
};
