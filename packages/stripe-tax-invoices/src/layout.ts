/**
 * The invoice is a table drawn with absolute positions, not a tagged one, so
 * rows come from shared baselines and columns from X coordinates. Everything
 * here is pure: give it positioned text and it gives back rows.
 *
 * Two coordinates carry all the meaning:
 *
 * - **the label column.** Party details and fee descriptions are printed
 *   against the left margin; header labels and the totals block sit in an
 *   indented second column. Which side a row's first item falls on is what
 *   tells a fee line from a total.
 * - **the right edge of an amount.** `Fee Amount` and `VAT` are right-aligned
 *   under their headings, so an amount is assigned to whichever heading it ends
 *   closest to. Left edges move with the width of the number and say nothing.
 */
import type { TextItem, TextRow } from "./types.js";

/**
 * Where the indented second column starts. Left-margin text lands around x=55,
 * the indented column at x=316; anything between is unclaimed.
 */
export const LABEL_COLUMN_SPLIT_X = 200;

/** How far two items' baselines may differ and still count as one row. */
export const Y_TOLERANCE = 3;

/**
 * Group positioned text into rows, top to bottom, each row ordered left to
 * right. Call this per page: Y coordinates restart on every page, so grouping
 * across a whole document would merge unrelated lines.
 */
export const groupIntoRows = (items: readonly TextItem[]): TextRow[] => {
	const rows: TextRow[] = [];
	// Descending Y is top-to-bottom in PDF coordinates.
	const sorted = [...items].sort((a, b) => b.y - a.y);

	for (const item of sorted) {
		const existing = rows.find((row) => Math.abs(row.y - item.y) <= Y_TOLERANCE);
		if (existing) {
			existing.items.push(item);
		} else {
			rows.push({ y: item.y, items: [item] });
		}
	}

	for (const row of rows) {
		row.items.sort((a, b) => a.x - b.x);
	}
	rows.sort((a, b) => b.y - a.y);

	return rows;
};

/** Everything printed on a row, joined in reading order. */
export const rowText = (row: TextRow): string =>
	row.items.map((item) => item.str).join(" ");

/** The part of a row printed against the left margin. */
export const leftText = (row: TextRow): string =>
	row.items
		.filter((item) => item.x < LABEL_COLUMN_SPLIT_X)
		.map((item) => item.str)
		.join(" ")
		.trim();

/** The runs of a row printed in the indented column and beyond. */
export const indentedItems = (row: TextRow): TextItem[] =>
	row.items.filter((item) => item.x >= LABEL_COLUMN_SPLIT_X);

/** The part of a row printed in the indented column and beyond. */
export const indentedText = (row: TextRow): string =>
	indentedItems(row)
		.map((item) => item.str)
		.join(" ")
		.trim();
