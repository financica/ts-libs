/**
 * Integrity checks on the generated dataset. These assertions make it
 * impossible to ship broken data: regenerating from a bad XML will either
 * throw in the generator or fail these tests in CI.
 */

import { describe, expect, it } from "vitest";

import { ALPHABETIC_CODES, COUNTRY_CODES, NUMERIC_CODES } from "../src/codes.js";
import { CURRENCIES, PUBLISHED_AT } from "../src/data.js";

describe("dataset integrity", () => {
	it("has at least as many currencies as the 2026-01-01 revision", () => {
		// The 2026-01-01 revision ships 178 codes; future revisions should only
		// grow the list. A drop indicates bad parsing.
		expect(CURRENCIES.length).toBeGreaterThanOrEqual(178);
	});

	it("PUBLISHED_AT is a YYYY-MM-DD date", () => {
		expect(PUBLISHED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("code tuples match CURRENCIES length", () => {
		expect(ALPHABETIC_CODES.length).toBe(CURRENCIES.length);
		expect(NUMERIC_CODES.length).toBe(CURRENCIES.length);
	});

	it("is sorted ascending by alphabetic code", () => {
		for (let i = 1; i < CURRENCIES.length; i++) {
			const prev = CURRENCIES[i - 1]!;
			const curr = CURRENCIES[i]!;
			expect(curr.alphabeticCode > prev.alphabeticCode).toBe(true);
		}
	});

	it("alphabetic codes are unique, 3 uppercase letters", () => {
		const seen = new Set<string>();
		for (const { alphabeticCode } of CURRENCIES) {
			expect(alphabeticCode).toMatch(/^[A-Z]{3}$/);
			expect(seen.has(alphabeticCode)).toBe(false);
			seen.add(alphabeticCode);
		}
	});

	it("numeric codes are unique, zero-padded 3-digit strings", () => {
		const seen = new Set<string>();
		for (const { numericCode } of CURRENCIES) {
			expect(numericCode).toMatch(/^\d{3}$/);
			expect(seen.has(numericCode)).toBe(false);
			seen.add(numericCode);
		}
	});

	it("minorUnits is null or a non-negative integer", () => {
		for (const { alphabeticCode, minorUnits } of CURRENCIES) {
			if (minorUnits === null) continue;
			expect(Number.isInteger(minorUnits), alphabeticCode).toBe(true);
			expect(minorUnits).toBeGreaterThanOrEqual(0);
			// Spec allows up to 4 (e.g. CLF, UYW).
			expect(minorUnits).toBeLessThanOrEqual(4);
		}
	});

	it("metals have null minorUnits and kind='metal'", () => {
		for (const code of ["XAU", "XAG", "XPT", "XPD"] as const) {
			const c = CURRENCIES.find((x) => x.alphabeticCode === code);
			expect(c?.kind).toBe("metal");
			expect(c?.minorUnits).toBeNull();
			expect(c?.countryCodes).toEqual([]);
		}
	});

	it("fund currencies are flagged isFund=true and kind='fund'", () => {
		const funds = CURRENCIES.filter((c) => c.isFund);
		expect(funds.length).toBeGreaterThan(0);
		for (const c of funds) expect(c.kind).toBe("fund");
	});

	it("XXX is the no-currency sentinel", () => {
		const xxx = CURRENCIES.find((c) => c.alphabeticCode === "XXX");
		expect(xxx?.kind).toBe("special");
		expect(xxx?.minorUnits).toBeNull();
		expect(xxx?.countryCodes).toEqual([]);
	});

	it("country codes are valid ISO 3166-1 alpha-2 shape", () => {
		for (const code of COUNTRY_CODES) {
			expect(code).toMatch(/^[A-Z]{2}$/);
		}
	});

	it("every currency's countryCodes are known and sorted", () => {
		const known = new Set(COUNTRY_CODES);
		for (const { alphabeticCode, countryCodes } of CURRENCIES) {
			for (const code of countryCodes) {
				expect(known.has(code), `${alphabeticCode} → ${code}`).toBe(true);
			}
			const sorted = [...countryCodes].sort();
			expect(countryCodes).toEqual(sorted);
		}
	});

	it("well-known codes exist with expected minorUnits", () => {
		const expectations: Record<string, number | null> = {
			USD: 2,
			EUR: 2,
			GBP: 2,
			JPY: 0, // Yen has no minor unit.
			BHD: 3, // Dinar family uses fils (thousandths).
			IQD: 3,
			JOD: 3,
			KWD: 3,
			OMR: 3,
			TND: 3,
			CLF: 4, // Fomento.
			UYW: 4,
			XAU: null,
			XTS: null,
			XXX: null,
		};
		for (const [code, expected] of Object.entries(expectations)) {
			const c = CURRENCIES.find((x) => x.alphabeticCode === code);
			expect(c, code).toBeDefined();
			expect(c?.minorUnits, code).toBe(expected);
		}
	});

	it("every currency is Object.freeze'd (immutable)", () => {
		expect(Object.isFrozen(CURRENCIES)).toBe(true);
	});
});
