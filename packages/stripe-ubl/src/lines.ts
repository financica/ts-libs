import {
	centsToDecimal,
	DEFAULT_UNIT_CODE,
	deriveUnitPrice,
	resolveTaxCategoryFromTaxAmounts,
	roundCurrency,
	type UblLine,
} from "@financica/ubl/build";
import type Stripe from "stripe";
import {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "./tax-amounts";
import { toUblPeriod } from "./period";
import { normalizeString, toNumber } from "./utils";

// Stripe gives a line *total*, not a unit price, so every line's `cac:Price` is
// derived from it by `deriveUnitPrice` (BT-146, plus BT-149 when the net doesn't
// divide evenly into cents) — which is what keeps
// `quantity × unitPrice = lineExtensionAmount` and satisfies
// PEPPOL-EN16931-R120.
//
// Line-level discounts are folded into the net amount rather than emitted as a
// separate `cac:AllowanceCharge`, which would require its own reason code under
// EN 16931.

/**
 * The single synthetic line used when a Stripe document has no line items, so
 * the UBL document still has at least one line that reconciles with the header.
 */
const buildFallbackLine = (params: {
	description: string;
	taxBaseCents: number;
	taxCents: number;
}): UblLine => {
	const { description, taxBaseCents, taxCents } = params;
	const vatPercentage =
		taxBaseCents > 0 && taxCents > 0
			? roundCurrency((taxCents / taxBaseCents) * 100)
			: 0;
	const net = centsToDecimal(taxBaseCents);
	return {
		id: "1",
		description,
		quantity: 1,
		unitCode: DEFAULT_UNIT_CODE,
		lineExtensionAmount: net,
		unitPrice: net,
		taxCategory: resolveTaxCategoryFromTaxAmounts([], vatPercentage),
	};
};

/**
 * Effective VAT percentage of a line from its tax amounts and net base. When
 * the tax or the net rounds to zero (100% discounted, or a heavily discounted
 * amount), fall back to the expanded tax_rate so the line is classified
 * correctly rather than silently becoming zero-rated.
 */
const deriveVatPercentage = (
	taxAmounts: { amount: number; tax_rate_percentage?: number | null }[],
	netCents: number,
): number => {
	if (taxAmounts.length === 0) return 0;
	const totalTaxCents = taxAmounts.reduce((sum, ta) => sum + ta.amount, 0);
	if (totalTaxCents > 0 && netCents > 0) {
		return roundCurrency((totalTaxCents / netCents) * 100);
	}
	const firstWithRate = taxAmounts.find((ta) => ta.tax_rate_percentage != null);
	return firstWithRate?.tax_rate_percentage ?? 0;
};

/**
 * Convert `Stripe.Invoice` line items into {@link UblLine}s.
 *
 * When the invoice has no line items (e.g. an out-of-band invoice), falls back
 * to a single synthetic line driven by `invoice.total_excluding_tax` so the
 * document still has at least one line and reconciles with the header total.
 */
export const buildInvoiceLines = (invoice: Stripe.Invoice): UblLine[] => {
	const invoiceTaxCents =
		invoice.total_excluding_tax != null
			? invoice.total - invoice.total_excluding_tax
			: 0;
	const stripeLines = invoice.lines?.data ?? [];

	if (stripeLines.length === 0) {
		// Use total_excluding_tax as the tax base — it reflects all discounts
		// (including any invoice-level coupon), whereas subtotal is only
		// post-line-discount.
		return [
			buildFallbackLine({
				description: normalizeString(invoice.description) ?? "Invoice",
				taxBaseCents: invoice.total_excluding_tax ?? invoice.subtotal,
				taxCents: invoiceTaxCents,
			}),
		];
	}

	return stripeLines.map((line, index) => {
		const quantity = Math.max(1, toNumber(line.quantity));
		// Stripe's `line.amount` is the GROSS (pre-discount) amount — it sums to
		// `invoice.subtotal`. The taxable base is `line.amount - discount_amounts`,
		// and Stripe computes the line's tax on that net base. So both the VAT rate
		// and the line's net total must be derived from the net, not the gross —
		// otherwise a discounted line reports the wrong rate (e.g. 14.70% instead
		// of 21%) and a net total that won't reconcile with the header total.
		const discountCents = getInvoiceLineDiscountAmountCents(line);
		const grossCents = line.amount;
		const netCents = Math.max(grossCents - discountCents, 0);
		const netTotal = centsToDecimal(netCents);
		const taxAmounts = getInvoiceLineTaxAmounts(line);
		const price = deriveUnitPrice(netTotal, quantity);

		const vatPercentage = deriveVatPercentage(taxAmounts, netCents);

		return {
			id: String(index + 1),
			description: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitCode: DEFAULT_UNIT_CODE,
			lineExtensionAmount: netTotal,
			unitPrice: price.unitPrice,
			baseQuantity: price.baseQuantity,
			// BT-134/BT-135. Kept per line, not folded into the document period:
			// a proration covers a different window than the rest of the invoice,
			// and that difference is the whole reason the line exists.
			invoicePeriod: toUblPeriod(line.period?.start, line.period?.end),
			taxCategory: resolveTaxCategoryFromTaxAmounts(taxAmounts, vatPercentage),
		};
	});
};

/** Convert `Stripe.CreditNote` line items into {@link UblLine}s. */
export const buildCreditNoteLines = (
	creditNote: Stripe.CreditNote,
	fallbackItemName: string,
): UblLine[] => {
	const creditNoteTaxCents =
		creditNote.total_excluding_tax != null
			? creditNote.total - creditNote.total_excluding_tax
			: 0;
	const stripeLines = creditNote.lines?.data ?? [];

	if (stripeLines.length === 0) {
		return [
			buildFallbackLine({
				description: normalizeString(creditNote.memo) ?? fallbackItemName,
				taxBaseCents: creditNote.total_excluding_tax ?? creditNote.subtotal,
				taxCents: creditNoteTaxCents,
			}),
		];
	}

	return stripeLines.map((line, index) => {
		const quantity = Math.max(1, toNumber(line.quantity));
		const grossCents = line.amount;
		const discountCents = line.discount_amount ?? 0;
		const netCents = Math.max(grossCents - discountCents, 0);
		const netTotal = centsToDecimal(netCents);
		const taxAmounts = getCreditNoteLineTaxAmounts(line);
		const price = deriveUnitPrice(netTotal, quantity);
		const vatPercentage = deriveVatPercentage(taxAmounts, netCents);

		return {
			id: String(index + 1),
			description: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitCode: DEFAULT_UNIT_CODE,
			lineExtensionAmount: netTotal,
			unitPrice: price.unitPrice,
			baseQuantity: price.baseQuantity,
			taxCategory: resolveTaxCategoryFromTaxAmounts(taxAmounts, vatPercentage),
		};
	});
};
