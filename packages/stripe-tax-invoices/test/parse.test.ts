import { describe, expect, it } from "vitest";
import { StripeTaxInvoiceParseError } from "../src/errors.js";
import { parseStripeTaxInvoiceRows } from "../src/parse.js";
import {
	currencyHeading,
	feeLine,
	FOOTER,
	HEADER,
	type Line,
	layout,
	totalLine,
} from "./fixtures.js";

const parse = (...pages: Line[][]) => {
	const { items, rows } = layout(...pages);
	return parseStripeTaxInvoiceRows(items, rows);
};

/** The layout up to mid-2026: fee categories, each with a description line. */
const AGGREGATED: Line[] = [
	...HEADER,
	currencyHeading(487, "EUR"),
	feeLine(460, "Stripe Processing Fees", "€40.62", "€0.00"),
	[445, [[55, "1 other payment totaling €1,242.00"]]],
	feeLine(421, "Invoicing", "€4.97", "€0.00"),
	[406, [[55, "Fees for Invoicing"]]],
	totalLine(381, "Stripe Fees", "€45.59"),
	totalLine(357, "Total VAT", "€0.00"),
	totalLine(332, "Total", "€45.59"),
	totalLine(308, "Debited from your Balance", "–€45.59"),
	totalLine(283, "Amount Due", "€0.00"),
	...FOOTER,
];

/** The layout from mid-2026: named products, no balance rows. */
const ITEMIZED: Line[] = [
	...HEADER,
	currencyHeading(487, "EUR"),
	feeLine(460, "Card payments - Stripe fee", "€6.86", "€0.00"),
	totalLine(435, "Stripe Fees", "€6.86"),
	totalLine(411, "Total VAT", "€0.00"),
	totalLine(386, "Total", "€6.86"),
	[
		332,
		[
			[
				54,
				"No payment needed, fees and taxes will be debited from your Stripe balance.",
			],
		],
	],
	...FOOTER.slice(1),
];

describe("parseStripeTaxInvoiceRows", () => {
	it("reads the identity block and both parties", () => {
		expect(parse(AGGREGATED)).toMatchObject({
			accountId: "acct_1EXAMPLE0000000000",
			invoiceNumber: "EXAMPLE0-2025-08",
			invoiceDate: "2025-09-01",
			serviceMonth: "2025-08",
			reverseCharge: true,
			supplier: {
				name: "Stripe Payments Europe, Limited",
				addressLines: [
					"One Wilton Park",
					"Wilton Place",
					"Dublin 2",
					"D02FX04",
					"Ireland",
				],
				taxNumber: "IE 3206488LH",
				taxNumberLabel: "Stripe VAT Number",
				email: null,
			},
			customer: {
				name: "Example Trading BV",
				addressLines: ["Rue Example 1", "Bruxelles", "1000", "BE"],
				taxNumber: "BE0123456789",
				taxNumberLabel: "Customer VAT Number",
				email: "billing@example.test",
			},
		});
	});

	it("reads a fee table with description lines and a full totals block", () => {
		const [section] = parse(AGGREGATED).sections;

		expect(section).toEqual({
			currency: "EUR",
			lines: [
				{
					description: "Stripe Processing Fees",
					detail: "1 other payment totaling €1,242.00",
					volume: { count: 1, kind: "other payment", amount: 1242 },
					feeAmount: 40.62,
					vatAmount: 0,
					lineOrder: 0,
				},
				{
					description: "Invoicing",
					detail: "Fees for Invoicing",
					volume: null,
					feeAmount: 4.97,
					vatAmount: 0,
					lineOrder: 1,
				},
			],
			stripeFees: 45.59,
			totalVat: 0,
			total: 45.59,
			debitedFromBalance: -45.59,
			amountDue: 0,
		});
	});

	it("reads the newer layout, where the balance rows are prose instead", () => {
		const [section] = parse(ITEMIZED).sections;

		expect(section).toMatchObject({
			lines: [
				{
					description: "Card payments - Stripe fee",
					detail: null,
					volume: null,
					feeAmount: 6.86,
				},
			],
			total: 6.86,
			debitedFromBalance: null,
			amountDue: null,
		});
	});

	it("keeps each transfer currency and its totals apart", () => {
		const invoice = parse([
			...HEADER,
			currencyHeading(487, "EUR"),
			feeLine(460, "Stripe Processing Fees", "€40.62", "€0.00"),
			totalLine(435, "Stripe Fees", "€40.62"),
			totalLine(411, "Total", "€40.62"),
			[386, [[54, "The total above has been debited from your Stripe balance."]]],
			currencyHeading(340, "USD"),
			feeLine(313, "Stripe Processing Fees", "$12.30", "$0.00"),
			totalLine(288, "Stripe Fees", "$12.30"),
			totalLine(264, "Total", "$12.30"),
			...FOOTER,
		]);

		expect(invoice.sections).toMatchObject([
			{ currency: "EUR", total: 40.62, lines: [{ feeAmount: 40.62 }] },
			{ currency: "USD", total: 12.3, lines: [{ feeAmount: 12.3 }] },
		]);
	});

	it("continues a fee table across a page break without swallowing the footer", () => {
		const invoice = parse(
			[
				...HEADER,
				currencyHeading(487, "EUR"),
				feeLine(460, "Stripe Processing Fees", "€40.62", "€0.00"),
				[445, [[55, "9 card payments totaling €1,242.00"]]],
				[
					32,
					[
						[
							54,
							"Questions? We're here to help. Contact us at support.stripe.com.",
						],
						[456, "Aug 2025 — Page 1 of 2", 558],
					],
				],
			],
			[
				feeLine(700, "Invoicing", "€4.97", "€0.00"),
				totalLine(675, "Stripe Fees", "€45.59"),
				totalLine(650, "Total", "€45.59"),
				...FOOTER,
			],
		);

		const [section] = invoice.sections;
		expect(section?.lines.map((line) => line.description)).toEqual([
			"Stripe Processing Fees",
			"Invoicing",
		]);
		expect(section?.lines[1]?.detail).toBeNull();
		expect(section?.total).toBe(45.59);
	});

	it("reads payment counts written with a thousands separator", () => {
		const invoice = parse([
			...HEADER,
			currencyHeading(487, "EUR"),
			feeLine(460, "Stripe Processing Fees", "€4,062.10", "€0.00"),
			[445, [[55, "1,204 card payments totaling €124,200.00"]]],
			totalLine(421, "Total", "€4,062.10"),
			...FOOTER,
		]);

		expect(invoice.sections[0]?.lines[0]).toMatchObject({
			feeAmount: 4062.1,
			volume: { count: 1204, kind: "card payments", amount: 124200 },
		});
	});

	it("rejects a PDF that is not a Stripe tax invoice", () => {
		const { items, rows } = layout([[700, [[54, "Rappel de paiement"]]]]);

		expect(() => parseStripeTaxInvoiceRows(items, rows)).toThrowError(
			expect.objectContaining({
				name: "StripeTaxInvoiceParseError",
				code: "not_a_stripe_tax_invoice",
			}),
		);
	});

	it("rejects an invoice whose service month is missing", () => {
		const withoutServiceMonth = AGGREGATED.filter(
			([, cells]) => !cells.some(([, text]) => text === "Service Month"),
		);

		expect(() => parse(withoutServiceMonth)).toThrowError(
			StripeTaxInvoiceParseError,
		);
	});

	it("rejects an invoice with no fee table", () => {
		expect(() => parse(HEADER)).toThrowError(
			expect.objectContaining({ code: "missing_field" }),
		);
	});
});
