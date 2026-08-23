import { getPeppolIdentifierSchemes } from "@financica/peppol/countries";
import {
	countryFromVatNumber,
	normalizeParticipantValue,
} from "@financica/peppol/identifiers";
import type { UblCompanyId, UblEndpoint } from "./ubl/types";
import { normalizeString } from "./utils";

const normalizeBelgianCompanyNumber = (value: string | null | undefined) => {
	if (!value) return "";
	// EAS 0208 (BE:EN) is 10 bare digits, so the printed dots are decoration.
	return normalizeParticipantValue("0208", value).toUpperCase().replace(/^BE/, "");
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
 * Peppol/ISO 6523 ICD scheme for a legal registration number
 * (`cac:PartyLegalEntity/cbc:CompanyID/@schemeID`), e.g. BE → `0208`
 * (enterprise number), NL → `0106` (KvK), FR → `0002` (SIRENE). The table is
 * `@financica/peppol`'s country profiles.
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

	const fromCountry = getPeppolIdentifierSchemes(
		params.countryCode,
	)?.companyIdentifierScheme;
	if (fromCountry) return fromCountry;

	// Only sniffing the country prefix, e.g. `BE0793904121` → `BE`.
	const prefix = companyNumber
		.replace(/[^A-Za-z]/g, "")
		.toUpperCase()
		.slice(0, 2);
	return getPeppolIdentifierSchemes(prefix)?.companyIdentifierScheme ?? null;
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
 * Resolve the Peppol participant identifier for a VAT number, deriving the EAS
 * scheme from the number's own country prefix (falling back to `countryCode`).
 *
 *   `BE0206582284` → `{ scheme: "9925", value: "BE0206582284" }`
 *
 * The scheme comes from `@financica/peppol`'s country resolution, so countries
 * that route on their registry number alone (Norway, Denmark) yield `null`
 * here — their VAT number is not a Peppol participant identifier.
 *
 * The value keeps its country prefix, matching how participants register (the
 * Peppol directory lists this party as `9925:be0206582284`). Returns `null`
 * when the country has no VAT EAS scheme or the input is empty.
 */
export const resolveVatEndpoint = (params: {
	vatNumber: string | null | undefined;
	countryCode?: string | null | undefined;
}): UblEndpoint | null => {
	const value = normalizeString(params.vatNumber);
	if (!value) return null;

	const fromPrefix = countryFromVatNumber(value);
	const scheme =
		getPeppolIdentifierSchemes(fromPrefix)?.vatIdentifierScheme ??
		getPeppolIdentifierSchemes(params.countryCode)?.vatIdentifierScheme;
	if (!scheme) return null;

	// Every scheme in the table is a VAT scheme, whose value carries no
	// separator, so the printed dots/spaces are dropped.
	const cleaned = normalizeParticipantValue(scheme, value).toUpperCase();
	if (!cleaned) return null;

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

/**
 * One customer tax identifier as stored by Stripe (`customer_tax_ids[]`) or an
 * equivalent `{type, value}` pair. `type` is a Stripe tax-ID type such as
 * `eu_vat`, or a custom type such as `peppol_id`; blank entries are skipped.
 */
export interface CustomerTaxIdInput {
	type: string | null | undefined;
	value: string | null | undefined;
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
	taxIds: readonly CustomerTaxIdInput[] | null | undefined,
): CustomerTaxIdentifiers => {
	let peppolID: string | null = null;
	let glnNumber: string | null = null;
	let taxNumber: string | null = null;
	let vatNumber: string | null = null;

	for (const entry of taxIds ?? []) {
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
		// Any other typed id (ca_gst_hst, au_abn, us_ein, ...) is a registration
		// number: it goes to BT-30, not BT-31.
		if (!taxNumber) taxNumber = value;
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
	customer: Partial<CustomerTaxIdentifiers>,
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
	if (gln) add({ scheme: "0088", value: normalizeParticipantValue("0088", gln) });

	// 3. VAT number → the country's VAT EAS scheme (e.g. BE → 9925).
	const vat = resolveVatEndpoint({ vatNumber: customer.vatNumber, countryCode });
	add(vat);

	// 4. Belgium also reaches parties by enterprise number under EAS 0208; it is
	// the VAT digits without the `BE` prefix, and some entities register only so.
	if (vat?.scheme === "9925") {
		add(
			buildCompanyId({
				countryCode: "BE",
				companyNumber: customer.vatNumber ?? null,
			}),
		);
	}

	// 5. A generic tax/registration number → its country's company-ID scheme.
	const tax = normalizeString(customer.taxNumber);
	if (tax)
		add(buildCompanyId({ countryCode: countryCode ?? null, companyNumber: tax }));

	return Array.from(new Set(candidates));
};
