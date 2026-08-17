import { describe, expect, it } from "vitest";
import {
	columnText,
	COLUMNS,
	groupIntoRows,
	rowText,
	Y_TOLERANCE,
} from "../src/layout.js";
import type { TextItem } from "../src/types.js";

const item = (x: number, y: number, str: string): TextItem => ({ str, x, y });

describe("groupIntoRows", () => {
	it("orders rows top to bottom and items left to right", () => {
		const rows = groupIntoRows([
			item(200, 700, "second"),
			item(50, 700, "first"),
			item(50, 800, "above"),
		]);

		expect(rows.map(rowText)).toEqual(["above", "first second"]);
	});

	it.each([
		[Y_TOLERANCE - 1, 1],
		[Y_TOLERANCE, 1],
		[Y_TOLERANCE + 1, 2],
	])(
		"baselines %i apart form %i row(s): the tolerance is inclusive",
		(gap, rowCount) => {
			const rows = groupIntoRows([item(50, 700, "a"), item(200, 700 + gap, "b")]);

			expect(rows).toHaveLength(rowCount);
		},
	);

	it("does not mutate the input", () => {
		const items = [item(200, 700, "b"), item(50, 800, "a")];
		groupIntoRows(items);
		expect(items.map((entry) => entry.str)).toEqual(["b", "a"]);
	});
});

describe("COLUMNS", () => {
	it("tile the row without gaps or overlap, each half-open on the right", () => {
		const ordered = Object.values(COLUMNS);
		for (let index = 1; index < ordered.length; index++) {
			expect(ordered[index]!.min).toBe(ordered[index - 1]!.max);
		}
	});

	it("assigns an item on a boundary to exactly one column", () => {
		const boundary = COLUMNS.operationCode.min;
		const row = groupIntoRows([item(boundary, 700, "A-01.2025")])[0]!;

		expect(columnText(row, COLUMNS.registrationDate)).toBe("");
		expect(columnText(row, COLUMNS.operationCode)).toBe("A-01.2025");
	});
});

describe("columnText", () => {
	const row = groupIntoRows([
		item(50, 700, "31.01.2025"),
		item(130, 700, "A-01.2025"),
		item(220, 700, "20.02.2025"),
		item(350, 700, "927,41"),
	])[0]!;

	it("returns only what falls inside a column's range", () => {
		expect(columnText(row, COLUMNS.registrationDate)).toBe("31.01.2025");
		expect(columnText(row, COLUMNS.operationCode)).toBe("A-01.2025");
		expect(columnText(row, COLUMNS.effectiveDate)).toBe("20.02.2025");
		expect(columnText(row, COLUMNS.amountInFavor)).toBe("927,41");
	});

	it("returns an empty string for a column the row does not reach", () => {
		expect(columnText(row, COLUMNS.amountOwed)).toBe("");
	});
});
