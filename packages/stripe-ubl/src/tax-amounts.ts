import type { TaxAmountInfo } from "@financica/ubl/build";
import type Stripe from "stripe";
import { toNumber } from "./utils";

/**
 * A tax rate reference as Stripe serialises it: the rate's id when not
 * expanded, or the full object when expanded.
 */
type StripeTaxRateRef = string | Pick<Stripe.TaxRate, "percentage"> | null | undefined;

/**
 * Legacy `tax_amounts[]` entry on an invoice line. The Stripe SDK no longer
 * declares this field on `InvoiceLineItem`, but the API still returns it on
 * older API versions, so its shape is pinned here.
 */
interface StripeLegacyTaxAmount {
	amount: number | string;
	taxability_reason?: string | null;
	tax_rate?: StripeTaxRateRef;
}

/**
 * Legacy `discount_amounts[]` entry on an invoice line, likewise absent from
 * the SDK types.
 */
interface StripeLegacyDiscountAmount {
	amount: number | string;
}

/**
 * Fields the runtime API returns on an invoice line that the SDK's
 * `InvoiceLineItem` type omits.
 */
type InvoiceLineItemWithLegacyFields = Stripe.InvoiceLineItem & {
	tax_amounts?: StripeLegacyTaxAmount[] | null;
	discount_amounts?: StripeLegacyDiscountAmount[] | null;
};

/** The two shapes that can carry an (expanded) tax rate. */
type TaxWithRate =
	| StripeLegacyTaxAmount
	| Pick<Stripe.InvoiceLineItem.Tax, "tax_rate_details">
	| Pick<Stripe.CreditNoteLineItem.Tax, "tax_rate_details">;

const percentageOf = (rate: StripeTaxRateRef): number | null =>
	rate && typeof rate === "object" && typeof rate.percentage === "number"
		? rate.percentage
		: null;

/**
 * Reads the rate percentage from either Stripe shape:
 *   - `tax_amounts[].tax_rate.percentage`             (legacy invoice field, when expanded)
 *   - `taxes[].tax_rate_details.tax_rate.percentage`  (newer field, when expanded)
 */
const readExpandedTaxRatePercentage = (tax: TaxWithRate): number | null => {
	if ("tax_rate_details" in tax) {
		return percentageOf(tax.tax_rate_details?.tax_rate);
	}
	return percentageOf(tax.tax_rate);
};

/**
 * Read tax info off a Stripe.InvoiceLineItem.
 *
 * Prefers the legacy `tax_amounts` field (which our default expand
 * `lines.data.tax_amounts.tax_rate` covers) and falls back to the newer
 * `taxes` field. Stripe is migrating away from `tax_amounts`, and on
 * accounts where only `taxes` is populated we'd otherwise compute
 * vatPercentage = 0 and silently drop VAT — producing a UBL document whose
 * VAT breakdown understates the tax due and fails EN 16931 validation.
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
	const rawTaxAmounts = (line as InvoiceLineItemWithLegacyFields).tax_amounts;
	if (Array.isArray(rawTaxAmounts) && rawTaxAmounts.length > 0) {
		return rawTaxAmounts.map((ta) => ({
			amount: toNumber(ta.amount),
			taxability_reason: ta.taxability_reason ?? null,
			tax_rate_percentage: readExpandedTaxRatePercentage(ta),
		}));
	}

	const rawTaxes = line.taxes;
	if (!Array.isArray(rawTaxes)) return [];
	return rawTaxes.map((tax) => ({
		amount: toNumber(tax.amount),
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
		amount: toNumber(tax.amount),
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
	const raw = (line as InvoiceLineItemWithLegacyFields).discount_amounts;
	if (!Array.isArray(raw)) return 0;
	return raw.reduce((sum, discount) => sum + toNumber(discount.amount), 0);
};
