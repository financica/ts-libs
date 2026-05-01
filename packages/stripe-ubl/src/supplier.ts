import type {
	CompanyVatStatus,
	PeppolOnlyInvoiceParty,
} from "@financica/scrada-client";
import { normalizeAddress } from "./address";
import { normalizeCompanyNumberForCountry, resolveTaxNumberType } from "./identifiers";
import { normalizeString } from "./utils";

/**
 * Caller-provided supplier data, normalized into a stable shape.
 *
 * Each consumer (Peppost, Financica, …) builds this from its own data store.
 * This is the contract — once a `ScradaSupplier` exists, the payload builder
 * does not need to know where it came from.
 */
export interface ScradaSupplier {
	/** Display name shown on the invoice. */
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
	/** Whether the supplier is allowed to charge VAT on this document. */
	vatStatus: CompanyVatStatus;
	/** Optional Peppol participant identifier (e.g. `"0208:0793904121"`). */
	peppolID?: string | null;
}

/** Convert a {@link ScradaSupplier} into the supplier party for a Peppol invoice. */
export const buildSupplierParty = (
	supplier: ScradaSupplier,
): PeppolOnlyInvoiceParty => {
	const address = normalizeAddress(supplier.address, supplier.countryCode);
	const taxNumberInput = normalizeString(supplier.companyNumber);
	const taxNumberType = resolveTaxNumberType({
		countryCode: supplier.countryCode,
		taxNumber: taxNumberInput,
	});
	const taxNumber =
		taxNumberInput && taxNumberType
			? normalizeString(
					normalizeCompanyNumberForCountry(
						supplier.countryCode,
						taxNumberInput,
					),
				)
			: null;

	return {
		peppolID: supplier.peppolID ?? null,
		name: supplier.name,
		address,
		...(taxNumber && taxNumberType ? { taxNumberType, taxNumber } : {}),
		vatNumber: supplier.vatNumber ?? null,
		vatStatus: supplier.vatStatus,
	};
};
