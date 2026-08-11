import { describe, expect, it } from "vitest";
import { EUROPEAN_AMOUNT_RE, parseLocalizedAmount } from "../src/amount.js";

describe("parseLocalizedAmount", () => {
	it.each([
		["0,00", 0],
		["16,89", 16.89],
		["2.561,66", 2561.66],
		["1.234.567,89", 1234567.89],
	])("reads the European form %s", (input, expected) => {
		expect(parseLocalizedAmount(input)).toBe(expected);
	});

	it("reads the Anglo form, so a mixed-source caller needs no branch", () => {
		expect(parseLocalizedAmount("1,234.56")).toBe(1234.56);
		expect(parseLocalizedAmount("1.234.567")).toBe(1234567);
	});

	it("treats a lone comma before three digits as a thousands group", () => {
		expect(parseLocalizedAmount("1,234")).toBe(1234);
		expect(parseLocalizedAmount("1,23")).toBe(1.23);
	});

	it("strips decoration extraction leaves attached", () => {
		expect(parseLocalizedAmount("€ 2.561,66")).toBe(2561.66);
		expect(parseLocalizedAmount("2 561,66")).toBe(2561.66);
	});

	it("moves a trailing minus to the front", () => {
		expect(parseLocalizedAmount("927,41-")).toBe(-927.41);
	});

	it.each(["", "   ", "n/a", "1-2-3"])("returns null for %o", (input) => {
		expect(parseLocalizedAmount(input)).toBeNull();
	});

	it("returns null for nullish input", () => {
		expect(parseLocalizedAmount(null)).toBeNull();
		expect(parseLocalizedAmount(undefined)).toBeNull();
	});
});

describe("EUROPEAN_AMOUNT_RE", () => {
	it("matches only a bare printed amount", () => {
		expect(EUROPEAN_AMOUNT_RE.test("2.561,66")).toBe(true);
		expect(EUROPEAN_AMOUNT_RE.test("0,00")).toBe(true);
		// Anything else in the cell means the cell is not an amount.
		expect(EUROPEAN_AMOUNT_RE.test("Solde 2.561,66")).toBe(false);
		expect(EUROPEAN_AMOUNT_RE.test("2561.66")).toBe(false);
		expect(EUROPEAN_AMOUNT_RE.test("2.561,6")).toBe(false);
	});
});
