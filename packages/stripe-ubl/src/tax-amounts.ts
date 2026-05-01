import type Stripe from "stripe";
import type { TaxAmountInfo } from "./vat";

/**
 * Reads the rate percentage from either Stripe shape:
 *   - `tax_amounts[].tax_rate.percentage`             (legacy invoice field, when expanded)
 *   - `taxes[].tax_rate_details.tax_rate.percentage`  (newer field, when expanded)
 */
// biome-ignore lint/suspicious/noExplicitAny: runtime shape varies across Stripe API versions
const readExpandedTaxRatePercentage = (tax: any): number | null => {
	const detailRate = tax?.tax_rate_details?.tax_rate;
	if (
		detailRate &&
		typeof detailRate === "object" &&
		typeof detailRate.percentage === "number"
	) {
		return detailRate.percentage;
	}
	if (
		tax?.tax_rate &&
		typeof tax.tax_rate === "object" &&
		typeof tax.tax_rate.percentage === "number"
	) {
		return tax.tax_rate.percentage;
	}
	return null;
};

/**
 * Read tax info off a Stripe.InvoiceLineItem.
 *
 * Prefers the legacy `tax_amounts` field (which our default expand
 * `lines.data.tax_amounts.tax_rate` covers) and falls back to the newer
 * `taxes` field. Stripe is migrating away from `tax_amounts`, and on
 * accounts where only `taxes` is populated we'd otherwise compute
 * vatPercentage = 0 and silently drop VAT — which the document-level
 * reconcile then pushes into the 0% bucket, triggering Scrada's
 * "VAT difference left for 0% VAT" rejection.
 *
 * Recommended retrieval:
 * ```ts
 * stripe.invoices.retrieve(id, {
 *   expand: [
 *     "lines.data.tax_amounts.tax_rate",
 *     "lines.data.taxes.tax_rate_details.tax_rate",
 *   ],
 * });
 * ```
 */
export const getInvoiceLineTaxAmounts = (
	line: Stripe.InvoiceLineItem,
): TaxAmountInfo[] => {
	// biome-ignore lint/suspicious/noExplicitAny: Stripe SDK types don't expose tax_amounts on InvoiceLineItem (legacy field)
	const rawTaxAmounts = (line as any).tax_amounts;
	if (Array.isArray(rawTaxAmounts) && rawTaxAmounts.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: runtime shape from Stripe API
		return rawTaxAmounts.map((ta: any) => ({
			amount: typeof ta.amount === "number" ? ta.amount : 0,
			taxability_reason: ta.taxability_reason ?? null,
			tax_rate_percentage: readExpandedTaxRatePercentage(ta),
		}));
	}

	const rawTaxes = line.taxes;
	if (!Array.isArray(rawTaxes)) return [];
	return rawTaxes.map((tax) => ({
		amount: typeof tax.amount === "number" ? tax.amount : 0,
		taxability_reason: tax.taxability_reason ?? null,
		tax_rate_percentage: readExpandedTaxRatePercentage(tax),
	}));
};

/** Read tax info off a Stripe.CreditNoteLineItem (uses the `taxes` field). */
export const getCreditNoteLineTaxAmounts = (
	line: Stripe.CreditNoteLineItem,
): TaxAmountInfo[] => {
	const taxes = line.taxes;
	if (!Array.isArray(taxes)) return [];
	return taxes.map((tax) => ({
		amount: typeof tax.amount === "number" ? tax.amount : 0,
		taxability_reason: tax.taxability_reason ?? null,
		tax_rate_percentage: readExpandedTaxRatePercentage(tax),
	}));
};

/**
 * Read invoice-line-level discount amounts as cents.
 *
 * Stripe's SDK does not expose this field on the line item type, but the
 * runtime API includes `discount_amounts: [{amount, ...}]`.
 */
export const getInvoiceLineDiscountAmountCents = (
	line: Stripe.InvoiceLineItem,
): number => {
	// biome-ignore lint/suspicious/noExplicitAny: Stripe SDK types don't expose discount_amounts on InvoiceLineItem
	const raw = (line as any).discount_amounts;
	if (!Array.isArray(raw)) return 0;
	return raw.reduce(
		(sum: number, discount: { amount: number }) => sum + discount.amount,
		0,
	);
};
