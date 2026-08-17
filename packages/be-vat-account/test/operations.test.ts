import { describe, expect, it } from "vitest";
import { declarationPeriodEnd, operationKind } from "../src/operations.js";

describe("declarationPeriodEnd", () => {
	it.each([
		["A-06.2025", "2025-06-30"],
		["A-09.2025", "2025-09-30"],
		["A-12.2025", "2025-12-31"],
		// The month's real length, leap years included.
		["A-02.2024", "2024-02-29"],
	])("dates %s at the end of the period it declares", (code, expected) => {
		expect(declarationPeriodEnd(code)).toBe(expected);
	});

	it.each(["H", "A-13.2025", "", null, undefined])("returns null for %o", (code) => {
		expect(declarationPeriodEnd(code)).toBeNull();
	});
});

describe("operationKind", () => {
	it.each([
		["A-12.2025", "declaration"],
		["H", "settlement"],
		["N", "settlement"],
		["L", "late-interest"],
		["M", "late-interest"],
		["U", "late-interest"],
		["P", "fine"],
		["R", "fine"],
		["V", "fine"],
		["Y", "other"],
		["C", "other"],
		[null, "other"],
	] as const)("reads %o as %s", (code, expected) => {
		expect(operationKind(code)).toBe(expected);
	});

	it("reads only the leading letter, whatever the suffix and casing", () => {
		expect(operationKind(" a-06.2025 ")).toBe("declaration");
		expect(operationKind("h-01")).toBe("settlement");
	});
});
