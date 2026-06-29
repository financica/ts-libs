import { normalizeAddress } from "./address";
import {
	buildCompanyId,
	parsePeppolEndpoint,
	resolveVatEndpoint,
} from "./identifiers";
import type { UblAddress, UblEndpoint, UblParty } from "./ubl/types";
import { normalizeString } from "./utils";

/**
 * Supplier (seller) VAT status. Drives how zero-VAT lines are reported when the
 * seller does not charge VAT:
 *
 *   1 — Subject to VAT (the normal case): line categories come from the data.
 *   2 — Not subject to VAT.
 *   3 — Small business / franchise exemption (e.g. Belgian Article 56bis).
 *
 * For statuses 2 and 3, {@link ../build.ts} coerces all line categories to a
 * non-charging exempt category so no VAT is reported.
 */
export type SupplierVatStatus = 1 | 2 | 3;

/**
 * Caller-provided supplier data, normalized into a stable shape.
 *
 * Each consumer builds this from its own data store. Once a `UblSupplier`
 * exists, the party builder no longer needs to know where it came from.
 */
export interface UblSupplier {
	/** Display + legal name shown on the invoice. */
	name: string;
	/** ISO 3166-1 alpha-2 country code (e.g. `"BE"`). */
	countryCode: string;
	/**
	 * Free-form address. Stripe-style fields (`line1`, `postal_code`, `country`)
	 * and legacy/internal fields (`street`, `zip_code`) are both accepted.
	 */
	address: unknown;
	/** Country-specific company/registration number (e.g. BE enterprise number). */
	companyNumber?: string | null;
	/** VAT number with country prefix (e.g. `"BE0793904121"`). */
	vatNumber?: string | null;
	/** Whether the supplier charges VAT. See {@link SupplierVatStatus}. */
	vatStatus: SupplierVatStatus;
	/** Peppol participant identifier in `scheme:value` form (e.g. `"0208:0793904121"`). */
	peppolID?: string | null;
}

/** Convert a {@link UblSupplier} into the supplier (seller) party. */
export const buildSupplierParty = (supplier: UblSupplier): UblParty => {
	const address = normalizeAddress(supplier.address, supplier.countryCode);
	return {
		endpoint: parsePeppolEndpoint(supplier.peppolID),
		name: supplier.name,
		address,
		vatNumber: normalizeString(supplier.vatNumber),
		legalName: supplier.name,
		companyId: buildCompanyId({
			countryCode: supplier.countryCode,
			companyNumber: supplier.companyNumber ?? null,
		}),
	};
};

/**
 * Caller-provided customer (buyer) data, normalized into a stable shape.
 *
 * Each consumer (the Stripe adapter, app-specific row builders) resolves its
 * own identifiers and address, then hands this generic shape to
 * {@link buildCustomerParty}, so the Peppol routing logic lives in one place.
 */
export interface UblCustomer {
	/** Display + legal name shown on the invoice. */
	name: string;
	/** Customer address, already normalized by the caller. */
	address: UblAddress;
	/**
	 * The customer's ISO 3166-1 alpha-2 country, used to resolve VAT/registration
	 * schemes for identifiers that don't carry a country prefix. Pass the
	 * customer's *own* country (never the supplier's) so the document is not
	 * mis-routed; falls back to the address country when omitted.
	 */
	countryCode?: string | null;
	/** Peppol participant identifier in `scheme:value` form (e.g. `"0208:0793904121"`). */
	peppolID?: string | null;
	/** Global Location Number (resolved under EAS `0088`). */
	glnNumber?: string | null;
	/** Generic tax/registration number (no VAT prefix). */
	taxNumber?: string | null;
	/** VAT number with country prefix (e.g. `"BE0793904121"`). */
	vatNumber?: string | null;
}

/**
 * Convert a {@link UblCustomer} into the customer (buyer) party.
 *
 * The Peppol `EndpointID` (BT-49) — which routes the document — is resolved in
 * priority order: an explicit `endpointOverride` (e.g. a confirmed-registered
 * identifier), then an explicit Peppol ID, then a GLN (scheme `0088`), then the
 * VAT number mapped to its country's VAT EAS scheme (e.g. BE → `9925`). That
 * last step matters because most data stores hold a customer's VAT without a
 * scheme, so without it a VAT-only customer would have no endpoint and the
 * document would be unroutable.
 */
export const buildCustomerParty = (
	customer: UblCustomer,
	endpointOverride?: UblEndpoint | null,
): UblParty => {
	const countryCode =
		normalizeString(customer.countryCode) ?? customer.address.countryCode;
	const endpoint =
		endpointOverride ??
		parsePeppolEndpoint(customer.peppolID) ??
		(customer.glnNumber ? { scheme: "0088", value: customer.glnNumber } : null) ??
		resolveVatEndpoint({ vatNumber: customer.vatNumber, countryCode });

	return {
		endpoint,
		name: customer.name,
		address: customer.address,
		vatNumber: normalizeString(customer.vatNumber),
		legalName: customer.name,
		companyId: buildCompanyId({
			countryCode,
			companyNumber: customer.taxNumber ?? null,
		}),
	};
};
