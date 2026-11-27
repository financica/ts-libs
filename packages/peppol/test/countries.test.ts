import { describe, expect, it } from "vitest";
import {
	EINVOICING_PROFILE_COUNTRIES,
	getCountryEInvoicingProfile,
	getPeppolIdentifierSchemes,
} from "../src/countries";
import {
	getPeppolParticipantScheme,
	getVatParticipantScheme,
} from "../src/identifiers";
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

	it("marks Denmark and Finland as not fully Peppol-reachable", () => {
		// DK routes domestically over NemHandel and FI over the operator/bank
		// networks, so Peppol alone does not address the whole market there.
		expect(getCountryEInvoicingProfile("DK")?.peppolReachesFullMarket).toBe(false);
		expect(getCountryEInvoicingProfile("FI")?.peppolReachesFullMarket).toBe(false);
		expect(getCountryEInvoicingProfile("NO")?.peppolReachesFullMarket).toBe(true);
		expect(getCountryEInvoicingProfile("SE")?.peppolReachesFullMarket).toBe(true);
	});

	it("carries a company-number length distinct from the VAT length", () => {
		// Norwegian org.nr is 9 digits; its VAT number is the same 9 plus MVA.
		expect(getCountryEInvoicingProfile("NO")?.companyNumberLength).toBe(9);
		expect(getCountryEInvoicingProfile("SE")?.companyNumberLength).toBe(10);
		expect(getCountryEInvoicingProfile("NL")?.companyNumberLength).toBe(8);
	});

	it("validates Norwegian numbers against BRREG, not VIES", () => {
		// Norway is outside the EU, so VIES holds nothing for it.
		expect(getCountryEInvoicingProfile("NO")?.vatRegistrySource).toBe("brreg");
		expect(getCountryEInvoicingProfile("SE")?.vatRegistrySource).toBe("vies");
	});

	it("profiles Luxembourg with the CTIE matricule 0240 / VAT 9938", () => {
		const lu = getCountryEInvoicingProfile("LU");
		expect(lu?.companyIdentifierScheme).toBe("0240");
		expect(lu?.vatIdentifierScheme).toBe("9938");
		// The matricule is 11 digits; the VAT core is 8. Onboarding gates on the
		// former, so the two must not be conflated.
		expect(lu?.companyNumberLength).toBe(11);
		expect(lu?.archivalYears).toBe(10);
	});

	it("profiles France: reform address 0225 on the SIREN, SIRENE 0002, VAT 9957", () => {
		expect(getCountryEInvoicingProfile("FR")).toMatchObject({
			companyIdentifierScheme: "0002",
			vatIdentifierScheme: "9957",
			preferredAddress: { scheme: "0225", valueFrom: "companyNumber" },
			peppolReachesFullMarket: false,
			archivalYears: 10,
			companyNumberLength: 9,
		});
	});

	it("profiles Germany: GEBA 0246 on the USt-IdNr, no company scheme or length", () => {
		expect(getCountryEInvoicingProfile("DE")).toMatchObject({
			companyIdentifierScheme: null,
			vatIdentifierScheme: "9930",
			preferredAddress: { scheme: "0246", valueFrom: "vatNumber" },
			peppolReachesFullMarket: false,
			archivalYears: 8,
			companyNumberLength: null,
		});
	});

	it("gives every profile at least one addressable scheme", () => {
		for (const country of EINVOICING_PROFILE_COUNTRIES) {
			const profile = getCountryEInvoicingProfile(country);
			expect(
				profile?.preferredAddress?.scheme ??
					profile?.companyIdentifierScheme ??
					profile?.vatIdentifierScheme,
			).toBeTruthy();
		}
	});

	it("addresses only by a scheme on the EAS list whose value structure is catalogued", () => {
		// 0225 and 0246 carry separators, so normalization must know them.
		for (const country of EINVOICING_PROFILE_COUNTRIES) {
			const scheme =
				getCountryEInvoicingProfile(country)?.preferredAddress?.scheme;
			if (scheme) expect(getPeppolParticipantScheme(scheme)).not.toBeNull();
		}
	});
});

describe("getPeppolIdentifierSchemes", () => {
	it("uses the verified profile for profiled countries", () => {
		// One representative; every profiled country's scheme pair is checked
		// against PEPPOL_COUNTRY_SCHEMES by the it.each below.
		expect(getPeppolIdentifierSchemes("BE")).toEqual({
			companyIdentifierScheme: "0208",
			vatIdentifierScheme: "9925",
			preferredAddress: null,
		});
	});

	it("preserves the null VAT scheme for company-scheme-only countries", () => {
		expect(getPeppolIdentifierSchemes("NO")).toEqual({
			companyIdentifierScheme: "0192",
			vatIdentifierScheme: null,
			preferredAddress: null,
		});
		expect(getPeppolIdentifierSchemes("DK")).toEqual({
			companyIdentifierScheme: "0184",
			vatIdentifierScheme: null,
			preferredAddress: null,
		});
	});

	it("never resolves a country to a VAT scheme withdrawn from the EAS list", () => {
		// 9955 (SE:VAT) and 0213 (FI:VAT) fail BR-CL-25 wherever they appear.
		expect(getPeppolIdentifierSchemes("SE")).toEqual({
			companyIdentifierScheme: "0007",
			vatIdentifierScheme: null,
			preferredAddress: null,
		});
		expect(getPeppolIdentifierSchemes("FI")).toEqual({
			companyIdentifierScheme: "0216",
			vatIdentifierScheme: null,
			preferredAddress: null,
		});
		expect(getVatParticipantScheme("SE")).toBeNull();
		expect(getVatParticipantScheme("FI")).toBeNull();
	});

	it("carries the preferred address of a profiled country", () => {
		expect(getPeppolIdentifierSchemes("fr")?.preferredAddress?.scheme).toBe("0225");
		expect(getPeppolIdentifierSchemes("DE")).toEqual({
			companyIdentifierScheme: null,
			vatIdentifierScheme: "9930",
			preferredAddress: { scheme: "0246", valueFrom: "vatNumber" },
		});
	});

	it("falls back to the country's own VAT-based addressing scheme when unprofiled", () => {
		// An unprofiled sender must still be addressed under its own scheme —
		// never a provider's Belgian 9925 default.
		expect(getPeppolIdentifierSchemes("AT")).toEqual({
			companyIdentifierScheme: null,
			vatIdentifierScheme: "9914",
			preferredAddress: null,
		});
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
