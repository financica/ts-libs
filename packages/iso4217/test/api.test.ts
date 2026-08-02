import { describe, expect, it } from "vitest";

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

	it("accepts unpadded strings", () => {
		expect(getByNumericCode("8")?.alphabeticCode).toBe("ALL");
		expect(getByNumericCode("48")?.alphabeticCode).toBe("BHD");
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

	it("is case-insensitive", () => {
		expect(
			getByCountry("us")
				.map((c) => c.alphabeticCode)
				.sort(),
		).toEqual(["USD", "USN"]);
		expect(getByCountry("Ch").length).toBe(3);
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

describe("formatAmount", () => {
	it("uses USD's 2 minor units by default", () => {
		const out = formatAmount(1234.5, "USD", { locale: "en-US" });
		expect(out).toBe("$1,234.50");
	});

	it("uses JPY's 0 minor units by default", () => {
		const out = formatAmount(1234.5, "JPY", { locale: "en-US" });
		// JPY has no subunit — Intl truncates/rounds to the integer.
		expect(out).toBe("¥1,235");
	});

	it("uses BHD's 3 minor units", () => {
		const out = formatAmount(1.5, "BHD", { locale: "en-US" });
		expect(out).toContain("1.500");
	});

	it("respects user-supplied fractionDigits", () => {
		const out = formatAmount(1, "USD", {
			locale: "en-US",
			minimumFractionDigits: 4,
			maximumFractionDigits: 4,
		});
		expect(out).toBe("$1.0000");
	});

	it("throws for unknown codes", () => {
		// The type guard still allows the assertion at runtime; we accept the
		// cast here because the test exercises the runtime-safety branch.
		expect(() =>
			formatAmount(1, "ZZZ" as Parameters<typeof formatAmount>[1]),
		).toThrow(/Unknown ISO 4217 code/);
	});
});
