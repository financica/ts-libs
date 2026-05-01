import type { CompanyInvoiceTaxNumberType } from "@financica/scrada-client";
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
 * Country code → Scrada CompanyInvoiceTaxNumberType code.
 *
 *   1 — Belgium (KBO/BCE / Numéro d'entreprise)
 *   2 — Netherlands (KvK)
 *   3 — France (SIRENE)
 *
 * If the country is not in the table, falls back to inspecting the
 * tax-number prefix (e.g. `BE0793904121` → 1).
 */
export const resolveTaxNumberType = (params: {
	countryCode: string | null;
	taxNumber: string | null;
}): CompanyInvoiceTaxNumberType | null => {
	const taxNumber = normalizeString(params.taxNumber);
	if (!taxNumber) return null;

	const TABLE: Record<string, CompanyInvoiceTaxNumberType> = {
		BE: 1,
		NL: 2,
		FR: 3,
	};

	const normalizedCountry =
		normalizeString(params.countryCode)?.toUpperCase() ?? null;
	if (normalizedCountry && normalizedCountry in TABLE) {
		return TABLE[normalizedCountry] ?? null;
	}

	const normalizedTaxNumber = cleanIdentifierValue(taxNumber).toUpperCase();
	const countryPrefix = normalizedTaxNumber.slice(0, 2);
	if (countryPrefix in TABLE) {
		return TABLE[countryPrefix] ?? null;
	}

	return null;
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
