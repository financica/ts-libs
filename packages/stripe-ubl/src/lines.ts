import type { PeppolOnlyInvoiceLine } from "@financica/scrada-client";
import type Stripe from "stripe";
import { centsToDecimal, roundCurrency } from "./numeric";
import {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "./tax-amounts";
import { normalizeString, toNumber } from "./utils";
import { resolveVatTypeFromTaxAmounts, vatTypeFromCategoryOrRate } from "./vat";

/**
 * Convert Stripe.Invoice line items into Scrada `PeppolOnlyInvoiceLine[]`.
 *
 * When the invoice has no line items (e.g. an out-of-band invoice), falls
 * back to a single synthetic line driven by `invoice.total_excluding_tax`
 * so the document still passes Scrada's "lines sum to header total"
 * validation rule.
 */
export const buildInvoiceLines = (invoice: Stripe.Invoice): PeppolOnlyInvoiceLine[] => {
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

		return [
			{
				lineNumber: "1",
				itemName: normalizeString(invoice.description) ?? "Invoice",
				quantity: 1,
				unitType: 1,
				itemExclVat: centsToDecimal(taxBase),
				vatType: vatTypeFromCategoryOrRate({
					taxCategoryId: null,
					taxExemptionReason: null,
					rate: vatPercentage,
				}),
				vatPercentage,
				totalDiscountExclVat: 0,
				totalExclVat: centsToDecimal(taxBase),
			},
		];
	}

	return stripeLines.map((line, index) => {
		const quantity = Math.max(1, toNumber(line.quantity));
		// Stripe's `line.amount` is the GROSS (pre-discount) amount — it sums to
		// `invoice.subtotal`. The taxable base is `line.amount - discount_amounts`,
		// and Stripe computes the line's tax on that net base. So both the VAT rate
		// and the line's excl-VAT total must be derived from the net, not the gross
		// — otherwise a discounted line reports the wrong rate (e.g. 14.70% instead
		// of 21%) and a line total that won't reconcile with the header total.
		// This mirrors the credit-note path below.
		const discountCents = getInvoiceLineDiscountAmountCents(line);
		const grossCents = line.amount;
		const netCents = Math.max(grossCents - discountCents, 0);
		const grossTotalExclVat = centsToDecimal(grossCents);
		const totalDiscountExclVat = centsToDecimal(discountCents);
		const totalExclVat = centsToDecimal(netCents);
		const itemExclVat = roundCurrency(grossTotalExclVat / quantity);
		const taxAmounts = getInvoiceLineTaxAmounts(line);

		let vatPercentage = 0;
		if (taxAmounts.length > 0) {
			const totalTaxCents = taxAmounts.reduce((sum, ta) => sum + ta.amount, 0);
			if (totalTaxCents > 0 && netCents > 0) {
				vatPercentage = roundCurrency((totalTaxCents / netCents) * 100);
			} else {
				// Either 100% discounted (net = 0) or the tax rounds to zero on a
				// heavily discounted amount. Use the expanded tax_rate so the
				// line is classified correctly rather than silently becoming
				// zero-rated.
				const firstWithRate = taxAmounts.find(
					(ta) => ta.tax_rate_percentage != null,
				);
				vatPercentage = firstWithRate?.tax_rate_percentage ?? 0;
			}
		}

		return {
			lineNumber: String(index + 1),
			itemName: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitType: 1,
			itemExclVat,
			vatType: resolveVatTypeFromTaxAmounts(taxAmounts, vatPercentage),
			vatPercentage,
			totalDiscountExclVat,
			totalExclVat,
		};
	});
};

/** Convert Stripe.CreditNote line items into Scrada `PeppolOnlyInvoiceLine[]`. */
export const buildCreditNoteLines = (
	creditNote: Stripe.CreditNote,
	fallbackItemName: string,
): PeppolOnlyInvoiceLine[] => {
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

		return [
			{
				lineNumber: "1",
				itemName: normalizeString(creditNote.memo) ?? fallbackItemName,
				quantity: 1,
				unitType: 1,
				itemExclVat: centsToDecimal(lineAmountCents),
				vatType: vatTypeFromCategoryOrRate({
					taxCategoryId: null,
					taxExemptionReason: null,
					rate: vatPercentage,
				}),
				vatPercentage,
				totalDiscountExclVat: 0,
				totalExclVat: centsToDecimal(lineAmountCents),
			},
		];
	}

	return stripeLines.map((line, index) => {
		const quantity = Math.max(1, toNumber(line.quantity));
		const grossCents = line.amount;
		const discountCents = line.discount_amount ?? 0;
		const netAmountCents = Math.max(grossCents - discountCents, 0);
		const totalDiscountExclVat = centsToDecimal(discountCents);
		const totalExclVat = centsToDecimal(netAmountCents);
		const unitAmountCents =
			line.unit_amount ??
			(quantity > 0 ? Math.round(grossCents / quantity) : grossCents);
		const itemExclVat = centsToDecimal(unitAmountCents);
		const taxAmounts = getCreditNoteLineTaxAmounts(line);
		const totalTaxCents = taxAmounts.reduce((sum, ta) => sum + ta.amount, 0);

		let vatPercentage = 0;
		if (taxAmounts.length > 0) {
			if (totalTaxCents > 0 && netAmountCents > 0) {
				vatPercentage = roundCurrency((totalTaxCents / netAmountCents) * 100);
			} else {
				const firstWithRate = taxAmounts.find(
					(ta) => ta.tax_rate_percentage != null,
				);
				vatPercentage = firstWithRate?.tax_rate_percentage ?? 0;
			}
		}

		return {
			lineNumber: String(index + 1),
			itemName: normalizeString(line.description) ?? `Line ${index + 1}`,
			quantity,
			unitType: 1,
			itemExclVat,
			vatType: resolveVatTypeFromTaxAmounts(taxAmounts, vatPercentage),
			vatPercentage,
			totalDiscountExclVat,
			totalExclVat,
		};
	});
};
