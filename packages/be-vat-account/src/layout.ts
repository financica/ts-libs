/**
 * The statement is a table drawn with absolute positions, not a tagged one, so
 * columns are recovered from X coordinates and rows from shared baselines.
 * Everything here is pure: give it positioned text and it gives back rows.
 */
import type { TextItem, TextRow } from "./types.js";

/** X ranges each column occupies, from measuring real statements. */
export const COLUMNS = {
	registrationDate: { min: 40, max: 120 },
	operationCode: { min: 120, max: 210 },
	effectiveDate: { min: 210, max: 310 },
	amountInFavor: { min: 310, max: 420 },
	amountOwed: { min: 420, max: 560 },
} as const;

/** How far two items' baselines may differ and still count as one row. */
export const Y_TOLERANCE = 4;

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

/** Just the part of a row falling inside one column. */
export const columnText = (
	row: TextRow,
	column: { min: number; max: number },
): string =>
	row.items
		.filter((item) => item.x >= column.min && item.x < column.max)
		.map((item) => item.str)
		.join(" ")
		.trim();
