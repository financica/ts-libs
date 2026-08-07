import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { resolveInvoicePeriod, toUblPeriod } from "../index";

const unix = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

const invoiceWith = (
	linePeriods: Array<[string, string] | null>,
	invoicePeriod?: [string, string],
): Stripe.Invoice =>
	({
		period_start: invoicePeriod ? unix(invoicePeriod[0]) : null,
		period_end: invoicePeriod ? unix(invoicePeriod[1]) : null,
		lines: {
			data: linePeriods.map((period) => ({
				period: period
					? { start: unix(period[0]), end: unix(period[1]) }
					: undefined,
			})),
		},
	}) as unknown as Stripe.Invoice;

describe("toUblPeriod", () => {
	it("moves Stripe's exclusive end back to the inclusive last day of service", () => {
		expect(toUblPeriod(unix("2026-01-01"), unix("2026-02-01"))).toEqual({
			startDate: "2026-01-01",
			endDate: "2026-01-31",
		});
	});

	it.each([
		{ name: "degenerate, as on a one-off invoice item", start: 1, end: 1 },
		{
			name: "shorter than a day",
			start: unix("2026-01-01"),
			end: unix("2026-01-01") + 3600,
		},
		{ name: "missing an end", start: unix("2026-01-01"), end: null },
		{ name: "missing a start", start: null, end: unix("2026-02-01") },
	])("reports no period when the range is $name", ({ start, end }) => {
		expect(toUblPeriod(start, end)).toBeNull();
	});
});

describe("resolveInvoicePeriod", () => {
	it("spans every line, so a proration outside the billing window still counts", () => {
		expect(
			resolveInvoicePeriod(
				invoiceWith(
					[
						["2026-02-01", "2026-03-01"],
						["2026-01-15", "2026-02-01"],
					],
					["2026-02-01", "2026-03-01"],
				),
			),
		).toEqual({ startDate: "2026-01-15", endDate: "2026-02-28" });
	});

	it("falls back to the invoice-level window when no line states a period", () => {
		expect(
			resolveInvoicePeriod(invoiceWith([null], ["2026-02-01", "2026-03-01"])),
		).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
	});

	it("reports nothing for a one-off invoice with no periods anywhere", () => {
		expect(resolveInvoicePeriod(invoiceWith([]))).toBeNull();
	});
});

describe("the period reaches the emitted XML", () => {
	it("emits cac:InvoicePeriod at document and line level", async () => {
		const { buildUblInvoiceFromStripeInvoice } = await import("../index");
		const xml = buildUblInvoiceFromStripeInvoice({
			invoice: {
				id: "in_1",
				object: "invoice",
				number: "INV-PERIOD",
				customer_name: "Test Customer",
				customer_address: {
					line1: "Rue Example 1",
					city: "Brussels",
					postal_code: "1000",
					country: "BE",
				},
				currency: "eur",
				subtotal: 10000,
				total: 12100,
				total_excluding_tax: 10000,
				amount_due: 12100,
				amount_paid: 0,
				status: "open",
				created: unix("2026-01-05"),
				status_transitions: { finalized_at: unix("2026-01-05") },
				period_start: unix("2026-01-01"),
				period_end: unix("2026-02-01"),
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_1/lines",
					data: [
						{
							description: "Subscription",
							amount: 10000,
							quantity: 1,
							tax_amounts: [{ amount: 2100 }],
							discount_amounts: [],
							period: {
								start: unix("2026-01-01"),
								end: unix("2026-02-01"),
							},
						},
					],
				},
			} as unknown as Stripe.Invoice,
			supplier: {
				name: "Acme BE",
				countryCode: "BE",
				address: {
					line1: "Rue de la Loi 16",
					city: "Brussels",
					postal_code: "1000",
					country: "BE",
				},
				companyNumber: "0800279001",
				vatNumber: "BE0800279001",
				vatStatus: 1,
				peppolID: "0208:0800279001",
			},
		});

		// The inclusive end, not Stripe's 02-01 boundary.
		expect(xml).toContain("<cbc:StartDate>2026-01-01</cbc:StartDate>");
		expect(xml).toContain("<cbc:EndDate>2026-01-31</cbc:EndDate>");
		expect(xml).not.toContain("2026-02-01");
		// Once on the document, once on the line.
		expect(xml.match(/<cac:InvoicePeriod>/g)).toHaveLength(2);
	});
});
