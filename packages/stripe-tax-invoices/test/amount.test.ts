import { describe, expect, it } from "vitest";
import { parseAmount } from "../src/amount.js";

describe("parseAmount", () => {
	it.each([
		["€0.00", 0],
		["€40.62", 40.62],
		["€1,242.00", 1242],
		["$8,800.00", 8800],
		["£1,234,567.89", 1234567.89],
		["A$5.00", 5],
		["¥1,234", 1234],
		["45.59", 45.59],
		// The balance row is printed with an en dash, not a hyphen.
		["–€45.59", -45.59],
		["-€45.59", -45.59],
		["−€45.59", -45.59],
	])("reads %s", (printed, expected) => {
		expect(parseAmount(printed)).toBe(expected);
	});

	it.each([
		// A month in the neighbouring column must not read as the year.
		["Aug 2025"],
		["Sep 1, 2025"],
		["Stripe Fees"],
		["acct_1EXAMPLE0000000000"],
		["IE 3206488LH"],
		[""],
		// European formatting is not something this document produces, and
		// guessing at it would be a hundred-fold error.
		["1.242,00"],
		["1,24"],
	])("refuses %s", (printed) => {
		expect(parseAmount(printed)).toBeNull();
	});

	it("refuses nothing", () => {
		expect(parseAmount(null)).toBeNull();
		expect(parseAmount(undefined)).toBeNull();
	});
});
