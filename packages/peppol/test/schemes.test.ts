import { describe, expect, it } from "vitest";
import { getPeppolCountryScheme, PEPPOL_COUNTRY_SCHEMES } from "../src/schemes";

describe("getPeppolCountryScheme", () => {
	it("resolves known countries to their EAS scheme", () => {
		expect(getPeppolCountryScheme("DE")?.scheme).toBe("9930");
		expect(getPeppolCountryScheme("NO")?.scheme).toBe("0192");
		expect(getPeppolCountryScheme("IT")?.scheme).toBe("0211");
	});

	it("is case- and whitespace-insensitive", () => {
		expect(getPeppolCountryScheme(" be ")?.country).toBe("BE");
	});

	it("returns null for unknown or empty input", () => {
		expect(getPeppolCountryScheme("ZZ")).toBeNull();
		expect(getPeppolCountryScheme(null)).toBeNull();
	});
});

describe("PEPPOL_COUNTRY_SCHEMES", () => {
	it("has one entry per country with a well-formed EAS code", () => {
		const countries = PEPPOL_COUNTRY_SCHEMES.map((entry) => entry.country);
		expect(new Set(countries).size).toBe(countries.length);
		for (const entry of PEPPOL_COUNTRY_SCHEMES) {
			expect(entry.country).toMatch(/^[A-Z]{2}$/);
			expect(entry.scheme).toMatch(/^\d{4}$/);
			expect(entry.example.length).toBeGreaterThan(0);
		}
	});
});
