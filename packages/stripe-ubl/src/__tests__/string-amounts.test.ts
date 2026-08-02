import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "../tax-amounts";

/**
 * Stripe's JSON does not always match its own documented types: several
 * documented-integer fields arrive as decimal strings, and the SDK passes them
 * through without coercing, so a string reaches this code typed as a number.
 *
 * Observed live on credit-note lines: `unit_amount_excluding_tax: "1000"`. The
 * same drift on a *tax* amount is what these tests guard, because a guard that
 * discards a non-number silently yields 0 — a UBL document that understates the
 * VAT due and still validates locally, which is worse than a hard failure.
 */
const asInvoiceLine = (line: unknown) => line as Stripe.InvoiceLineItem;
const asCreditNoteLine = (line: unknown) => line as Stripe.CreditNoteLineItem;

describe("tax and discount amounts arriving as decimal strings", () => {
	it("reads a string tax amount off the legacy invoice-line field", () => {
		expect(
			getInvoiceLineTaxAmounts(
				asInvoiceLine({
					tax_amounts: [{ amount: "2100", tax_rate: { percentage: 21 } }],
				}),
			),
		).toEqual([{ amount: 2100, taxability_reason: null, tax_rate_percentage: 21 }]);
	});

	it("reads a string tax amount off the newer invoice-line field", () => {
		expect(
			getInvoiceLineTaxAmounts(
				asInvoiceLine({
					taxes: [
						{
							amount: "2100",
							tax_rate_details: { tax_rate: { percentage: 21 } },
						},
					],
				}),
			),
		).toEqual([{ amount: 2100, taxability_reason: null, tax_rate_percentage: 21 }]);
	});

	it("reads a string tax amount off a credit-note line", () => {
		expect(
			getCreditNoteLineTaxAmounts(
				asCreditNoteLine({
					taxes: [
						{
							amount: "2100",
							tax_rate_details: { tax_rate: { percentage: 21 } },
						},
					],
				}),
			),
		).toEqual([{ amount: 2100, taxability_reason: null, tax_rate_percentage: 21 }]);
	});

	it("sums string discount amounts instead of concatenating them", () => {
		// `sum + discount.amount` on strings yields "0250250" — a discount three
		// orders of magnitude too large, silently.
		expect(
			getInvoiceLineDiscountAmountCents(
				asInvoiceLine({
					discount_amounts: [{ amount: "250" }, { amount: "250" }],
				}),
			),
		).toBe(500);
	});

	it("still treats an unparseable amount as zero", () => {
		expect(
			getInvoiceLineTaxAmounts(
				asInvoiceLine({ tax_amounts: [{ amount: null }] }),
			),
		).toEqual([{ amount: 0, taxability_reason: null, tax_rate_percentage: null }]);
	});
});
