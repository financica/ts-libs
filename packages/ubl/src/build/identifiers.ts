import type { UblCompanyId, UblEndpoint } from "./ubl/types";
import { isRecord, normalizeString } from "./utils";

const cleanIdentifierValue = (value: string) =>
	value
		.trim()
		.replace(/\s+/g, "")
		.replace(/[^A-Za-z0-9]/g, "");

const normalizeBelgianCompanyNumber = (value: string | null | undefined) => {
	if (!value) return "";
	return cleanIdentifierValue(value).toUpperCase().replace(/^BE/, "");
};

/**
 * Strip whitespace/punctuation from a country-specific company number.
 * For Belgium, also strips an optional `BE` prefix.
 */
export const normalizeCompanyNumberForCountry = (
	countryCode: string | null | undefined,
	companyNumber: string | null | undefined,
) => {
	if (!companyNumber) return "";
	const upper = countryCode?.trim().toUpperCase() ?? "";
	if (upper === "BE") return normalizeBelgianCompanyNumber(companyNumber);
	return companyNumber.trim();
};

/**
 * Country code → Peppol/ISO 6523 ICD scheme for a legal registration number
 * (`cac:PartyLegalEntity/cbc:CompanyID/@schemeID`).
 *
 *   BE → 0208 (Belgian enterprise number, CBE/KBO/BCE)
 *   NL → 0106 (Netherlands KvK)
 *   FR → 0002 (France SIRENE)
 *
 * Falls back to inspecting the number's country prefix (e.g. `BE0793904121`).
 * Returns `null` when the scheme can't be determined, in which case the
 * CompanyID is emitted without a `schemeID` attribute.
 */
export const resolveCompanyIdScheme = (params: {
	countryCode: string | null;
	companyNumber: string | null;
}): string | null => {
	const companyNumber = normalizeString(params.companyNumber);
	if (!companyNumber) return null;

	const TABLE: Record<string, string> = {
		BE: "0208",
		NL: "0106",
		FR: "0002",
	};

	const normalizedCountry =
		normalizeString(params.countryCode)?.toUpperCase() ?? null;
	if (normalizedCountry && normalizedCountry in TABLE) {
		return TABLE[normalizedCountry] ?? null;
	}

	const countryPrefix = cleanIdentifierValue(companyNumber).toUpperCase().slice(0, 2);
	return countryPrefix in TABLE ? (TABLE[countryPrefix] ?? null) : null;
};

/**
 * Build the `cac:PartyLegalEntity/cbc:CompanyID` value for a party, with the
 * country-appropriate ICD scheme when known. Returns `null` when there is no
 * company number.
 */
export const buildCompanyId = (params: {
	countryCode: string | null;
	companyNumber: string | null;
}): UblCompanyId | null => {
	const normalized = normalizeString(
		normalizeCompanyNumberForCountry(params.countryCode, params.companyNumber),
	);
	if (!normalized) return null;
	return {
		value: normalized,
		scheme: resolveCompanyIdScheme({
			countryCode: params.countryCode,
			companyNumber: normalized,
		}),
	};
};

/**
 * Country code → Peppol EAS scheme for a *VAT* identifier, keyed by ISO 3166-1
 * alpha-2. Source: Peppol Code Lists – Participant Identifier Schemes (EAS),
 * Peppol BIS Billing 3.0 (November 2025 release).
 *
 * Only countries that publish a VAT-based EAS scheme appear here. Some (e.g.
 * SE/DK/NO) address Peppol participants by organisation number rather than VAT
 * and are intentionally absent — see {@link resolveCompanyIdScheme}.
 */
const VAT_SCHEME_BY_COUNTRY: Record<string, string> = {
	AD: "9922", // Andorra
	AL: "9923", // Albania
	AT: "9914", // Austria
	BA: "9924", // Bosnia and Herzegovina
	BE: "9925", // Belgium
	BG: "9926", // Bulgaria
	CH: "9927", // Switzerland
	CY: "9928", // Cyprus
	CZ: "9929", // Czech Republic
	DE: "9930", // Germany
	EE: "9931", // Estonia
	ES: "9920", // Spain (Spanish Tax Administration)
	FI: "0213", // Finland (Finnish VAT Identifier)
	FR: "9957", // France
	GB: "9932", // United Kingdom
	GR: "9933", // Greece (VAT prefix "EL")
	HR: "9934", // Croatia
	HU: "9910", // Hungary
	IE: "9935", // Ireland
	LI: "9936", // Liechtenstein
	LT: "9937", // Lithuania
	LU: "9938", // Luxembourg
	LV: "9939", // Latvia
	MC: "9940", // Monaco
	ME: "9941", // Montenegro
	MK: "9942", // North Macedonia
	MT: "9943", // Malta
	NL: "9944", // Netherlands
	PL: "9945", // Poland
	PT: "9946", // Portugal
	RO: "9947", // Romania
	RS: "9948", // Serbia
	SI: "9949", // Slovenia
	SK: "9950", // Slovakia
	SM: "9951", // San Marino
	TR: "9952", // Turkey
	VA: "9953", // Holy See / Vatican City
};

/**
 * VAT registration prefixes that differ from the ISO 3166-1 alpha-2 country
 * code, so a VAT number's leading two letters still resolve to the right scheme.
 */
const VAT_PREFIX_TO_COUNTRY: Record<string, string> = {
	EL: "GR", // Greece issues VAT numbers with the "EL" prefix
	XI: "GB", // Northern Ireland VAT is issued under the UK scheme
};

/**
 * Resolve the Peppol participant identifier for a VAT number, deriving the EAS
 * scheme from the number's own country prefix (falling back to `countryCode`).
 *
 *   `BE0206582284` → `{ scheme: "9925", value: "BE0206582284" }`
 *
 * The value keeps its country prefix, matching how participants register (the
 * Peppol directory lists this party as `9925:be0206582284`). Returns `null`
 * when the country has no VAT EAS scheme or the input is empty.
 */
export const resolveVatEndpoint = (params: {
	vatNumber: string | null | undefined;
	countryCode?: string | null;
}): UblEndpoint | null => {
	const value = normalizeString(params.vatNumber);
	if (!value) return null;
	const cleaned = cleanIdentifierValue(value).toUpperCase();
	if (!cleaned) return null;

	const prefix = cleaned.slice(0, 2);
	const fromPrefix = /^[A-Z]{2}$/.test(prefix)
		? (VAT_PREFIX_TO_COUNTRY[prefix] ?? prefix)
		: null;
	const fromCountry = normalizeString(params.countryCode)?.toUpperCase() ?? null;

	const country =
		fromPrefix && fromPrefix in VAT_SCHEME_BY_COUNTRY ? fromPrefix : fromCountry;
	const scheme = country ? VAT_SCHEME_BY_COUNTRY[country] : undefined;
	if (!scheme) return null;

	return { scheme, value: cleaned };
};

/**
 * Parse a Peppol participant identifier into a {@link UblEndpoint}.
 *
 * Accepts the canonical `scheme:value` form (e.g. `0208:0800279001`). Returns
 * `null` for values without an explicit scheme, since `cbc:EndpointID` requires
 * a `schemeID` and guessing one would mis-route the document.
 */
export const parsePeppolEndpoint = (
	peppolId: string | null | undefined,
): UblEndpoint | null => {
	const normalized = normalizeString(peppolId);
	if (!normalized) return null;
	const separatorIndex = normalized.indexOf(":");
	if (separatorIndex <= 0) return null;
	const scheme = normalized.slice(0, separatorIndex).trim();
	const value = normalized.slice(separatorIndex + 1).trim();
	if (!scheme || !value) return null;
	return { scheme, value };
};

export interface CustomerTaxIdentifiers {
	peppolID: string | null;
	glnNumber: string | null;
	taxNumber: string | null;
	vatNumber: string | null;
}

const normalizeIdentifierType = (value: string | null) =>
	value?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? null;

/**
 * Pick the first usable Peppol identifier, GLN, VAT number, and tax number
 * from a Stripe-style `customer_tax_ids` array (`[{type, value}, …]`).
 *
 * Stripe stores VAT numbers under types like `eu_vat`, `gb_vat`, etc.
 * Peppol IDs are typically stored as a custom `peppol_id` type.
 */
export const extractCustomerTaxIdentifiers = (
	taxIds: unknown,
): CustomerTaxIdentifiers => {
	let peppolID: string | null = null;
	let glnNumber: string | null = null;
	let taxNumber: string | null = null;
	let vatNumber: string | null = null;

	if (!Array.isArray(taxIds)) {
		return { peppolID, glnNumber, taxNumber, vatNumber };
	}

	for (const entry of taxIds) {
		if (!isRecord(entry)) continue;

		const type = normalizeIdentifierType(normalizeString(entry.type));
		const value = normalizeString(entry.value);
		if (!type || !value) continue;

		if (!peppolID && type.includes("peppol")) {
			peppolID = value;
			continue;
		}
		if (!glnNumber && type.includes("gln")) {
			glnNumber = value;
			continue;
		}
		if (!vatNumber && type.includes("vat")) {
			vatNumber = value;
			continue;
		}
		if (!taxNumber && type.includes("tax")) {
			taxNumber = value;
		}
	}

	return { peppolID, glnNumber, taxNumber, vatNumber };
};

/**
 * Build the fully-qualified Peppol participant identifiers (`scheme:value`) a
 * receiver lookup will accept, in priority order, de-duplicated.
 *
 * Stripe stores a customer's VAT number without a Peppol scheme (e.g.
 * `BE0206582284`), but a participant lookup needs the qualified identifier
 * (`9925:BE0206582284`). This attaches the right scheme:
 *
 *   1. an explicit Peppol ID (already `scheme:value`) — passed through as-is;
 *   2. a GLN under EAS `0088`;
 *   3. the VAT number under its country's VAT EAS scheme (see
 *      {@link resolveVatEndpoint});
 *   4. for Belgium, the enterprise number (VAT digits without the `BE` prefix)
 *      under EAS `0208` — many Belgian entities register only under that;
 *   5. a generic tax/registration number under its country's company-ID scheme.
 *
 * `countryCode` (the customer's country, when known) disambiguates schemes for
 * identifiers that don't carry a country prefix (GLN, plain tax numbers).
 */
export const listPeppolReceiverIdentifierCandidates = (
	customer: {
		peppolID?: string | null;
		glnNumber?: string | null;
		taxNumber?: string | null;
		vatNumber?: string | null;
	},
	countryCode?: string | null,
): string[] => {
	const candidates: string[] = [];
	const add = (id: { scheme?: string | null; value: string } | null) => {
		if (id?.scheme && id.value) candidates.push(`${id.scheme}:${id.value}`);
	};

	// 1. An explicit Peppol ID already carries its own scheme.
	const peppol = normalizeString(customer.peppolID);
	if (peppol) candidates.push(peppol);

	// 2. GLN → EAS 0088 (Global Location Number).
	const gln = normalizeString(customer.glnNumber);
	if (gln) add({ scheme: "0088", value: cleanIdentifierValue(gln) });

	// 3. VAT number → the country's VAT EAS scheme (e.g. BE → 9925).
	const vat = resolveVatEndpoint({ vatNumber: customer.vatNumber, countryCode });
	add(vat);

	// 4. Belgium also reaches parties by enterprise number under EAS 0208; it is
	// the VAT digits without the `BE` prefix, and some entities register only so.
	if (vat?.scheme === "9925") {
		add(buildCompanyId({ countryCode: "BE", companyNumber: customer.vatNumber ?? null }));
	}

	// 5. A generic tax/registration number → its country's company-ID scheme.
	const tax = normalizeString(customer.taxNumber);
	if (tax) add(buildCompanyId({ countryCode: countryCode ?? null, companyNumber: tax }));

	return Array.from(new Set(candidates));
};
