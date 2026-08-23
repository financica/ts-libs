import { describe, expect, it } from "vitest";
import {
	serializeUblDocument,
	serializeUblInvoice,
	UblBuildError,
	type UblInvoice,
	type UblLine,
	type UblParty,
} from "../src/build/index.js";

const party = (overrides: Partial<UblParty> = {}): UblParty => ({
	endpoint: { scheme: "0208", value: "0800279001" },
	name: "Acme BE",
	address: {
		street: "Rue de la Loi 16",
		city: "Brussels",
		postalZone: "1000",
		countryCode: "BE",
	},
	vatId: "BE0800279001",
	registrationName: "Acme BE",
	companyId: { value: "0800279001", scheme: "0208" },
	...overrides,
});

const line = (overrides: Partial<UblLine> = {}): UblLine => ({
	id: "1",
	description: "Widget",
	quantity: 2,
	unitCode: "C62",
	lineExtensionAmount: 100,
	unitPrice: 50,
	taxCategory: { id: "S", percent: 21 },
	...overrides,
});

const doc = (overrides: Partial<UblInvoice> = {}): UblInvoice => ({
	documentType: "Invoice",
	id: "INV-001",
	issueDate: "2026-04-30",
	dueDate: "2026-05-30",
	note: "Test invoice",
	currency: "EUR",
	seller: party(),
	buyer: party({ name: "Test Customer", endpoint: undefined, companyId: undefined }),
	lines: [line()],
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

	it("is also exported under the preferred name", () => {
		expect(serializeUblInvoice).toBe(serializeUblDocument);
	});

	it("emits cbc:Description and cbc:Name (BT-153 falls back to the description)", () => {
		const xml = serializeUblInvoice(doc());
		expect(xml).toContain("<cbc:Description>Widget</cbc:Description>");
		expect(xml).toContain("<cbc:Name>Widget</cbc:Name>");

		const named = serializeUblInvoice(
			doc({ lines: [line({ itemName: "WDG", description: "A widget" })] }),
		);
		expect(named).toContain("<cbc:Name>WDG</cbc:Name>");
		expect(named).toContain("<cbc:Description>A widget</cbc:Description>");
	});

	it("keeps the header values a parsed document carries", () => {
		const xml = serializeUblInvoice(
			doc({
				customizationId: "urn:example:custom",
				profileId: "urn:example:profile",
				invoiceTypeCode: "384",
			}),
		);
		expect(xml).toContain(
			"<cbc:CustomizationID>urn:example:custom</cbc:CustomizationID>",
		);
		expect(xml).toContain("<cbc:ProfileID>urn:example:profile</cbc:ProfileID>");
		expect(xml).toContain("<cbc:InvoiceTypeCode>384</cbc:InvoiceTypeCode>");
	});

	it("serializes an external-only attachment as an ExternalReference", () => {
		const xml = serializeUblInvoice(
			doc({
				attachments: [
					{ id: "pdf-1", externalUri: "https://example.com/inv.pdf" },
					{
						id: "pdf-2",
						filename: "inv.pdf",
						mimeCode: "application/pdf",
						base64Content: "AAAA",
					},
				],
			}),
		);
		expect(xml).toMatch(
			/<cac:ExternalReference>\s*<cbc:URI>https:\/\/example.com\/inv.pdf<\/cbc:URI>/,
		);
		expect(xml).toContain(
			'<cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="inv.pdf">AAAA</cbc:EmbeddedDocumentBinaryObject>',
		);
	});

	it("omits cbc:Percent for category O", () => {
		const category = { id: "O", exemptionReason: "Not subject to VAT" };
		const xml = serializeUblInvoice(
			doc({
				lines: [line({ taxCategory: category })],
				taxTotal: {
					taxAmount: 0,
					subtotals: [{ taxableAmount: 100, taxAmount: 0, category }],
				},
			}),
		);
		expect(xml).not.toContain("cbc:Percent");
		expect(xml).toContain("<cbc:ID>O</cbc:ID>");
	});
});

describe("serializeUblInvoice validation", () => {
	const failing = (overrides: Partial<UblInvoice>, path: string) => {
		expect(() => serializeUblInvoice(doc(overrides))).toThrow(UblBuildError);
		expect(() => serializeUblInvoice(doc(overrides))).toThrow(path);
	};

	it("names the error class", () => {
		let caught: unknown;
		try {
			serializeUblInvoice(doc({ lines: [] }));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(UblBuildError);
		expect((caught as Error).name).toBe("UblBuildError");
	});

	it("requires the header fields EN 16931 makes mandatory", () => {
		failing({ id: "" }, "BT-1");
		failing({ issueDate: "" }, "BT-2");
		failing({ currency: "" }, "BT-5");
		failing({ seller: party({ name: undefined }) }, "seller.name");
		failing({ buyer: party({ name: undefined }) }, "buyer.name");
		failing({ lines: [] }, "at least one line");
	});

	it("requires a scheme on an endpoint", () => {
		failing(
			{ seller: party({ endpoint: { value: "0800279001" } }) },
			"seller.endpoint.scheme",
		);
	});

	it("requires the line fields EN 16931 makes mandatory", () => {
		failing({ lines: [line({ quantity: undefined })] }, "lines[0].quantity");
		failing({ lines: [line({ unitCode: undefined })] }, "lines[0].unitCode");
		failing({ lines: [line({ unitPrice: undefined })] }, "lines[0].unitPrice");
		failing(
			{ lines: [line({ lineExtensionAmount: undefined })] },
			"lines[0].lineExtensionAmount",
		);
		failing({ lines: [line({ taxCategory: undefined })] }, "lines[0].taxCategory");
		failing(
			{ lines: [line({ taxCategory: { percent: 21 } })] },
			"lines[0].taxCategory.id",
		);
		failing(
			{ lines: [line({ taxCategory: { id: "S" } })] },
			"lines[0].taxCategory.percent",
		);
	});

	it("requires the totals", () => {
		failing({ taxTotal: { subtotals: [] } }, "taxTotal.taxAmount");
		failing(
			{
				monetaryTotal: {
					taxExclusiveAmount: 1,
					taxInclusiveAmount: 1,
					payableAmount: 1,
				},
			},
			"monetaryTotal.lineExtensionAmount",
		);
		failing(
			{
				monetaryTotal: {
					lineExtensionAmount: 1,
					taxInclusiveAmount: 1,
					payableAmount: 1,
				},
			},
			"monetaryTotal.taxExclusiveAmount",
		);
		failing(
			{
				monetaryTotal: {
					lineExtensionAmount: 1,
					taxExclusiveAmount: 1,
					payableAmount: 1,
				},
			},
			"monetaryTotal.taxInclusiveAmount",
		);
		failing(
			{
				monetaryTotal: {
					lineExtensionAmount: 1,
					taxExclusiveAmount: 1,
					taxInclusiveAmount: 1,
				},
			},
			"monetaryTotal.payableAmount",
		);
	});

	it("requires filename, MIME code and content on an embedded attachment", () => {
		failing(
			{
				attachments: [
					{ id: "a", mimeCode: "application/pdf", base64Content: "AA" },
				],
			},
			"attachments[0].filename",
		);
		failing(
			{ attachments: [{ id: "a", filename: "a.pdf", base64Content: "AA" }] },
			"attachments[0].mimeCode",
		);
		failing(
			{
				attachments: [
					{ id: "a", filename: "a.pdf", mimeCode: "application/pdf" },
				],
			},
			"attachments[0].base64Content",
		);
	});

	it("emits a credit note with type 381 and a billing reference", () => {
		const xml = serializeUblDocument(
			doc({
				documentType: "CreditNote",
				id: "CN-001",
				dueDate: undefined,
				billingReference: { invoiceId: "INV-001" },
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
			doc({ buyer: party({ name: "Tom & Jerry <Ltd>", endpoint: undefined }) }),
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
					line({
						description: "Service",
						quantity: 1,
						unitPrice: 100,
						taxCategory: {
							id: "AE",
							percent: 0,
							exemptionReason: "Reverse charge",
						},
					}),
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
				billingReference: { invoiceId: "INV-000" },
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

	it("emits BT-20 payment terms between the customer party and TaxTotal", () => {
		const xml = serializeUblDocument(
			doc({ paymentTermsNote: "Payable within 30 days" }),
		);

		expect(xml).toMatch(
			/<cac:PaymentTerms>\s*<cbc:Note>Payable within 30 days<\/cbc:Note>\s*<\/cac:PaymentTerms>/,
		);
		// UBL's element sequence is fixed; PaymentTerms out of order fails the schema.
		expect(xml.indexOf("cac:AccountingCustomerParty")).toBeLessThan(
			xml.indexOf("cac:PaymentTerms"),
		);
		expect(xml.indexOf("cac:PaymentTerms")).toBeLessThan(
			xml.indexOf("cac:TaxTotal"),
		);
	});

	it("omits PaymentTerms when there is no note", () => {
		expect(serializeUblDocument(doc())).not.toContain("cac:PaymentTerms");
	});

	it("emits a line period after LineExtensionAmount and before the Item", () => {
		const xml = serializeUblDocument(
			doc({
				lines: [line({ invoicePeriod: { startDate: "2026-01-15" } })],
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
		const xml = serializeUblDocument(doc({ invoicePeriod: {} }));
		expect(xml).not.toContain("cac:InvoicePeriod");
	});
});
