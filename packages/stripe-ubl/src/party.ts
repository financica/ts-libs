import {
	buildCompanyId,
	extractCustomerTaxIdentifiers,
	normalizeAddress,
	parsePeppolEndpoint,
	resolveVatEndpoint,
	type UblEndpoint,
	type UblParty,
} from "@financica/ubl/build";
import type Stripe from "stripe";

/**
 * Build the customer (buyer) party from a `Stripe.Invoice`.
 *
 * Pulls VAT/Peppol/tax/GLN identifiers from `invoice.customer_tax_ids`. The
 * customer's country is taken strictly from `invoice.customer_address` — we do
 * NOT fall back to the supplier's country, because that would silently
 * mis-route the document if the customer address is missing.
 *
 * The Peppol `EndpointID` (BT-49) — which routes the document — is resolved in
 * priority order: an explicit `endpointOverride` (e.g. the identifier a caller
 * confirmed registered), then an explicit Peppol ID, then a GLN (scheme 0088),
 * then the VAT number mapped to its country's VAT EAS scheme (e.g. BE → 9925).
 * Stripe stores VAT numbers without a scheme, so without that last step a
 * VAT-only customer would have no endpoint and the document would be unroutable.
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

	const endpoint =
		endpointOverride ??
		parsePeppolEndpoint(ids.peppolID) ??
		(ids.glnNumber ? { scheme: "0088", value: ids.glnNumber } : null) ??
		resolveVatEndpoint({
			vatNumber: ids.vatNumber,
			countryCode: address.countryCode,
		});

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
