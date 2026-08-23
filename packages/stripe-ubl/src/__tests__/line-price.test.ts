import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { buildCreditNoteLines, buildInvoiceLines } from "../index";
import type { UblLine } from "../index";

/**
 * PEPPOL-EN16931-R120: the line net amount must equal
 * `quantity × unitPrice` (with `PriceAmount = unitPrice × baseQuantity`) within a 0.02 tolerance, with
 * `baseQuantity` defaulting to 1.
 *
 * Stripe reports a line *total* and a quantity but no exact unit price, so
 * every line this adapter emits derives its `cac:Price` — which is precisely
 * where a naive `total ÷ quantity` rounded to cents breaks the rule.
 */
const R120_TOLERANCE = 0.02;

const r120Residual = (line: UblLine): number =>
	Math.abs(
		(line.quantity ?? 0) * (line.unitPrice ?? 0) - (line.lineExtensionAmount ?? 0),
	);

const expectR120 = (lines: UblLine[]) => {
	for (const line of lines) {
		expect(r120Residual(line), `line ${line.id}`).toBeLessThan(R120_TOLERANCE);
	}
};

const creditNoteWithLines = (
	data: unknown[],
	totals: { subtotal: number; total: number; total_excluding_tax: number },
) =>
	({
		id: "cn_test_r120",
		object: "credit_note",
		number: "CN-R120",
		currency: "eur",
		created: 1711929600,
		effective_at: 1712016000,
		memo: null,
		...totals,
		lines: {
			object: "list",
			has_more: false,
			url: "/v1/credit_notes/cn_test_r120/lines",
			data,
		},
	}) as unknown as Stripe.CreditNote;

const invoiceWithLines = (
	data: unknown[],
	totals: { subtotal: number; total: number; total_excluding_tax: number },
) =>
	({
		id: "in_test_r120",
		object: "invoice",
		number: "INV-R120",
		currency: "eur",
		created: 1711929600,
		description: null,
		...totals,
		lines: {
			object: "list",
			has_more: false,
			url: "/v1/invoices/in_test_r120/lines",
			data,
		},
	}) as unknown as Stripe.Invoice;

describe("R120 line pricing", () => {
	it("keeps a line whose total does not divide into cents valid", () => {
		// MALINAMORE-0075-CN-01, the credit note Scrada rejected: 940.00 over 14
		// units is 67.142857…, and the old cent-rounded 67.14 gave 939.96 — 0.04
		// out, double the tolerance, fatal at validation. Never transmitted.
		const lines = buildCreditNoteLines(
			creditNoteWithLines(
				[
					{
						id: "cnli_1",
						object: "credit_note_line_item",
						description: "Ceramics Team Building (With Glazing)",
						amount: 94000,
						discount_amount: 0,
						quantity: 14,
						taxes: [],
						type: "invoice_line_item",
					},
					{
						id: "cnli_2",
						object: "credit_note_line_item",
						description: "Assortment of Drinks",
						amount: 5600,
						discount_amount: 0,
						quantity: 14,
						taxes: [],
						type: "invoice_line_item",
					},
				],
				{ subtotal: 99600, total: 99600, total_excluding_tax: 99600 },
			),
			"Credit note",
		);

		expectR120(lines);
		expect(lines[0]?.lineExtensionAmount).toBe(940);
		expect(lines[1]?.lineExtensionAmount).toBe(56);
		// The evenly-divisible line keeps a natural per-unit price.
		expect(lines[1]?.unitPrice).toBe(4);
		expect(lines[1]?.baseQuantity).toBeUndefined();
	});

	it("holds across quantities that do not divide the line total evenly", () => {
		for (let quantity = 1; quantity <= 40; quantity++) {
			for (const amount of [1, 99, 5600, 94000, 99599, 123457]) {
				const lines = buildInvoiceLines(
					invoiceWithLines(
						[
							{
								description: "Item",
								amount,
								quantity,
								tax_amounts: [],
								discount_amounts: [],
							},
						],
						{
							subtotal: amount,
							total: amount,
							total_excluding_tax: amount,
						},
					),
				);
				expect(
					r120Residual(lines[0] as UblLine),
					`${amount} cents over ${quantity} units`,
				).toBeLessThan(R120_TOLERANCE);
			}
		}
	});

	it("holds for a discounted line, where the net drives the price", () => {
		// The price must derive from the NET (post-discount) total, matching the
		// net that lands in lineExtensionAmount.
		const lines = buildInvoiceLines(
			invoiceWithLines(
				[
					{
						description: "Discounted item",
						amount: 100000,
						quantity: 3,
						tax_amounts: [{ amount: 1400 }],
						discount_amounts: [{ amount: 33333 }],
					},
				],
				{ subtotal: 100000, total: 68067, total_excluding_tax: 66667 },
			),
		);

		expect(lines[0]?.lineExtensionAmount).toBe(666.67);
		expectR120(lines);
	});
});
