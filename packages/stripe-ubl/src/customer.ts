import type { PeppolOnlyInvoiceParty } from "@financica/scrada-client";
import type Stripe from "stripe";
import { normalizeAddress } from "./address";
import {
	extractCustomerTaxIdentifiers,
	normalizeCompanyNumberForCountry,
	resolveTaxNumberType,
} from "./identifiers";
import { normalizeString } from "./utils";

/**
 * Build the customer party for an outbound Peppol invoice from the customer
 * data on a Stripe.Invoice.
 *
 * Pulls VAT/Peppol/tax/GLN identifiers from `invoice.customer_tax_ids`. The
 * customer's country is taken strictly from `invoice.customer_address` —
 * we do NOT fall back to the supplier's country, because that would silently
 * mis-route the document if the customer address is missing.
 */
export const buildCustomerPartyFromStripeInvoice = (
	invoice: Stripe.Invoice,
): { customer: PeppolOnlyInvoiceParty; customerName: string } => {
	const address = normalizeAddress(invoice.customer_address, null);
	const stripeTaxIds = invoice.customer_tax_ids?.map((taxId) => ({
		type: taxId.type,
		value: taxId.value,
	}));
	const ids = extractCustomerTaxIdentifiers(stripeTaxIds);

	const taxNumberType = resolveTaxNumberType({
		countryCode: address.countryCode,
		taxNumber: ids.taxNumber,
	});
	const taxNumber =
		ids.taxNumber && taxNumberType
			? normalizeString(
					normalizeCompanyNumberForCountry(
						address.countryCode,
						ids.taxNumber,
					),
				)
			: null;

	const customerName = invoice.customer_name ?? invoice.customer_email ?? "Customer";

	return {
		customer: {
			peppolID: ids.peppolID,
			name: customerName,
			address,
			...(ids.glnNumber ? { glnNumber: ids.glnNumber } : {}),
			...(taxNumber && taxNumberType ? { taxNumberType, taxNumber } : {}),
			vatNumber: ids.vatNumber,
		},
		customerName,
	};
};
