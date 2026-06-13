import type Stripe from "stripe";
import { centsToDecimal, roundCurrency } from "./numeric";
import {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "./tax-amounts";
import { resolveTaxCategoryFromTaxAmounts } from "./tax-category";
import { DEFAULT_UNIT_CODE } from "./ubl/constants";
import type { UblLine } from "./ubl/types";
import { normalizeString, toNumber } from "./utils";

/**
 * The net unit price (BT-146): the line's net total spread over its quantity.
 * Keeping `priceAmount × quantity ≈ lineExtensionAmount` keeps the document
 * internally consistent; line-level discounts are folded into the net amount
 * rather than emitted as a separate `cac:AllowanceCharge` (which would require
 * its own reason code under EN 16931).
 */
const unitPrice = (netTotal: number, quantity: number): number =>
	roundCurrency(netTotal / Math.max(quantity, 1));

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
		const taxBase = invoice.total_excluding_tax ?? invoice.subtotal;
		const vatPercentage =
			taxBase > 0 && invoiceTaxCents > 0
				? roundCurrency((invoiceTaxCents / taxBase) * 100)
				: 0;
		const net = centsToDecimal(taxBase);

		return [
			{
				id: "1",
				name: normalizeString(invoice.description) ?? "Invoice",
				quantity: 1,
				unitCode: DEFAULT_UNIT_CODE,
				lineExtensionAmount: net,
				priceAmount: net,
				taxCategory: resolveTaxCategoryFromTaxAmounts([], vatPercentage),
			},
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

		let vatPercentage = 0;
		if (taxAmounts.length > 0) {
			const totalTaxCents = taxAmounts.reduce((sum, ta) => sum + ta.amount, 0);
			if (totalTaxCents > 0 && netCents > 0) {
				vatPercentage = roundCurrency((totalTaxCents / netCents) * 100);
			} else {
				// Either 100% discounted (net = 0) or the tax rounds to zero on a
				// heavily discounted amount. Use the expanded tax_rate so the line
				// is classified correctly rather than silently becoming zero-rated.
				const firstWithRate = taxAmounts.find(
					(ta) => ta.tax_rate_percentage != null,
				);
				vatPercentage = firstWithRate?.tax_rate_percentage ?? 0;
			}
		}

		return {
			id: String(index + 1),
			name: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitCode: DEFAULT_UNIT_CODE,
			lineExtensionAmount: netTotal,
			priceAmount: unitPrice(netTotal, quantity),
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
		const lineAmountCents = creditNote.total_excluding_tax ?? creditNote.subtotal;
		const vatPercentage =
			lineAmountCents > 0 && creditNoteTaxCents > 0
				? roundCurrency((creditNoteTaxCents / lineAmountCents) * 100)
				: 0;
		const net = centsToDecimal(lineAmountCents);

		return [
			{
				id: "1",
				name: normalizeString(creditNote.memo) ?? fallbackItemName,
				quantity: 1,
				unitCode: DEFAULT_UNIT_CODE,
				lineExtensionAmount: net,
				priceAmount: net,
				taxCategory: resolveTaxCategoryFromTaxAmounts([], vatPercentage),
			},
		];
	}

	return stripeLines.map((line, index) => {
		const quantity = Math.max(1, toNumber(line.quantity));
		const grossCents = line.amount;
		const discountCents = line.discount_amount ?? 0;
		const netCents = Math.max(grossCents - discountCents, 0);
		const netTotal = centsToDecimal(netCents);
		const taxAmounts = getCreditNoteLineTaxAmounts(line);
		const totalTaxCents = taxAmounts.reduce((sum, ta) => sum + ta.amount, 0);

		let vatPercentage = 0;
		if (taxAmounts.length > 0) {
			if (totalTaxCents > 0 && netCents > 0) {
				vatPercentage = roundCurrency((totalTaxCents / netCents) * 100);
			} else {
				const firstWithRate = taxAmounts.find(
					(ta) => ta.tax_rate_percentage != null,
				);
				vatPercentage = firstWithRate?.tax_rate_percentage ?? 0;
			}
		}

		return {
			id: String(index + 1),
			name: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitCode: DEFAULT_UNIT_CODE,
			lineExtensionAmount: netTotal,
			priceAmount: unitPrice(netTotal, quantity),
			taxCategory: resolveTaxCategoryFromTaxAmounts(taxAmounts, vatPercentage),
		};
	});
};
