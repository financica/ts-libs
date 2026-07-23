import { describe, expect, it } from "vitest";
import {
	EINVOICING_PROFILE_COUNTRIES,
	getCountryEInvoicingProfile,
	getPeppolIdentifierSchemes,
} from "../src/countries";
import { getPeppolCountryScheme } from "../src/schemes";

describe("getCountryEInvoicingProfile", () => {
	it("returns the profile for known countries, case-insensitively", () => {
		expect(getCountryEInvoicingProfile("BE")?.companyIdentifierScheme).toBe("0208");
		expect(getCountryEInvoicingProfile(" no ")?.companyIdentifierScheme).toBe(
			"0192",
		);
		expect(getCountryEInvoicingProfile("nl")?.vatIdentifierScheme).toBe("9944");
	});

	it("returns null for unknown or empty input", () => {
		expect(getCountryEInvoicingProfile("XX")).toBeNull();
		expect(getCountryEInvoicingProfile("")).toBeNull();
		expect(getCountryEInvoicingProfile(null)).toBeNull();
		expect(getCountryEInvoicingProfile(undefined)).toBeNull();
	});

	it("routes Norway and Denmark on the company scheme alone", () => {
		expect(getCountryEInvoicingProfile("NO")?.vatIdentifierScheme).toBeNull();
		expect(getCountryEInvoicingProfile("DK")?.vatIdentifierScheme).toBeNull();
	});
});

describe("getPeppolIdentifierSchemes", () => {
	it("uses the verified profile for profiled countries", () => {
		expect(getPeppolIdentifierSchemes("BE")).toEqual({
			companyIdentifierScheme: "0208",
			vatIdentifierScheme: "9925",
		});
		expect(getPeppolIdentifierSchemes("nl")).toEqual({
			companyIdentifierScheme: "0106",
			vatIdentifierScheme: "9944",
		});
	});

	it("preserves the null VAT scheme for company-scheme-only countries", () => {
		expect(getPeppolIdentifierSchemes("NO")).toEqual({
			companyIdentifierScheme: "0192",
			vatIdentifierScheme: null,
		});
		expect(getPeppolIdentifierSchemes("DK")).toEqual({
			companyIdentifierScheme: "0184",
			vatIdentifierScheme: null,
		});
	});

	it("falls back to the country's own VAT-based addressing scheme when unprofiled", () => {
		// Luxembourg: no full profile, so its VAT scheme must be its own 9938 —
		// never a provider's Belgian 9925 default.
		expect(getPeppolIdentifierSchemes("LU")).toEqual({
			companyIdentifierScheme: null,
			vatIdentifierScheme: "9938",
		});
		expect(getPeppolIdentifierSchemes("DE")?.vatIdentifierScheme).toBe("9930");
		expect(getPeppolIdentifierSchemes("fr")?.vatIdentifierScheme).toBe("9957");
	});

	it("returns null for a country Peppol does not reach", () => {
		expect(getPeppolIdentifierSchemes("CA")).toBeNull();
		expect(getPeppolIdentifierSchemes("")).toBeNull();
		expect(getPeppolIdentifierSchemes(null)).toBeNull();
	});
});

describe("profiles stay consistent with PEPPOL_COUNTRY_SCHEMES", () => {
	// The schemes table answers "which EAS do you address this country by":
	// the VAT-based scheme when one exists, else the national registry scheme.
	// The profiles carry both facts; this pins the two tables together so a
	// correction in one cannot silently diverge from the other.
	it.each(EINVOICING_PROFILE_COUNTRIES.map((country) => [country]))(
		"%s addressing scheme matches",
		(country) => {
			const profile = getCountryEInvoicingProfile(country);
			const scheme = getPeppolCountryScheme(country);
			expect(profile).not.toBeNull();
			expect(scheme).not.toBeNull();
			expect(scheme?.scheme).toBe(
				profile?.vatIdentifierScheme ?? profile?.companyIdentifierScheme,
			);
		},
	);
});
