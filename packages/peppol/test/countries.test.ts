import { describe, expect, it } from "vitest";
import {
	EINVOICING_PROFILE_COUNTRIES,
	getCountryEInvoicingProfile,
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
