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

	it("code tuples mirror CURRENCIES exactly, in the same order", () => {
		// generate.ts emits both tuples from the same sorted list; NUMERIC_CODES
		// is documented as "sorted to match ALPHABETIC_CODES".
		expect([...ALPHABETIC_CODES]).toEqual(CURRENCIES.map((c) => c.alphabeticCode));
		expect([...NUMERIC_CODES]).toEqual(CURRENCIES.map((c) => c.numericCode));
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

	it("isFund and kind='fund' agree both ways", () => {
		const funds = CURRENCIES.filter((c) => c.isFund);
		expect(funds.length).toBeGreaterThan(0);
		for (const c of CURRENCIES)
			expect(c.isFund, c.alphabeticCode).toBe(c.kind === "fund");
	});

	it("metals and special codes carry no country codes", () => {
		// Funds (BOV, CHE, USN...) do belong to a country; metals and X-codes do not.
		for (const c of CURRENCIES) {
			if (c.kind === "metal" || c.kind === "special") {
				expect(c.countryCodes, c.alphabeticCode).toEqual([]);
			}
		}
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

	it("COUNTRY_CODES is exactly the sorted set of every currency's countries", () => {
		const union = [...new Set(CURRENCIES.flatMap((c) => c.countryCodes))].sort();
		expect([...COUNTRY_CODES]).toEqual(union);
	});

	it("every currency's countryCodes are sorted", () => {
		for (const { countryCodes } of CURRENCIES) {
			expect(countryCodes).toEqual([...countryCodes].sort());
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

	it("the array and every currency in it are Object.freeze'd (immutable)", () => {
		expect(Object.isFrozen(CURRENCIES)).toBe(true);
		for (const c of CURRENCIES)
			expect(Object.isFrozen(c), c.alphabeticCode).toBe(true);
	});
});
