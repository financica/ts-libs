import { describe, expect, it } from "vitest";
import {
	serializeUblDocument,
	type UblDocument,
	type UblParty,
} from "../src/build/index.js";

const party = (overrides: Partial<UblParty> = {}): UblParty => ({
	endpoint: { scheme: "0208", value: "0800279001" },
	name: "Acme BE",
	address: {
		street: "Rue de la Loi 16",
		additionalStreet: null,
		city: "Brussels",
		postalZone: "1000",
		countrySubentity: null,
		countryCode: "BE",
	},
	vatNumber: "BE0800279001",
	legalName: "Acme BE",
	companyId: { value: "0800279001", scheme: "0208" },
	...overrides,
});

const doc = (overrides: Partial<UblDocument> = {}): UblDocument => ({
	documentType: "invoice",
	id: "INV-001",
	issueDate: "2026-04-30",
	dueDate: "2026-05-30",
	note: "Test invoice",
	currency: "EUR",
	buyerReference: null,
	precedingInvoiceId: null,
	supplier: party(),
	customer: party({ name: "Test Customer", endpoint: null, companyId: null }),
	lines: [
		{
			id: "1",
			name: "Widget",
			quantity: 2,
			unitCode: "C62",
			lineExtensionAmount: 100,
			priceAmount: 50,
			taxCategory: { id: "S", percent: 21 },
		},
	],
	taxTotal: {
		taxAmount: 21,
		subtotals: [
			{ taxableAmount: 100, taxAmount: 21, category: { id: "S", percent: 21 } },
		],
	},
	monetaryTotal: {
		lineExtensionAmount: 100,
		taxExclusiveAmount: 100,
		taxInclusiveAmount: 121,
		payableAmount: 121,
	},
	attachments: [],
	...overrides,
});

/**
 * Opening-tag names inside `parent`, in document order. Only valid for parents
 * whose children are leaves — `cac:LegalMonetaryTotal` is one.
 */
const childOrder = (xml: string, parent: string): string[] => {
	const body = xml.match(new RegExp(`<${parent}>([\\s\\S]*?)</${parent}>`))?.[1];
	if (body === undefined) throw new Error(`<${parent}> not found`);
	return Array.from(body.matchAll(/<([\w:]+)[\s>]/g), (match) => match[1] as string);
};

describe("serializeUblDocument", () => {
	it("emits a BIS Billing 3.0 invoice", () => {
		const xml = serializeUblDocument(doc());

		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(xml).toContain(
			'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
		);
		expect(xml).toContain(
			"<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>",
		);
		expect(xml).toContain("<cbc:ID>INV-001</cbc:ID>");
		expect(xml).toContain("<cbc:IssueDate>2026-04-30</cbc:IssueDate>");
		expect(xml).toContain("<cbc:DueDate>2026-05-30</cbc:DueDate>");
		expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
		expect(xml).toContain(
			"<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>",
		);
		expect(xml).toContain(
			'<cbc:EndpointID schemeID="0208">0800279001</cbc:EndpointID>',
		);
		expect(xml).toContain(
			'<cbc:IdentificationCode listID="ISO3166-1:Alpha2">BE</cbc:IdentificationCode>',
		);
		expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">21.00</cbc:TaxAmount>');
		expect(xml).toContain(
			'<cbc:PayableAmount currencyID="EUR">121.00</cbc:PayableAmount>',
		);
		expect(xml).toContain("<cac:InvoiceLine>");
		expect(xml).toContain(
			'<cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity>',
		);
		// ClassifiedTaxCategory on the line.
		expect(xml).toMatch(/<cac:ClassifiedTaxCategory>[\s\S]*<cbc:ID>S<\/cbc:ID>/);
	});

	it("emits a credit note with type 381 and a billing reference", () => {
		const xml = serializeUblDocument(
			doc({
				documentType: "creditNote",
				id: "CN-001",
				dueDate: null,
				precedingInvoiceId: "INV-001",
			}),
		);

		expect(xml).toContain(
			'<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
		);
		expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
		expect(xml).not.toContain("<cbc:DueDate>");
		expect(xml).toContain("<cac:CreditNoteLine>");
		expect(xml).toContain(
			'<cbc:CreditedQuantity unitCode="C62">2</cbc:CreditedQuantity>',
		);
		expect(xml).toMatch(
			/<cac:BillingReference>[\s\S]*<cbc:ID>INV-001<\/cbc:ID>[\s\S]*<\/cac:BillingReference>/,
		);
	});

	it("escapes XML special characters in text", () => {
		const xml = serializeUblDocument(
			doc({ customer: party({ name: "Tom & Jerry <Ltd>", endpoint: null }) }),
		);
		expect(xml).toContain("Tom &amp; Jerry &lt;Ltd&gt;");
		expect(xml).not.toContain("Tom & Jerry <Ltd>");
	});

	it("emits BT-113/BT-114 before cbc:PayableAmount in the UBL sequence", () => {
		const xml = serializeUblDocument(
			doc({
				monetaryTotal: {
					lineExtensionAmount: 100,
					taxExclusiveAmount: 100,
					taxInclusiveAmount: 121,
					prepaidAmount: 121,
					payableRoundingAmount: 0.02,
					payableAmount: 0.02,
				},
			}),
		);

		expect(childOrder(xml, "cac:LegalMonetaryTotal")).toEqual([
			"cbc:LineExtensionAmount",
			"cbc:TaxExclusiveAmount",
			"cbc:TaxInclusiveAmount",
			"cbc:PrepaidAmount",
			"cbc:PayableRoundingAmount",
			"cbc:PayableAmount",
		]);
		expect(xml).toContain(
			'<cbc:PrepaidAmount currencyID="EUR">121.00</cbc:PrepaidAmount>',
		);
		expect(xml).toContain(
			'<cbc:PayableRoundingAmount currencyID="EUR">0.02</cbc:PayableRoundingAmount>',
		);
	});

	it("omits BT-113/BT-114 when absent or zero", () => {
		const xml = serializeUblDocument(
			doc({
				monetaryTotal: {
					lineExtensionAmount: 100,
					taxExclusiveAmount: 100,
					taxInclusiveAmount: 121,
					prepaidAmount: 0,
					payableAmount: 121,
				},
			}),
		);

		expect(childOrder(xml, "cac:LegalMonetaryTotal")).toEqual([
			"cbc:LineExtensionAmount",
			"cbc:TaxExclusiveAmount",
			"cbc:TaxInclusiveAmount",
			"cbc:PayableAmount",
		]);
	});

	it("includes an exemption reason for non-charging categories", () => {
		const xml = serializeUblDocument(
			doc({
				lines: [
					{
						id: "1",
						name: "Service",
						quantity: 1,
						unitCode: "C62",
						lineExtensionAmount: 100,
						priceAmount: 100,
						taxCategory: {
							id: "AE",
							percent: 0,
							exemptionReason: "Reverse charge",
						},
					},
				],
				taxTotal: {
					taxAmount: 0,
					subtotals: [
						{
							taxableAmount: 100,
							taxAmount: 0,
							category: {
								id: "AE",
								percent: 0,
								exemptionReason: "Reverse charge",
							},
						},
					],
				},
			}),
		);
		expect(xml).toContain(
			"<cbc:TaxExemptionReason>Reverse charge</cbc:TaxExemptionReason>",
		);
	});
});

describe("invoice period", () => {
	it("emits the document period between BuyerReference and BillingReference", () => {
		const xml = serializeUblDocument(
			doc({
				buyerReference: "PO-9",
				precedingInvoiceId: "INV-000",
				invoicePeriod: { startDate: "2026-01-01", endDate: "2026-01-31" },
			}),
		);

		expect(xml).toContain("<cbc:StartDate>2026-01-01</cbc:StartDate>");
		expect(xml).toContain("<cbc:EndDate>2026-01-31</cbc:EndDate>");
		// UBL's element sequence is fixed; a period out of order fails the schema.
		expect(xml.indexOf("cbc:BuyerReference")).toBeLessThan(
			xml.indexOf("cac:InvoicePeriod"),
		);
		expect(xml.indexOf("cac:InvoicePeriod")).toBeLessThan(
			xml.indexOf("cac:BillingReference"),
		);
	});

	it("emits a line period after LineExtensionAmount and before the Item", () => {
		const xml = serializeUblDocument(
			doc({
				lines: [
					{
						id: "1",
						name: "Widget",
						quantity: 2,
						unitCode: "C62",
						lineExtensionAmount: 100,
						priceAmount: 50,
						invoicePeriod: { startDate: "2026-01-15", endDate: null },
						taxCategory: { id: "S", percent: 21 },
					},
				],
			}),
		);

		expect(xml.indexOf("cbc:LineExtensionAmount")).toBeLessThan(
			xml.indexOf("cac:InvoicePeriod"),
		);
		expect(xml.indexOf("cac:InvoicePeriod")).toBeLessThan(xml.indexOf("cac:Item"));
		// A half-open period is legal; the absent bound is simply not emitted.
		expect(xml).toContain("<cbc:StartDate>2026-01-15</cbc:StartDate>");
		expect(xml).not.toContain("cbc:EndDate");
	});

	it("omits the element entirely when neither bound is set", () => {
		const xml = serializeUblDocument(
			doc({ invoicePeriod: { startDate: null, endDate: null } }),
		);
		expect(xml).not.toContain("cac:InvoicePeriod");
	});
});
