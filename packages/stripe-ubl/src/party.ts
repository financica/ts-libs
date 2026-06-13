import {
	buildCompanyId,
	extractCustomerTaxIdentifiers,
	normalizeAddress,
	parsePeppolEndpoint,
	type UblParty,
} from "@financica/ubl/build";
import type Stripe from "stripe";

/**
 * Build the customer (buyer) party from a `Stripe.Invoice`.
 *
 * Pulls VAT/Peppol/tax/GLN identifiers from `invoice.customer_tax_ids`. The
 * customer's country is taken strictly from `invoice.customer_address` — we do
 * NOT fall back to the supplier's country, because that would silently
 * mis-route the document if the customer address is missing. The Peppol
 * endpoint prefers an explicit Peppol ID, falling back to a GLN (scheme 0088).
 */
export const buildCustomerPartyFromStripeInvoice = (
	invoice: Stripe.Invoice,
): { customer: UblParty; customerName: string } => {
	const address = normalizeAddress(invoice.customer_address, null);
	const stripeTaxIds = invoice.customer_tax_ids?.map((taxId) => ({
		type: taxId.type,
		value: taxId.value,
	}));
	const ids = extractCustomerTaxIdentifiers(stripeTaxIds);

	const endpoint =
		parsePeppolEndpoint(ids.peppolID) ??
		(ids.glnNumber ? { scheme: "0088", value: ids.glnNumber } : null);

	const customerName = invoice.customer_name ?? invoice.customer_email ?? "Customer";

	return {
		customer: {
			endpoint,
			name: customerName,
			address,
			vatNumber: ids.vatNumber,
			legalName: customerName,
			companyId: buildCompanyId({
				countryCode: address.countryCode,
				companyNumber: ids.taxNumber,
			}),
		},
		customerName,
	};
};
