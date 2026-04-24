import { describe, expect, it } from "vitest";

import {
	getHistoricByCode,
	getHistoricByNumericCode,
	HISTORIC_CURRENCIES,
	HISTORIC_PUBLISHED_AT,
} from "../src/historic.js";

describe("historic dataset", () => {
	it("is non-empty and Object.freeze'd", () => {
		expect(HISTORIC_CURRENCIES.length).toBeGreaterThan(0);
		expect(Object.isFrozen(HISTORIC_CURRENCIES)).toBe(true);
	});

	it("has a valid publication date", () => {
		expect(HISTORIC_PUBLISHED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("entries have valid shape", () => {
		for (const h of HISTORIC_CURRENCIES) {
			expect(h.alphabeticCode).toMatch(/^[A-Z]{3}$/);
			if (h.numericCode !== null) expect(h.numericCode).toMatch(/^\d{3}$/);
			expect(h.name.length).toBeGreaterThan(0);
			// The spec uses YYYY, YYYY-MM, "YYYY[-MM] to YYYY[-MM]", or the
			// dash-delimited "YYYY-YYYY" range for entries phased out across
			// multiple months.
			expect(h.withdrawalDate).toMatch(
				/^\d{4}(-\d{2})?((-| to )\d{4}(-\d{2})?)?$/,
			);
		}
	});
});

describe("getHistoricByCode", () => {
	it("returns historic records for a withdrawn code", () => {
		const ang = getHistoricByCode("ANG");
		expect(ang.length).toBeGreaterThan(0);
		expect(ang.every((c) => c.alphabeticCode === "ANG")).toBe(true);
	});

	it("returns multiple records when a code was withdrawn more than once", () => {
		// ANG was withdrawn once with Netherlands Antilles, again with Curaçao/
		// Sint Maarten when XCG took over in 2025.
		const ang = getHistoricByCode("ANG");
		expect(ang.length).toBeGreaterThanOrEqual(2);
	});

	it("is case-insensitive and trims whitespace", () => {
		expect(getHistoricByCode("ang").length).toBeGreaterThan(0);
		expect(getHistoricByCode("  SUR  ").length).toBeGreaterThan(0);
	});

	it("returns a frozen empty array for unknown codes", () => {
		const empty = getHistoricByCode("QQQ");
		expect(empty.length).toBe(0);
		expect(Object.isFrozen(empty)).toBe(true);
	});
});

describe("getHistoricByNumericCode", () => {
	it("looks up by numeric code", () => {
		const matches = getHistoricByNumericCode("532");
		// 532 was ANG (Netherlands Antillean Guilder); it's since been reassigned
		// to XCG, but historic records still reference it.
		expect(matches.length).toBeGreaterThan(0);
	});

	it("accepts a plain number", () => {
		expect(getHistoricByNumericCode(532).length).toBeGreaterThan(0);
	});

	it("rejects garbage input", () => {
		expect(getHistoricByNumericCode(-1).length).toBe(0);
		expect(getHistoricByNumericCode("abc").length).toBe(0);
	});
});
