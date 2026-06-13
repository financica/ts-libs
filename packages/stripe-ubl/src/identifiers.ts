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
 * Return the candidate identifiers a Peppol receiver lookup will accept,
 * in priority order, with duplicates and nulls removed.
 */
export const listPeppolReceiverIdentifierCandidates = (customer: {
	peppolID?: string | null;
	glnNumber?: string | null;
	taxNumber?: string | null;
	vatNumber?: string | null;
}) =>
	Array.from(
		new Set(
			[
				normalizeString(customer.peppolID),
				normalizeString(customer.glnNumber),
				normalizeString(customer.taxNumber),
				normalizeString(customer.vatNumber),
			].filter((value): value is string => !!value),
		),
	);
