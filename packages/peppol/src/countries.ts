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

/**
 * A participant address whose scheme is neither the company nor the VAT
 * scheme but whose value is one of those numbers: France's reform address
 * `0225` carries the SIREN, Germany's GEBA `0246` the USt-IdNr.
 */
export interface PreferredAddress {
	/** Peppol EAS of the address. */
	scheme: string;
	/** Which of the business's numbers is the address value. */
	valueFrom: "companyNumber" | "vatNumber";
}

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
	/**
	 * Peppol EAS for the legal entity identifier, or null when the country has
	 * no register scheme on the EAS list (Germany: no Handelsregister EAS).
	 */
	companyIdentifierScheme: string | null;
	/**
	 * Peppol EAS for a *separate* VAT participant identifier, or null when the
	 * country routes on the company scheme alone (e.g. Norway's org.nr under
	 * `0192` is both the entity id and the VAT base, so no distinct VAT
	 * participant id is registered).
	 */
	vatIdentifierScheme: string | null;
	/**
	 * The address the country's own authority designates for businesses,
	 * registered ahead of the company and VAT schemes, or null when the
	 * company scheme (else the VAT scheme) is the address.
	 */
	preferredAddress: PreferredAddress | null;
	/** Where the domestic VAT / registration number is validated. */
	vatRegistrySource: VatRegistrySource;
	/** Statutory bookkeeping retention, in years. */
	archivalYears: number;
	/**
	 * Number of digits in the entity/org number a user types into a company
	 * number field. This differs from the VAT format's core length (e.g. a
	 * Norwegian org.nr is 9 digits, but its VAT number is 9 digits + `MVA`), so
	 * onboarding must gate on this, not on the VAT length. Null when the
	 * country has no single-format company number (Germany's Handelsregister
	 * numbers vary by court).
	 */
	companyNumberLength: number | null;
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
		preferredAddress: null,
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
		preferredAddress: null,
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
		preferredAddress: null,
		vatRegistrySource: "vies",
		archivalYears: 5,
		companyNumberLength: 8, // CVR
	},
	FI: {
		country: "FI",
		network: "finvoice",
		peppolReachesFullMarket: false, // operator/bank networks reach the rest
		companyIdentifierScheme: "0216", // OVT (State Treasury-preferred)
		// FI:VAT (`0213`) is withdrawn from the EAS code list; OVT under 0216
		// is the identifier.
		vatIdentifierScheme: null,
		preferredAddress: null,
		vatRegistrySource: "vies",
		archivalYears: 6,
		companyNumberLength: 8, // Y-tunnus
	},
	SE: {
		country: "SE",
		network: "peppol",
		peppolReachesFullMarket: true,
		companyIdentifierScheme: "0007", // Organisationsnummer
		// SE:VAT (`9955`) is withdrawn from the EAS code list, so validation
		// rejects it (BR-CL-25); the organisationsnummer under 0007 is the
		// identifier, and a Swedish VAT number is that number + `01`.
		vatIdentifierScheme: null,
		preferredAddress: null,
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
		preferredAddress: null,
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
		preferredAddress: null,
		vatRegistrySource: "vies",
		archivalYears: 10, // Code de commerce art. 16
		companyNumberLength: 11, // matricule: YYYY + legal form + serial + check digit
	},
	FR: {
		country: "FR",
		network: "peppol",
		// Every business receives through a Plateforme Agréée, but the reform
		// requires PA interoperability, not Peppol: a PA that is no Peppol
		// access point is reached only through the PAs it interconnects with.
		peppolReachesFullMarket: false,
		companyIdentifierScheme: "0002", // SIRENE (SIREN)
		vatIdentifierScheme: "9957", // French VAT: FR + key + SIREN
		// The reform's electronic address (FRCTC), published in the Annuaire.
		// Its default value is the SIREN; a receiver may add a `_suffix`.
		preferredAddress: { scheme: "0225", valueFrom: "companyNumber" },
		vatRegistrySource: "vies",
		archivalYears: 10, // Code de commerce art. L123-22
		companyNumberLength: 9, // SIREN
	},
	DE: {
		country: "DE",
		network: "peppol",
		// The law prescribes no channel: email and EDI stay lawful.
		peppolReachesFullMarket: false,
		companyIdentifierScheme: null, // no Handelsregister EAS
		vatIdentifierScheme: "9930", // USt-IdNr
		// GEBA, recommended by KoSIT (Germany Identifier v1.3, 2026-09-08). Its
		// value is the Wirtschafts-Identifikationsnummer, equal to the USt-IdNr.
		preferredAddress: { scheme: "0246", valueFrom: "vatNumber" },
		vatRegistrySource: "vies",
		archivalYears: 8, // § 14b Abs. 1 UStG (BEG IV)
		companyNumberLength: null, // Handelsregister numbers vary by court
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
	 * when none is known: the country has no verified profile (only its
	 * VAT-based addressing scheme is known) or no register scheme on the EAS
	 * list (Germany). Callers must treat null as "register no company
	 * identifier" rather than substituting a provider default, which would put a
	 * foreign identifier under another country's scheme.
	 */
	companyIdentifierScheme: string | null;
	/**
	 * Peppol EAS for a *separate* VAT participant identifier, or null when the
	 * country routes on the company scheme alone (Norway, Denmark).
	 */
	vatIdentifierScheme: string | null;
	/**
	 * The address to register ahead of the other two, or null when the company
	 * scheme (else the VAT scheme) is the address. See
	 * {@link CountryEInvoicingProfile.preferredAddress}.
	 */
	preferredAddress: PreferredAddress | null;
}

/**
 * The Peppol identifier schemes for addressing a participant in `country`.
 *
 * Resolution combines the two country tables: a hand-verified
 * {@link CountryEInvoicingProfile} is authoritative (it distinguishes the
 * company-registration scheme from a separate VAT scheme, and encodes the
 * countries that route on the company scheme alone); for a country without a
 * full profile we fall back to
 * the {@link PEPPOL_COUNTRY_SCHEMES} addressing table, whose scheme is
 * VAT-based for every unprofiled country (every registry-addressed country
 * is profiled), and last to the full `CC:VAT` EAS
 * code list (which also covers non-EU countries such as Switzerland's
 * neighbours and the Balkans). This is what keeps an unprofiled sender — an
 * Austrian VAT, say — addressed under its own scheme (`9914`) instead of a
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
			preferredAddress: profile.preferredAddress,
		};
	}
	const vatIdentifierScheme =
		getPeppolCountryScheme(country)?.scheme ?? getVatParticipantScheme(country);
	if (!vatIdentifierScheme) return null;
	return {
		companyIdentifierScheme: null,
		vatIdentifierScheme,
		preferredAddress: null,
	};
};
