/**
 * Provider-neutral e-invoicing facts per country, keyed by ISO 3166-1 alpha-2
 * code. These describe the *country* (its legal network, identifier schemes,
 * archival rules), not any particular access point or service provider, so the
 * same registry serves any Peppol AP integration.
 *
 * Scheme codes are ISO/IEC 6523 ICD values (Peppol "electronic address
 * scheme" / EAS), verified against the OpenPeppol EAS code list
 * (https://docs.peppol.eu/poacc/billing/3.0/codelist/eas/).
 *
 * The addressing-scheme view of the same facts lives in
 * {@link PEPPOL_COUNTRY_SCHEMES} (`./schemes`); a test keeps the two tables
 * consistent for the countries both cover.
 *
 * Free of Node built-ins, so it is safe to import in a browser bundle.
 */

import { getVatParticipantScheme } from "./identifiers";
import { getPeppolCountryScheme } from "./schemes";

/** Primary network the country's legal mandate routes over. */
export type EInvoicingNetwork = "peppol" | "nemhandel" | "finvoice";

/**
 * Where a domestic VAT / registration number is validated. Norway is non-EU,
 * so its numbers never appear in VIES and must be checked against BRREG.
 */
export type VatRegistrySource = "vies" | "brreg";

export interface CountryEInvoicingProfile {
	/** ISO 3166-1 alpha-2. */
	country: string;
	/** Primary delivery network the legal mandate routes over. */
	network: EInvoicingNetwork;
	/**
	 * Whether Peppol transport alone reaches the full domestic market. False for
	 * Denmark (NemHandel) and Finland (operator/bank networks), where Peppol
	 * reaches only part of the market and a bridging provider is needed.
	 */
	peppolReachesFullMarket: boolean;
	/** Peppol EAS for the legal entity identifier. */
	companyIdentifierScheme: string;
	/**
	 * Peppol EAS for a *separate* VAT participant identifier, or null when the
	 * country routes on the company scheme alone (e.g. Norway's org.nr under
	 * `0192` is both the entity id and the VAT base, so no distinct VAT
	 * participant id is registered).
	 */
	vatIdentifierScheme: string | null;
	/** Where the domestic VAT / registration number is validated. */
	vatRegistrySource: VatRegistrySource;
	/** Statutory bookkeeping retention, in years. */
	archivalYears: number;
	/**
	 * Number of digits in the entity/org number a user types into a company
	 * number field. This differs from the VAT format's core length (e.g. a
	 * Norwegian org.nr is 9 digits, but its VAT number is 9 digits + `MVA`), so
	 * onboarding must gate on this, not on the VAT length.
	 */
	companyNumberLength: number;
}

/**
 * Countries with an authoritative, hand-verified profile. Absence from this
 * registry means "no verified profile", not "unsupported": callers should fall
 * back to their provider's defaults for unlisted countries.
 */
const EINVOICING_PROFILES: Record<string, CountryEInvoicingProfile> = {
	BE: {
		country: "BE",
		network: "peppol",
		peppolReachesFullMarket: true,
		companyIdentifierScheme: "0208", // KBO/BCE enterprise number
		vatIdentifierScheme: "9925", // Belgian VAT
		vatRegistrySource: "vies",
		archivalYears: 7,
		companyNumberLength: 10, // KBO/BCE enterprise number
	},
	NO: {
		country: "NO",
		network: "peppol",
		peppolReachesFullMarket: true,
		// EHF layers the NO-R rules onto plain Peppol BIS Billing 3.0 (no
		// distinct CustomizationID since 2019), so an EHF sender registers the
		// same BIS document types.
		companyIdentifierScheme: "0192", // Enhetsregisteret org.nr (9 digits)
		vatIdentifierScheme: null, // org.nr is the identifier; VAT is org.nr + MVA
		vatRegistrySource: "brreg", // non-EU: not in VIES
		archivalYears: 5,
		companyNumberLength: 9, // Enhetsregisteret org.nr
	},
	DK: {
		country: "DK",
		network: "nemhandel",
		peppolReachesFullMarket: false, // NemHandel domestic; foreign senders via Peppol
		companyIdentifierScheme: "0184", // DIGSTORG / CVR (8 digits)
		vatIdentifierScheme: null, // CVR under 0184 covers VAT
		vatRegistrySource: "vies",
		archivalYears: 5,
		companyNumberLength: 8, // CVR
	},
	FI: {
		country: "FI",
		network: "finvoice",
		peppolReachesFullMarket: false, // operator/bank networks reach the rest
		companyIdentifierScheme: "0216", // OVT (State Treasury-preferred)
		vatIdentifierScheme: "0213", // Finnish VAT / ALV
		vatRegistrySource: "vies",
		archivalYears: 6,
		companyNumberLength: 8, // Y-tunnus
	},
	SE: {
		country: "SE",
		network: "peppol",
		peppolReachesFullMarket: true,
		companyIdentifierScheme: "0007", // Organisationsnummer
		vatIdentifierScheme: "9955", // Swedish VAT
		vatRegistrySource: "vies",
		archivalYears: 7,
		companyNumberLength: 10, // Organisationsnummer
	},
	NL: {
		country: "NL",
		network: "peppol",
		peppolReachesFullMarket: true,
		companyIdentifierScheme: "0106", // KvK (Kamer van Koophandel)
		vatIdentifierScheme: "9944", // Netherlands VAT
		vatRegistrySource: "vies",
		archivalYears: 7,
		companyNumberLength: 8, // KvK number
	},
	LU: {
		country: "LU",
		network: "peppol",
		peppolReachesFullMarket: true,
		// Répertoire des personnes morales, issued by the CTIE — the "matricule"
		// / numéro d'identification national, not the RCS `B` number (which has
		// no EAS). ISO 6523 names e-invoicing as its intended purpose.
		companyIdentifierScheme: "0240",
		vatIdentifierScheme: "9938", // Luxembourg VAT
		vatRegistrySource: "vies",
		archivalYears: 10, // Code de commerce art. 16
		companyNumberLength: 11, // matricule: YYYY + legal form + serial + check digit
	},
};

/** The countries with a verified profile, for enumeration. */
export const EINVOICING_PROFILE_COUNTRIES: readonly string[] =
	Object.keys(EINVOICING_PROFILES);

/**
 * The authoritative profile for a country, or null when none is registered
 * (caller should fall back to its provider's defaults).
 */
export const getCountryEInvoicingProfile = (
	country: string | null | undefined,
): CountryEInvoicingProfile | null =>
	EINVOICING_PROFILES[(country ?? "").trim().toUpperCase()] ?? null;

/** The Peppol participant identifier schemes used to address a country's businesses. */
export interface PeppolIdentifierSchemes {
	/**
	 * Peppol EAS for the legal-entity / company-registration identifier, or null
	 * when the country has no verified profile, so only its VAT-based addressing
	 * scheme is known. Callers must treat null as "register no company
	 * identifier" rather than substituting a provider default, which would put a
	 * foreign identifier under another country's scheme.
	 */
	companyIdentifierScheme: string | null;
	/**
	 * Peppol EAS for a *separate* VAT participant identifier, or null when the
	 * country routes on the company scheme alone (Norway, Denmark).
	 */
	vatIdentifierScheme: string | null;
}

/**
 * Legal-registry EAS schemes for countries that have no full profile yet but
 * whose registration-number scheme is known. A country is promoted out of
 * this table into {@link EINVOICING_PROFILES} once its profile is verified.
 */
const COMPANY_REGISTRY_SCHEME_BY_COUNTRY: Record<string, string> = {
	FR: "0002", // SIRENE (SIREN, 9 digits)
};

/**
 * The Peppol identifier schemes for addressing a participant in `country`.
 *
 * Resolution combines the two country tables: a hand-verified
 * {@link CountryEInvoicingProfile} is authoritative (it distinguishes the
 * company-registration scheme from a separate VAT scheme, and encodes the
 * countries that route on the company scheme alone); for a country without a
 * full profile we fall back to
 * the {@link PEPPOL_COUNTRY_SCHEMES} addressing table, whose scheme is
 * VAT-based for every unprofiled country (only Norway and Denmark use a
 * registry scheme, and both are profiled), and last to the full `CC:VAT` EAS
 * code list (which also covers non-EU countries such as Switzerland's
 * neighbours and the Balkans). This is what keeps an unprofiled sender — a
 * German VAT, say — addressed under its own scheme (`9930`) instead of a
 * provider's Belgian default (`9925`).
 *
 * Returns null only for a country in none of these tables (outside Peppol's
 * reach), where the caller should apply its provider default.
 */
export const getPeppolIdentifierSchemes = (
	country: string | null | undefined,
): PeppolIdentifierSchemes | null => {
	const profile = getCountryEInvoicingProfile(country);
	if (profile) {
		return {
			companyIdentifierScheme: profile.companyIdentifierScheme,
			vatIdentifierScheme: profile.vatIdentifierScheme,
		};
	}
	const normalized = country?.trim().toUpperCase() ?? null;
	const companyIdentifierScheme =
		(normalized && COMPANY_REGISTRY_SCHEME_BY_COUNTRY[normalized]) ?? null;
	const vatIdentifierScheme =
		getPeppolCountryScheme(country)?.scheme ?? getVatParticipantScheme(country);
	if (!companyIdentifierScheme && !vatIdentifierScheme) return null;
	return { companyIdentifierScheme, vatIdentifierScheme };
};
