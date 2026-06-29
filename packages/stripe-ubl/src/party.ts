import {
	buildCustomerParty,
	extractCustomerTaxIdentifiers,
	normalizeAddress,
	type UblEndpoint,
	type UblParty,
} from "@financica/ubl/build";
import type Stripe from "stripe";

/**
 * Build the customer (buyer) party from a `Stripe.Invoice`.
 *
 * This is the Stripe-specific adapter: it pulls VAT/Peppol/tax/GLN identifiers
 * from `invoice.customer_tax_ids` and the name/address from the invoice, then
 * hands them to the generic {@link buildCustomerParty} so the Peppol routing
 * (endpoint/scheme resolution) lives in one shared place.
 *
 * The customer's country is taken strictly from `invoice.customer_address` — we
 * do NOT fall back to the supplier's country, because that would silently
 * mis-route the document if the customer address is missing.
 */
export const buildCustomerPartyFromStripeInvoice = (
	invoice: Stripe.Invoice,
	endpointOverride?: UblEndpoint | null,
): { customer: UblParty; customerName: string } => {
	const address = normalizeAddress(invoice.customer_address, null);
	const stripeTaxIds = invoice.customer_tax_ids?.map((taxId) => ({
		type: taxId.type,
		value: taxId.value,
	}));
	const ids = extractCustomerTaxIdentifiers(stripeTaxIds);
	const customerName = invoice.customer_name ?? invoice.customer_email ?? "Customer";

	const customer = buildCustomerParty(
		{
			name: customerName,
			address,
			countryCode: address.countryCode,
			peppolID: ids.peppolID,
			glnNumber: ids.glnNumber,
			taxNumber: ids.taxNumber,
			vatNumber: ids.vatNumber,
		},
		endpointOverride,
	);

	return { customer, customerName };
};
