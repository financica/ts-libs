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

	it("joins baselines that differ by less than the tolerance", () => {
		const rows = groupIntoRows([
			item(50, 700, "a"),
			item(200, 700 + Y_TOLERANCE - 1, "b"),
		]);

		expect(rows).toHaveLength(1);
		expect(rowText(rows[0]!)).toBe("a b");
	});

	it("keeps baselines further apart than the tolerance separate", () => {
		const rows = groupIntoRows([
			item(50, 700, "a"),
			item(200, 700 + Y_TOLERANCE + 1, "b"),
		]);

		expect(rows).toHaveLength(2);
	});

	it("does not mutate the input", () => {
		const items = [item(200, 700, "b"), item(50, 800, "a")];
		groupIntoRows(items);
		expect(items.map((entry) => entry.str)).toEqual(["b", "a"]);
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
