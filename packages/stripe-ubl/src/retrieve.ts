import type Stripe from "stripe";

/**
 * The `expand` paths a Stripe invoice must be retrieved with for
 * `buildUblInvoiceFromStripeInvoice` to classify VAT correctly.
 *
 * Both the legacy `tax_amounts.tax_rate` and the newer
 * `taxes.tax_rate_details.tax_rate` are expanded; the line builders try the
 * legacy field first and fall back to the newer one. Without these expands,
 * fully-discounted lines lose their VAT rate and the document-level reconcile
 * pushes the residual into the 0% bucket, which validating access points
 * reject. `customer` is expanded for the customer-party builder.
 */
export const STRIPE_INVOICE_UBL_EXPAND: readonly string[] = [
	"customer",
	"lines.data.tax_amounts.tax_rate",
	"lines.data.taxes.tax_rate_details.tax_rate",
];

/**
 * Retrieve a Stripe invoice with {@link STRIPE_INVOICE_UBL_EXPAND}, ready to
 * hand to `buildUblInvoiceFromStripeInvoice`.
 */
export const retrieveStripeInvoiceForUbl = (
	stripe: Stripe,
	invoiceId: string,
): Promise<Stripe.Invoice> =>
	stripe.invoices.retrieve(invoiceId, {
		expand: [...STRIPE_INVOICE_UBL_EXPAND],
	});
