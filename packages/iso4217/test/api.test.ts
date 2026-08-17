import { describe, expect, it } from "vitest";

import type { AlphabeticCode } from "../src/types.js";
import {
	CURRENCIES,
	formatAmount,
	getByCode,
	getByCountry,
	getByNumericCode,
	isAlphabeticCode,
	isCountryCode,
	isNumericCode,
} from "../src/index.js";

describe("getByCode", () => {
	it("looks up a currency by uppercase alphabetic code", () => {
		const usd = getByCode("USD");
		expect(usd?.alphabeticCode).toBe("USD");
		expect(usd?.numericCode).toBe("840");
		expect(usd?.minorUnits).toBe(2);
		expect(usd?.name).toBe("US Dollar");
	});

	it("is case-insensitive and whitespace-tolerant", () => {
		expect(getByCode("usd")?.alphabeticCode).toBe("USD");
		expect(getByCode("  Eur  ")?.alphabeticCode).toBe("EUR");
		expect(getByCode("jpY")?.alphabeticCode).toBe("JPY");
	});

	it("returns undefined for unknown or malformed codes", () => {
		expect(getByCode("ZZZ")).toBeUndefined();
		expect(getByCode("US")).toBeUndefined();
		expect(getByCode("USDD")).toBeUndefined();
		expect(getByCode("123")).toBeUndefined();
		expect(getByCode("")).toBeUndefined();
	});

	it("returns the same frozen reference as CURRENCIES", () => {
		const usd = getByCode("USD");
		expect(usd).toBe(CURRENCIES.find((c) => c.alphabeticCode === "USD"));
	});
});

describe("getByNumericCode", () => {
	it("looks up by zero-padded numeric string", () => {
		expect(getByNumericCode("840")?.alphabeticCode).toBe("USD");
		expect(getByNumericCode("978")?.alphabeticCode).toBe("EUR");
	});

	it("accepts plain numbers", () => {
		expect(getByNumericCode(840)?.alphabeticCode).toBe("USD");
		expect(getByNumericCode(8)?.alphabeticCode).toBe("ALL"); // numeric 008
	});

	it("accepts unpadded, partially padded and whitespace-wrapped strings", () => {
		// JSDoc: `8`, "8", "008" and "08" all resolve identically.
		expect(getByNumericCode("8")?.alphabeticCode).toBe("ALL");
		expect(getByNumericCode("08")?.alphabeticCode).toBe("ALL");
		expect(getByNumericCode("48")?.alphabeticCode).toBe("BHD");
		expect(getByNumericCode(" 840 ")?.alphabeticCode).toBe("USD");
	});

	it("rejects non-integers and out-of-range values", () => {
		expect(getByNumericCode(-1)).toBeUndefined();
		expect(getByNumericCode(1000)).toBeUndefined();
		expect(getByNumericCode(3.14)).toBeUndefined();
		expect(getByNumericCode(Number.NaN)).toBeUndefined();
		expect(getByNumericCode("abc")).toBeUndefined();
		expect(getByNumericCode("")).toBeUndefined();
	});
});

describe("getByCountry", () => {
	it("returns every currency for a country", () => {
		const us = getByCountry("US");
		const codes = us.map((c) => c.alphabeticCode).sort();
		expect(codes).toEqual(["USD", "USN"]);
	});

	it("returns multiple currencies where applicable", () => {
		const ch = getByCountry("CH")
			.map((c) => c.alphabeticCode)
			.sort();
		expect(ch).toEqual(["CHE", "CHF", "CHW"]);
	});

	it("includes EUR for European Union (exceptionally reserved)", () => {
		const eu = getByCountry("EU");
		expect(eu.some((c) => c.alphabeticCode === "EUR")).toBe(true);
	});

	it("is case-insensitive, returning the same reference as the uppercase call", () => {
		expect(getByCountry("us")).toBe(getByCountry("US"));
		expect(getByCountry("Ch")).toBe(getByCountry("CH"));
	});

	it("returns a frozen empty array for unknown country codes", () => {
		const empty = getByCountry("ZZ");
		expect(empty.length).toBe(0);
		expect(Object.isFrozen(empty)).toBe(true);
	});
});

describe("type guards", () => {
	it("isAlphabeticCode accepts only exact uppercase matches", () => {
		expect(isAlphabeticCode("USD")).toBe(true);
		expect(isAlphabeticCode("usd")).toBe(false);
		expect(isAlphabeticCode("ZZZ")).toBe(false);
	});

	it("isNumericCode requires the zero-padded form", () => {
		expect(isNumericCode("840")).toBe(true);
		expect(isNumericCode("008")).toBe(true);
		expect(isNumericCode("8")).toBe(false);
		expect(isNumericCode("0840")).toBe(false);
	});

	it("isCountryCode requires exact uppercase alpha-2", () => {
		expect(isCountryCode("US")).toBe(true);
		expect(isCountryCode("us")).toBe(false);
		expect(isCountryCode("USA")).toBe(false);
	});
});

/** Digits after the decimal separator, per `Intl.NumberFormat.formatToParts`. */
const fractionDigitsOf = (formatted: string, locale: string, currency: string) => {
	const parts = new Intl.NumberFormat(locale, { style: "currency", currency });
	void parts;
	const decimal = new Intl.NumberFormat(locale)
		.formatToParts(1.5)
		.find((p) => p.type === "decimal")?.value;
	const idx = decimal === undefined ? -1 : formatted.lastIndexOf(decimal);
	if (idx === -1) return 0;
	return (formatted.slice(idx + 1).match(/\d/g) ?? []).length;
};

describe("formatAmount", () => {
	// Typed as tuples: a bare array widens `code` to `string | number`, which
	// formatAmount's AlphabeticCode parameter rejects.
	it.each<[AlphabeticCode, number]>([
		["USD", 2], // ISO 4217: cent
		["JPY", 0], // ISO 4217: no minor unit
		["BHD", 3], // ISO 4217: fils, thousandths
	])("pads and rounds %s to its ISO minor units (%i)", (code, digits) => {
		const out = formatAmount(1.5, code, { locale: "en-US" });
		expect(fractionDigitsOf(out, "en-US", code)).toBe(digits);
	});

	it("respects user-supplied fractionDigits", () => {
		const out = formatAmount(1, "USD", {
			locale: "en-US",
			minimumFractionDigits: 4,
			maximumFractionDigits: 4,
		});
		expect(fractionDigitsOf(out, "en-US", "USD")).toBe(4);
	});

	it("widens the maximum when only a larger minimum is given", () => {
		// Previously threw RangeError: minimumFractionDigits 4 > maximum 2.
		const out = formatAmount(1, "USD", {
			locale: "en-US",
			minimumFractionDigits: 4,
		});
		expect(fractionDigitsOf(out, "en-US", "USD")).toBe(4);
	});

	it("lowers the minimum when only a smaller maximum is given", () => {
		// Previously threw RangeError: maximumFractionDigits 0 < minimum 2.
		const out = formatAmount(1.4, "USD", {
			locale: "en-US",
			maximumFractionDigits: 0,
		});
		expect(fractionDigitsOf(out, "en-US", "USD")).toBe(0);
	});

	it.each(["XAU", "XXX"] as const)(
		"does not force a precision for %s, which has no minor unit",
		(code) => {
			// Locale default for a currency without minor units is at most 2 digits.
			const out = formatAmount(1.23456, code, { locale: "en-US" });
			expect(fractionDigitsOf(out, "en-US", code)).toBeLessThanOrEqual(2);
			// And a caller-supplied precision is honoured untouched.
			const wide = formatAmount(1.23456, code, {
				locale: "en-US",
				minimumFractionDigits: 5,
				maximumFractionDigits: 5,
			});
			expect(fractionDigitsOf(wide, "en-US", code)).toBe(5);
		},
	);

	it("throws for unknown codes", () => {
		// The type guard still allows the assertion at runtime; we accept the
		// cast here because the test exercises the runtime-safety branch.
		expect(() =>
			formatAmount(1, "ZZZ" as Parameters<typeof formatAmount>[1]),
		).toThrow(/Unknown ISO 4217 code/);
	});
});
