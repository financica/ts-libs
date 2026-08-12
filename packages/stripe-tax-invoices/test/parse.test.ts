import { describe, expect, it } from "vitest";
import { StripeTaxInvoiceParseError } from "../src/errors.js";
import { parseStripeTaxInvoiceRows } from "../src/parse.js";
import {
	conversionHeading,
	currencyHeading,
	exchangeRateLine,
	feeLine,
	FOOTER,
	HEADER,
	type Line,
	layout,
	totalLine,
	wrappedDebitedLines,
} from "./fixtures.js";

const parse = (...pages: Line[][]) => {
	const { items, rows } = layout(...pages);
	return parseStripeTaxInvoiceRows(items, rows);
};

/** One currency, settled out of the balance: the common invoice. */
const SINGLE_CURRENCY: Line[] = [
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

/**
 * Two currencies: a USD table restated in EUR, then the EUR table, then the
 * invoice's own totals and the rate they were converted at.
 */
const MULTI_CURRENCY: Line[][] = [
	[
		...HEADER,
		currencyHeading(474, "USD"),
		feeLine(446, "Billing - Usage Fee", "$0.40", "$0.00"),
		[432, [[55, "Fees for Billing volume"]]],
		feeLine(407, "Stripe Processing Fees", "$1.24", "$0.00"),
		[393, [[55, "1 card payment totaling $29.00"]]],
		conversionHeading(368, "USD", "EUR"),
		totalLine(340, "Stripe Fees", "$1.64", "€1.40"),
		totalLine(316, "Total VAT", "$0.00", "€0.00"),
		totalLine(291, "Total", "$1.64", "€1.40"),
		...wrappedDebitedLines(267, "–$1.64"),
		totalLine(227, "Amount Due", "$0.00"),
		[
			32,
			[
				[54, "Questions? We're here to help."],
				[457, "Apr 2026 — Page 1 of 2", 558],
			],
		],
	],
	[
		currencyHeading(728, "EUR"),
		feeLine(700, "Billing - Usage Fee", "€2.45", "€0.00"),
		[685, [[55, "Fees for Billing volume"]]],
		feeLine(661, "Stripe Processing Fees", "€6.90", "€0.00"),
		[646, [[55, "1 other payment totaling €350.00"]]],
		totalLine(622, "Stripe Fees", "€9.35"),
		totalLine(597, "Total VAT", "€0.00"),
		totalLine(573, "Total", "€9.35"),
		totalLine(548, "Debited from your Balance", "–€9.35"),
		totalLine(524, "Amount Due", "€0.00"),
		totalLine(464, "Total VAT in EUR", "€0.00"),
		totalLine(428, "Total fees in EUR", "€10.75"),
		[398, [[54, "Exchange Rates (derived from average rate for period)"]]],
		exchangeRateLine(372, "USD / EUR", "0.8555883449056172"),
		[350, [[54, "The totals above have been debited from your Stripe balance."]]],
		[
			323,
			[
				[
					54,
					"It is the responsibility of the customer to determine the correct local treatment",
				],
			],
		],
	],
];

describe("parseStripeTaxInvoiceRows", () => {
	it("reads the identity block and both parties", () => {
		expect(parse(SINGLE_CURRENCY)).toMatchObject({
			accountId: "acct_1EXAMPLE0000000000",
			invoiceNumber: "EXAMPLE0-2025-08",
			invoiceDate: "2025-09-01",
			serviceMonth: "2025-08",
			reverseCharge: true,
			reverseChargeNote: "Reverse Charge VAT may be applicable.",
			settlementNote:
				"The total above has been debited from your Stripe balance.",
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
		const invoice = parse(SINGLE_CURRENCY);

		expect(invoice.sections).toEqual([
			{
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
				totals: {
					stripeFees: 45.59,
					totalVat: 0,
					total: 45.59,
					debitedFromBalance: -45.59,
					amountDue: 0,
				},
				convertedCurrency: null,
				convertedTotals: null,
			},
		]);
	});

	it("takes the sole section's totals as the invoice's when nothing is converted", () => {
		expect(parse(SINGLE_CURRENCY)).toMatchObject({
			totals: { currency: "EUR", fees: 45.59, vat: 0 },
			exchangeRates: [],
			exchangeRateBasis: null,
		});
	});

	it("keeps each transfer currency, and its own totals, apart", () => {
		const invoice = parse(...MULTI_CURRENCY);

		expect(invoice.sections).toMatchObject([
			{
				currency: "USD",
				convertedCurrency: "EUR",
				totals: {
					stripeFees: 1.64,
					total: 1.64,
					debitedFromBalance: -1.64,
					amountDue: 0,
				},
				convertedTotals: { stripeFees: 1.4, totalVat: 0, total: 1.4 },
			},
			{
				currency: "EUR",
				convertedCurrency: null,
				convertedTotals: null,
				totals: { total: 9.35, debitedFromBalance: -9.35 },
			},
		]);
	});

	it("reads the invoice totals and the rate the sections were converted at", () => {
		const invoice = parse(...MULTI_CURRENCY);

		expect(invoice).toMatchObject({
			totals: { currency: "EUR", fees: 10.75, vat: 0 },
			exchangeRates: [{ from: "USD", to: "EUR", rate: 0.8555883449056172 }],
			exchangeRateBasis: "derived from average rate for period",
			settlementNote:
				"The totals above have been debited from your Stripe balance.",
		});
		// €1.40 converted + €9.35 native is what the invoice says it comes to.
		expect(invoice.totals.fees).toBeCloseTo(
			(invoice.sections[0]?.convertedTotals?.total ?? 0) +
				(invoice.sections[1]?.totals.total ?? 0),
			2,
		);
	});

	it("reads a balance row whose label wraps onto a second line", () => {
		expect(parse(...MULTI_CURRENCY).sections[0]?.totals.debitedFromBalance).toBe(
			-1.64,
		);
	});

	it("does not mistake the invoice totals for a section total", () => {
		const eur = parse(...MULTI_CURRENCY).sections[1];

		// `Total VAT in EUR` sits in the same column as `Total VAT`.
		expect(eur?.totals.totalVat).toBe(0);
		expect(eur?.totals.total).toBe(9.35);
	});

	it("reads a refund line and a negative adjustment", () => {
		const invoice = parse([
			...HEADER,
			currencyHeading(487, "EUR"),
			feeLine(460, "Refunded Fees †", "€3.15", "€0.00"),
			[445, [[55, "1 other refund totaling –€29.75"]]],
			feeLine(421, "Fee Adjustment", "–€21.18", "€0.00"),
			[406, [[55, "1 adjustment totaling €21.18"]]],
			totalLine(381, "Total", "–€18.03"),
			...FOOTER,
			[
				210,
				[[54, "† Stripe payment fees are not refunded for partial refunds."]],
			],
		]);

		expect(invoice.sections[0]?.lines).toMatchObject([
			{
				description: "Refunded Fees †",
				volume: { count: 1, kind: "other refund", amount: -29.75 },
				feeAmount: 3.15,
			},
			{ description: "Fee Adjustment", feeAmount: -21.18 },
		]);
		expect(invoice.footnotes).toEqual([
			"† Stripe payment fees are not refunded for partial refunds.",
		]);
	});

	it("reads the same fee name twice in one section", () => {
		const invoice = parse([
			...HEADER,
			currencyHeading(487, "EUR"),
			feeLine(460, "Stripe Processing Fees", "€0.71", "€0.00"),
			[445, [[55, "1 card payment totaling €24.20"]]],
			feeLine(421, "Stripe Processing Fees", "€10.21", "€0.00"),
			[406, [[55, "3 other payments totaling €504.75"]]],
			totalLine(381, "Total", "€10.92"),
			...FOOTER,
		]);

		expect(invoice.sections[0]?.lines.map((line) => line.volume)).toEqual([
			{ count: 1, kind: "card payment", amount: 24.2 },
			{ count: 3, kind: "other payments", amount: 504.75 },
		]);
	});

	it("reads the other wording of the reverse-charge note", () => {
		const rows = HEADER.map(
			([y, cells]): Line => [
				y,
				cells.map((cell) =>
					cell[1] === "Reverse Charge VAT may be applicable."
						? ([316, "VAT reverse charge applies.", 472] as const)
						: cell,
				) as Line[1],
			],
		);

		expect(
			parse([
				...rows,
				currencyHeading(487, "EUR"),
				totalLine(381, "Total", "€1.00"),
			]),
		).toMatchObject({
			reverseCharge: true,
			reverseChargeNote: "VAT reverse charge applies.",
		});
	});

	it("leaves the balance rows null when the invoice has not been settled yet", () => {
		const invoice = parse([
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
		]);

		expect(invoice.sections[0]?.totals).toMatchObject({
			total: 6.86,
			debitedFromBalance: null,
			amountDue: null,
		});
		expect(invoice.settlementNote).toBe(
			"No payment needed, fees and taxes will be debited from your Stripe balance.",
		);
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
		expect(section?.totals.total).toBe(45.59);
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
		const withoutServiceMonth = SINGLE_CURRENCY.filter(
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
