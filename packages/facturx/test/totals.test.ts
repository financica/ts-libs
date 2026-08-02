import { describe, expect, it } from "vitest";
import type { FacturXInvoiceInput } from "../src/index.js";
import { computeLineNetTotal, computeTotals, roundAmount } from "../src/index.js";

const baseInvoice = (
	overrides: Partial<FacturXInvoiceInput> = {},
): FacturXInvoiceInput => ({
	id: "INV-1",
	typeCode: "380",
	issueDate: "2026-06-01",
	currency: "EUR",
	seller: {
		name: "Seller SARL",
		address: {
			line1: "1 Rue Test",
			postcode: "75001",
			city: "Paris",
			country: "FR",
		},
		vatId: "FR11999999998",
	},
	buyer: { name: "Buyer BV", address: { country: "BE" } },
	lines: [
		{
			id: "1",
			product: { name: "Consulting" },
			grossPrice: { amount: 90 },
			quantity: 1,
			unitCode: "C62",
			tax: { categoryCode: "S", rateApplicablePercent: 20 },
		},
	],
	...overrides,
});

describe("roundAmount", () => {
	it("rounds half away from zero", () => {
		expect(roundAmount(1.005)).toBe(1.01);
		expect(roundAmount(-1.005)).toBe(-1.01);
		expect(roundAmount(2.675)).toBe(2.68);
		expect(roundAmount(1.004)).toBe(1);
	});
});

describe("computeLineNetTotal", () => {
	it("multiplies net price by quantity", () => {
		expect(
			computeLineNetTotal({
				id: "1",
				product: { name: "x" },
				netPrice: { amount: 12.34 },
				quantity: 3,
				unitCode: "C62",
				tax: { categoryCode: "S", rateApplicablePercent: 21 },
			}),
		).toBe(37.02);
	});

	it("derives the net price from gross price minus allowances", () => {
		expect(
			computeLineNetTotal({
				id: "1",
				product: { name: "x" },
				grossPrice: { amount: 100, allowances: [{ actualAmount: 10 }] },
				quantity: 2,
				unitCode: "C62",
				tax: { categoryCode: "S", rateApplicablePercent: 21 },
			}),
		).toBe(180);
	});

	it("honors the price basis quantity", () => {
		expect(
			computeLineNetTotal({
				id: "1",
				product: { name: "x" },
				netPrice: { amount: 10, basisQuantity: 100 },
				quantity: 250,
				unitCode: "C62",
				tax: { categoryCode: "S", rateApplicablePercent: 21 },
			}),
		).toBe(25);
	});
});

describe("computeTotals", () => {
	it("computes a simple single-line invoice", () => {
		const invoice = computeTotals(baseInvoice());
		expect(invoice.lines?.[0]?.netTotal).toBe(90);
		expect(invoice.taxBreakdown).toEqual([
			{
				calculatedAmount: 18,
				typeCode: "VAT",
				basisAmount: 90,
				categoryCode: "S",
				rateApplicablePercent: 20,
			},
		]);
		expect(invoice.totals).toMatchObject({
			lineTotal: 90,
			taxBasisTotal: 90,
			taxTotal: 18,
			grandTotal: 108,
			duePayable: 108,
		});
		expect(invoice.profile).toBe("urn:cen.eu:en16931:2017");
	});

	it("groups the breakdown per category and rate", () => {
		const invoice = computeTotals(
			baseInvoice({
				lines: [
					{
						id: "1",
						product: { name: "A" },
						netPrice: { amount: 100 },
						quantity: 1,
						unitCode: "C62",
						tax: { categoryCode: "S", rateApplicablePercent: 20 },
					},
					{
						id: "2",
						product: { name: "B" },
						netPrice: { amount: 50 },
						quantity: 2,
						unitCode: "C62",
						tax: { categoryCode: "S", rateApplicablePercent: 20 },
					},
					{
						id: "3",
						product: { name: "C" },
						netPrice: { amount: 40 },
						quantity: 1,
						unitCode: "C62",
						tax: { categoryCode: "S", rateApplicablePercent: 5.5 },
					},
				],
			}),
		);
		expect(invoice.taxBreakdown).toHaveLength(2);
		expect(invoice.taxBreakdown).toContainEqual(
			expect.objectContaining({
				categoryCode: "S",
				rateApplicablePercent: 20,
				basisAmount: 200,
				calculatedAmount: 40,
			}),
		);
		expect(invoice.taxBreakdown).toContainEqual(
			expect.objectContaining({
				categoryCode: "S",
				rateApplicablePercent: 5.5,
				basisAmount: 40,
				calculatedAmount: 2.2,
			}),
		);
		expect(invoice.totals?.grandTotal).toBe(282.2);
	});

	it("handles reverse charge with a default VATEX code", () => {
		const invoice = computeTotals(
			baseInvoice({
				lines: [
					{
						id: "1",
						product: { name: "A" },
						netPrice: { amount: 100 },
						quantity: 1,
						unitCode: "C62",
						tax: { categoryCode: "AE" },
					},
				],
			}),
			{ exemptionReasons: [{ categoryCode: "AE", reason: "Reverse charge" }] },
		);
		expect(invoice.taxBreakdown).toEqual([
			{
				calculatedAmount: 0,
				typeCode: "VAT",
				exemptionReason: "Reverse charge",
				exemptionReasonCode: "VATEX-EU-AE",
				basisAmount: 100,
				categoryCode: "AE",
				rateApplicablePercent: 0,
			},
		]);
		expect(invoice.totals?.grandTotal).toBe(100);
	});

	it("applies document-level allowances and charges to their category basis", () => {
		const invoice = computeTotals(
			baseInvoice({
				lines: [
					{
						id: "1",
						product: { name: "A" },
						netPrice: { amount: 100 },
						quantity: 1,
						unitCode: "C62",
						tax: { categoryCode: "S", rateApplicablePercent: 20 },
					},
				],
				allowances: [
					{
						actualAmount: 10,
						reason: "Loyalty discount",
						tax: { categoryCode: "S", rateApplicablePercent: 20 },
					},
				],
				charges: [
					{
						actualAmount: 5,
						reason: "Shipping",
						tax: { categoryCode: "S", rateApplicablePercent: 20 },
					},
				],
			}),
		);
		expect(invoice.taxBreakdown).toEqual([
			expect.objectContaining({ basisAmount: 95, calculatedAmount: 19 }),
		]);
		expect(invoice.totals).toMatchObject({
			lineTotal: 100,
			allowanceTotal: 10,
			chargeTotal: 5,
			taxBasisTotal: 95,
			taxTotal: 19,
			grandTotal: 114,
		});
	});

	it("applies rounding and prepaid amounts to the amount due (BR-CO-16)", () => {
		const invoice = computeTotals(baseInvoice(), {
			roundingAmount: 0.02,
			prepaidAmount: 50,
		});
		expect(invoice.totals).toMatchObject({
			grandTotal: 108,
			roundingAmount: 0.02,
			prepaidAmount: 50,
			duePayable: 58.02,
		});
	});

	it("expresses the tax total in the tax currency when requested", () => {
		const invoice = computeTotals(
			baseInvoice({ currency: "SEK", taxCurrency: "EUR" }),
			{ taxCurrencyExchangeRate: 0.0875 },
		);
		expect(invoice.totals?.taxTotal).toBe(18);
		expect(invoice.totals?.taxTotalInTaxCurrency).toBe(1.58);
	});

	it("keeps per-line rounding consistent on many small lines", () => {
		const lines = Array.from({ length: 10 }, (_, index) => ({
			id: String(index + 1),
			product: { name: `Item ${index + 1}` },
			netPrice: { amount: 0.333 },
			quantity: 1,
			unitCode: "C62",
			tax: { categoryCode: "S", rateApplicablePercent: 20 },
		}));
		const invoice = computeTotals(baseInvoice({ lines }));
		// Each line rounds to 0.33; the document sums the rounded lines.
		expect(invoice.totals?.lineTotal).toBe(3.3);
		expect(invoice.totals?.taxTotal).toBe(0.66);
	});
});
