import { describe, expect, it } from "vitest";
import { longDateToIso, monthYearToIso } from "../src/dates.js";

describe("longDateToIso", () => {
	it.each([
		["Sep 1, 2025", "2025-09-01"],
		["May 31, 2026", "2026-05-31"],
		["Jan 1, 2026", "2026-01-01"],
		["September 1, 2025", "2025-09-01"],
		["Sept 1, 2025", "2025-09-01"],
	])("reads %s", (printed, expected) => {
		expect(longDateToIso(printed)).toBe(expected);
	});

	it.each([["Aug 2025"], ["2025-09-01"], ["Mai 1, 2026"], [""]])(
		"refuses %s",
		(printed) => {
			expect(longDateToIso(printed)).toBeNull();
		},
	);
});

describe("monthYearToIso", () => {
	it.each([
		["Aug 2025", "2025-08"],
		["Dec 2025", "2025-12"],
		["July 2026", "2026-07"],
	])("reads %s", (printed, expected) => {
		expect(monthYearToIso(printed)).toBe(expected);
	});

	it.each([["Sep 1, 2025"], ["2025-08"], ["Aout 2025"]])("refuses %s", (printed) => {
		expect(monthYearToIso(printed)).toBeNull();
	});
});
