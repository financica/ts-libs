import { describe, expect, it } from "vitest";
import {
	DOCUMENT_TYPE_CODES,
	PAYMENT_MEANS_CODES,
	TAX_CATEGORY_CODES,
	UNIT_CODES,
	computeTotals,
	type FacturXInvoiceInput,
} from "../src/index.js";
import { FacturXBuildError, buildFacturXXml } from "../src/generate/index.js";
import { parseFacturXXml } from "../src/parse/index.js";

const input = (): FacturXInvoiceInput => ({
	id: "INV-2026-042",
	typeCode: DOCUMENT_TYPE_CODES.COMMERCIAL_INVOICE,
	issueDate: "2026-06-01",
	currency: "EUR",
	notes: [{ content: "Merci de votre confiance." }],
	seller: {
		name: "Financica Test SARL",
		legalOrganization: { id: { id: "552100554", schemeId: "0002" } },
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
		expect(xml).toContain("rsm:CrossIndustryInvoice");
		expect(xml).toContain("urn:cen.eu:en16931:2017");

		const { invoice: parsed, profile, warnings } = parseFacturXXml(xml);
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
		const order = [
			"rsm:ExchangedDocumentContext",
			"rsm:ExchangedDocument",
			"rsm:SupplyChainTradeTransaction",
			"ram:IncludedSupplyChainTradeLineItem",
			"ram:ApplicableHeaderTradeAgreement",
			"ram:SellerTradeParty",
			"ram:BuyerTradeParty",
			"ram:ApplicableHeaderTradeDelivery",
			"ram:ApplicableHeaderTradeSettlement",
		];
		// Match the opening tag whether it has children, attributes, or is
		// self-closing (the mandatory empty delivery element renders as />).
		const tagIndex = (tag: string, from = 0) => {
			const match = new RegExp(`<${tag}[\\s/>]`).exec(xml.slice(from));
			return match ? from + match.index : -1;
		};
		let previous = -1;
		for (const tag of order) {
			const index = tagIndex(tag);
			expect(index, tag).toBeGreaterThan(previous);
			previous = index;
		}
		// Header settlement members in schema order (searched after the
		// settlement opens, so line-level twins don't match first).
		const settlementStart = xml.indexOf("<ram:ApplicableHeaderTradeSettlement");
		const settlementOrder = [
			"ram:InvoiceCurrencyCode",
			"ram:SpecifiedTradeSettlementPaymentMeans",
			"ram:ApplicableTradeTax",
			"ram:SpecifiedTradePaymentTerms",
			"ram:SpecifiedTradeSettlementHeaderMonetarySummation",
		];
		previous = settlementStart;
		for (const tag of settlementOrder) {
			const index = tagIndex(tag, settlementStart);
			expect(index, tag).toBeGreaterThan(previous);
			previous = index;
		}
		// Monetary summation members in schema order.
		const summation = [
			"ram:LineTotalAmount",
			"ram:TaxBasisTotalAmount",
			"ram:TaxTotalAmount",
			"ram:GrandTotalAmount",
			"ram:DuePayableAmount",
		];
		previous = -1;
		for (const tag of summation) {
			const index = tagIndex(tag);
			expect(index, tag).toBeGreaterThan(previous);
			previous = index;
		}
	});

	it("escapes XML special characters", () => {
		const xml = buildFacturXXml(computeTotals(input()));
		expect(xml).toContain("Heures prestées &amp; suivi");
	});

	it("supports credit notes with preceding invoice references", () => {
		const invoice = computeTotals({
			...input(),
			typeCode: DOCUMENT_TYPE_CODES.CREDIT_NOTE,
			precedingInvoices: [{ id: "INV-2026-001", issueDate: "2026-01-15" }],
		});
		const xml = buildFacturXXml(invoice);
		expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
		expect(xml).toContain("<ram:InvoiceReferencedDocument>");
		expect(xml).toContain("INV-2026-001");
		const { invoice: parsed } = parseFacturXXml(xml);
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
		const xml = buildFacturXXml(invoice);
		expect(xml).toContain("<ram:RoundingAmount>0.01</ram:RoundingAmount>");
		expect(xml).toContain("<ram:TotalPrepaidAmount>20.00</ram:TotalPrepaidAmount>");
		expect(xml).toContain(
			"<ram:ExemptionReason>Reverse charge</ram:ExemptionReason>",
		);
		expect(xml).toContain(
			"<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>",
		);
		const { invoice: parsed } = parseFacturXXml(xml);
		expect(parsed.totals?.duePayable).toBe(80.01);
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
});
