import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReceiptAmount, parseStripeReceiptPage } from "../src/receipt-page.js";

const fixture = (name: string): string =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("parseStripeReceiptPage", () => {
	it("reads the refund, not the invoice it refunds", () => {
		// The page documents a $348.99 refund against a $936.00 invoice; the
		// invoice total appears three times in the markup ("Total", "Amount
		// paid", the line item) and must not be mistaken for the refund.
		expect(parseStripeReceiptPage(fixture("refund-receipt-348usd.html"))).toEqual({
			kind: "refund",
			merchantName: "The Productive Company, Inc.",
			amount: 348.99,
			date: "2025-01-08",
			receiptNumber: "3364-2064",
			invoiceNumber: "62A1552B-0005",
			amountPaid: 936,
			// "Total refunded without credit note": no credit note was issued,
			// so there is no credited block to read.
			creditNote: null,
		});
	});

	it("reads the credited lines and the credit note number when one was issued", () => {
		const page = parseStripeReceiptPage(
			fixture("refund-receipt-creditnote-75eur.html"),
		);

		expect(page).toMatchObject({
			kind: "refund",
			merchantName: "Ledgy AG",
			amount: 75,
			date: "2023-11-24",
			receiptNumber: "3762-0091",
			invoiceNumber: "50CAA332-0004",
			amountPaid: 75,
		});
		// The credited block sits below the invoice's own lines and must not
		// pick those up: the invoice line is also 25 × €3.00 = €75.00.
		expect(page.creditNote).toEqual({
			number: "50CAA332-0004-CN-01",
			total: 75,
			lines: [
				{
					description:
						"25 stakeholder × Ledgy Growth Subscription (at €3.00 / month)",
					quantity: 25,
					unitAmount: null,
					amount: 75,
				},
			],
		});
	});

	it("reports no amount when the page carries no receipt rows", () => {
		expect(
			parseStripeReceiptPage("<html><body><p>Not found</p></body></html>"),
		).toEqual({
			kind: "payment",
			merchantName: null,
			amount: null,
			date: null,
			receiptNumber: null,
			invoiceNumber: null,
			amountPaid: null,
			creditNote: null,
		});
	});
});

describe("parseReceiptAmount", () => {
	it.each([
		["$348.99", 348.99],
		["$936.00", 936],
		["-$5.00", -5],
		// Locale-formatted amounts: the last separator with two digits after it
		// is the decimal point, whichever separator it is.
		["1.234,56 EUR", 1234.56],
		["$1,234.56", 1234.56],
		["1 234,56 kr", 1234.56],
		// Zero-decimal currencies have no decimal part at all.
		["¥1,000", 1000],
		["", null],
	])("parses %s", (raw, expected) => {
		expect(parseReceiptAmount(raw)).toBe(expected);
	});
});
