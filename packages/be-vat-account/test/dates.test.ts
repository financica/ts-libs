import { describe, expect, it } from "vitest";
import {
	anyDateToIso,
	dotDateToIso,
	longDateToIso,
	slashDateToIso,
} from "../src/dates.js";

describe("date conversion", () => {
	it.each([
		["31.01.2025", "2025-01-31"],
		["01.12.2021", "2021-12-01"],
	])("reads %s as a dotted date", (input, expected) => {
		expect(dotDateToIso(input)).toBe(expected);
		expect(anyDateToIso(input)).toBe(expected);
	});

	it.each([
		["20/05/2021", "2021-05-20"],
		["07/11/2022", "2022-11-07"],
	])("reads %s as a slashed date", (input, expected) => {
		expect(slashDateToIso(input)).toBe(expected);
		expect(anyDateToIso(input)).toBe(expected);
	});

	it("rejects the wrong separator for a given form", () => {
		expect(dotDateToIso("20/05/2021")).toBeNull();
		expect(slashDateToIso("31.01.2025")).toBeNull();
	});

	it.each([
		["2 janvier 2025", "2025-01-02"],
		["7 février 2025", "2025-02-07"],
		["31 août 2024", "2024-08-31"],
		["7 februari 2025", "2025-02-07"],
		["1 december 2022", "2022-12-01"],
	])("reads the long form %s", (input, expected) => {
		expect(longDateToIso(input)).toBe(expected);
	});

	it("accepts an unaccented month name, which extraction sometimes yields", () => {
		expect(longDateToIso("7 fevrier 2025")).toBe("2025-02-07");
		expect(longDateToIso("31 aout 2024")).toBe("2024-08-31");
	});

	it.each(["", "février 2025", "7 brumaire 2025", "7 février"])(
		"returns null for %o",
		(input) => {
			expect(longDateToIso(input)).toBeNull();
		},
	);
});
