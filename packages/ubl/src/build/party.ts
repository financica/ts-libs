import { normalizeAddress } from "./address";
import { buildCompanyId, parsePeppolEndpoint } from "./identifiers";
import type { UblParty } from "./ubl/types";
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

// buildCustomerPartyFromStripeInvoice lives in @financica/stripe-ubl (it is
// Stripe-specific); this module is the generic UBL build core.
