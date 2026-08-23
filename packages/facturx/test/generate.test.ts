import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
	DOCUMENT_TYPE_CODES,
	PAYMENT_MEANS_CODES,
	TAX_CATEGORY_CODES,
	UNIT_CODES,
	computeTotals,
	type FacturXInvoiceInput,
} from "../src/index.js";
import {
	FacturXBuildError,
	buildFacturXXml,
	validateForBuild,
} from "../src/generate/index.js";
import { parseFacturXXml } from "../src/parse/index.js";

type OrderedNode = Record<string, OrderedNode[]> & { ":@"?: unknown };

/** Child element names of the first element called `name` under `nodes`. */
const childrenOf = (nodes: OrderedNode[], name: string): OrderedNode[] =>
	nodes.find((node) => name in node)?.[name] ?? [];

const names = (nodes: OrderedNode[]): string[] =>
	nodes.map((node) => Object.keys(node).find((key) => key !== ":@") ?? "");

/**
 * Assert `expected` appear in this relative order among `actual`
 * (deduplicated), ignoring elements not listed.
 */
const expectOrdered = (actual: string[], expected: string[]) => {
	const seen = actual.filter((name, i) => actual.indexOf(name) === i);
	expect(seen.filter((name) => expected.includes(name))).toEqual(expected);
};

const input = (): FacturXInvoiceInput => ({
	id: "INV-2026-042",
	typeCode: DOCUMENT_TYPE_CODES.COMMERCIAL_INVOICE,
	issueDate: "2026-06-01",
	currency: "EUR",
	notes: [{ content: "Merci de votre confiance." }],
	seller: {
		name: "Financica Test SARL",
		legalOrganization: { id: { id: "552100554", schemeId: "0002" } },
		// The schemeID attribute carries a double quote (escapeAttribute) and
		// the id carries text specials; "Heures prestées & suivi" covers text.
		globalIds: [{ id: "<G&1>", schemeId: 'x"y' }],
		address: {
			line1: "1 Rue de la Paix",
			postcode: "75002",
			city: "Paris",
			country: "FR",
		},
		vatId: "FR11999999998",
	},
	buyer: {
		name: "Prime Tech SARL",
		address: {
			line1: "10 Tech Park Avenue",
			postcode: "69001",
			city: "Lyon",
			country: "FR",
		},
		vatId: "FR40303265045",
	},
	purchaseOrderReference: "PO-7788",
	paymentMeans: [
		{
			typeCode: PAYMENT_MEANS_CODES.SEPA_CREDIT_TRANSFER,
			payeeAccount: {
				iban: "FR7630006000011234567890189",
				bic: "AGRIFRPP",
				accountName: "Financica Test",
			},
		},
	],
	paymentTerms: { description: "Payable under 30 days", dueDate: "2026-07-01" },
	lines: [
		{
			id: "1",
			product: { name: "Consulting services" },
			grossPrice: { amount: 90 },
			quantity: 1,
			unitCode: UNIT_CODES.HOUR,
			tax: {
				categoryCode: TAX_CATEGORY_CODES.STANDARD_RATE,
				rateApplicablePercent: 20,
			},
		},
		{
			id: "2",
			product: { name: "Heures prestées & suivi" },
			grossPrice: { amount: 25, allowances: [{ actualAmount: 5 }] },
			quantity: 1.5,
			unitCode: UNIT_CODES.HOUR,
			tax: {
				categoryCode: TAX_CATEGORY_CODES.STANDARD_RATE,
				rateApplicablePercent: 20,
			},
		},
	],
});

describe("buildFacturXXml", () => {
	it("produces well-formed XML that round-trips through the parser", () => {
		const invoice = computeTotals(input());
		const xml = buildFacturXXml(invoice);

		const { invoice: parsed, profile, warnings } = parseFacturXXml(xml)!;
		expect(profile).toBe("en16931");
		expect(warnings).toEqual([]);
		expect(parsed).toMatchObject({
			id: "INV-2026-042",
			typeCode: "380",
			issueDate: "2026-06-01",
			currency: "EUR",
			purchaseOrderReference: "PO-7788",
		});
		expect(parsed.seller).toMatchObject({
			name: "Financica Test SARL",
			vatId: "FR11999999998",
			legalOrganization: { id: { id: "552100554", schemeId: "0002" } },
			globalIds: [{ id: "<G&1>", schemeId: 'x"y' }],
			address: { city: "Paris", country: "FR" },
		});
		expect(parsed.lines?.[1]).toMatchObject({
			product: { name: "Heures prestées & suivi" },
			grossPrice: { amount: 25, allowances: [{ actualAmount: 5 }] },
			netPrice: { amount: 20 },
			quantity: 1.5,
			netTotal: 30,
		});
		expect(parsed.paymentMeans?.[0]).toMatchObject({
			typeCode: "58",
			payeeAccount: {
				iban: "FR7630006000011234567890189",
				bic: "AGRIFRPP",
				accountName: "Financica Test",
			},
		});
		expect(parsed.paymentTerms).toEqual({
			description: "Payable under 30 days",
			dueDate: "2026-07-01",
		});
		expect(parsed.totals).toMatchObject({
			lineTotal: 120,
			taxBasisTotal: 120,
			taxTotal: 24,
			grandTotal: 144,
			duePayable: 144,
		});
		expect(parsed.taxBreakdown).toEqual([
			expect.objectContaining({
				categoryCode: "S",
				rateApplicablePercent: 20,
				basisAmount: 120,
				calculatedAmount: 24,
			}),
		]);
	});

	it("emits CII elements in schema order", () => {
		const xml = buildFacturXXml(computeTotals(input()));
		const tree = new XMLParser({
			preserveOrder: true,
			ignoreAttributes: false,
			removeNSPrefix: true,
		}).parse(xml) as OrderedNode[];
		const cii = childrenOf(tree, "CrossIndustryInvoice");
		// CII D16B rsm:CrossIndustryInvoice sequence.
		expectOrdered(names(cii), [
			"ExchangedDocumentContext",
			"ExchangedDocument",
			"SupplyChainTradeTransaction",
		]);
		const transaction = childrenOf(cii, "SupplyChainTradeTransaction");
		expectOrdered(names(transaction), [
			"IncludedSupplyChainTradeLineItem",
			"ApplicableHeaderTradeAgreement",
			"ApplicableHeaderTradeDelivery",
			"ApplicableHeaderTradeSettlement",
		]);
		expectOrdered(
			names(childrenOf(transaction, "ApplicableHeaderTradeAgreement")),
			["SellerTradeParty", "BuyerTradeParty", "BuyerOrderReferencedDocument"],
		);
		const settlement = childrenOf(transaction, "ApplicableHeaderTradeSettlement");
		expectOrdered(names(settlement), [
			"InvoiceCurrencyCode",
			"SpecifiedTradeSettlementPaymentMeans",
			"ApplicableTradeTax",
			"SpecifiedTradePaymentTerms",
			"SpecifiedTradeSettlementHeaderMonetarySummation",
		]);
		expectOrdered(
			names(
				childrenOf(
					settlement,
					"SpecifiedTradeSettlementHeaderMonetarySummation",
				),
			),
			[
				"LineTotalAmount",
				"TaxBasisTotalAmount",
				"TaxTotalAmount",
				"GrandTotalAmount",
				"DuePayableAmount",
			],
		);
	});

	it("supports credit notes with preceding invoice references", () => {
		const invoice = computeTotals({
			...input(),
			typeCode: DOCUMENT_TYPE_CODES.CREDIT_NOTE,
			precedingInvoices: [{ id: "INV-2026-001", issueDate: "2026-01-15" }],
		});
		const { invoice: parsed } = parseFacturXXml(buildFacturXXml(invoice))!;
		// UNTDID 1001 code 381 = credit note.
		expect(parsed.typeCode).toBe("381");
		expect(parsed.precedingInvoices).toEqual([
			{ id: "INV-2026-001", issueDate: "2026-01-15" },
		]);
	});

	it("emits rounding, prepaid and exemption data", () => {
		const invoice = computeTotals(
			{
				...input(),
				lines: [
					{
						id: "1",
						product: { name: "Export" },
						netPrice: { amount: 100 },
						quantity: 1,
						unitCode: "C62",
						tax: { categoryCode: TAX_CATEGORY_CODES.VAT_REVERSE_CHARGE },
					},
				],
			},
			{
				roundingAmount: 0.01,
				prepaidAmount: 20,
				exemptionReasons: [{ categoryCode: "AE", reason: "Reverse charge" }],
			},
		);
		const { invoice: parsed } = parseFacturXXml(buildFacturXXml(invoice))!;
		// BR-CO-16: 100 − 20 prepaid + 0.01 rounding.
		expect(parsed.totals).toMatchObject({
			roundingAmount: 0.01,
			prepaidAmount: 20,
			grandTotal: 100,
			duePayable: 80.01,
		});
		// VATEX-EU-AE is the CEF VATEX code for reverse charge (BT-121).
		expect(parsed.taxBreakdown).toEqual([
			expect.objectContaining({
				categoryCode: "AE",
				exemptionReasonCode: "VATEX-EU-AE",
				exemptionReason: "Reverse charge",
			}),
		]);
	});

	it("throws FacturXBuildError listing the problems", () => {
		expect(() =>
			buildFacturXXml({
				id: "",
				typeCode: "380",
				issueDate: "junk",
				currency: "",
				seller: {},
				buyer: {},
			}),
		).toThrow(FacturXBuildError);
		try {
			buildFacturXXml({
				id: "",
				typeCode: "380",
				issueDate: "junk",
				currency: "",
				seller: {},
				buyer: {},
			});
		} catch (error) {
			const build = error as FacturXBuildError;
			expect(build.errors.length).toBeGreaterThanOrEqual(4);
			expect(build.errors.join(" ")).toContain("BT-1");
		}
	});

	it("throws FacturXBuildError naming an invalid nested date", () => {
		const invoice = computeTotals({
			...input(),
			paymentTerms: { dueDate: "01/07/2026" },
		});
		expect(() => buildFacturXXml(invoice)).toThrow(FacturXBuildError);
		expect(() => buildFacturXXml(invoice)).toThrow("01/07/2026");
	});

	it("validateForBuild returns problems without throwing", () => {
		const errors = validateForBuild({
			id: "X",
			typeCode: "380",
			issueDate: "2026-06-01",
			currency: "EUR",
			seller: { name: "S", address: { country: "FR" } },
			buyer: { name: "B" },
			// No totals, no lines.
		});
		expect(errors.join(" ")).toContain("BG-22");
		expect(errors.join(" ")).toContain("BG-25");
		expect(validateForBuild(computeTotals(input()))).toEqual([]);
	});
});
