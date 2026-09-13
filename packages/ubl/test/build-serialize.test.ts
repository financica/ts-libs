import { describe, expect, it } from "vitest";
import {
	buildTaxTotals,
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
				monetaryTotal: {
					lineExtensionAmount: 100,
					taxExclusiveAmount: 100,
					taxInclusiveAmount: 100,
					payableAmount: 100,
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
				monetaryTotal: {
					lineExtensionAmount: 100,
					taxExclusiveAmount: 100,
					taxInclusiveAmount: 100,
					payableAmount: 100,
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

	it("emits BT-13/BT-14 between InvoicePeriod and BillingReference", () => {
		const xml = serializeUblDocument(
			doc({
				orderReference: "PO-4711",
				salesOrderId: "SO-12",
				billingReference: { invoiceId: "INV-000" },
				invoicePeriod: { startDate: "2026-01-01" },
			}),
		);

		expect(xml).toMatch(
			/<cac:OrderReference>\s*<cbc:ID>PO-4711<\/cbc:ID>\s*<cbc:SalesOrderID>SO-12<\/cbc:SalesOrderID>\s*<\/cac:OrderReference>/,
		);
		expect(xml.indexOf("cac:InvoicePeriod")).toBeLessThan(
			xml.indexOf("cac:OrderReference"),
		);
		expect(xml.indexOf("cac:OrderReference")).toBeLessThan(
			xml.indexOf("cac:BillingReference"),
		);
	});

	it("omits OrderReference when only the sales order id is known", () => {
		const xml = serializeUblDocument(doc({ salesOrderId: "SO-12" }));
		expect(xml).not.toContain("cac:OrderReference");
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

// ── 0.18.0: the rest of EN 16931 ───────────────────────────────────────

const consistent = (
	lines: UblLine[],
	options?: Parameters<typeof buildTaxTotals>[1],
): Partial<UblInvoice> => ({
	lines,
	...buildTaxTotals(lines, options),
	allowanceCharges: options?.allowanceCharges,
});

const between = (xml: string, before: string, tag: string, after: string): void => {
	expect(xml.indexOf(before)).toBeGreaterThan(-1);
	expect(xml.indexOf(tag)).toBeGreaterThan(-1);
	expect(xml.indexOf(after)).toBeGreaterThan(-1);
	expect(xml.indexOf(before)).toBeLessThan(xml.indexOf(tag));
	expect(xml.indexOf(tag)).toBeLessThan(xml.indexOf(after));
};

describe("header terms", () => {
	it("puts BT-7 after the note on an invoice and before the type code on a credit note", () => {
		const invoice = serializeUblInvoice(doc({ taxPointDate: "2026-04-15" }));
		between(
			invoice,
			"<cbc:Note>",
			"<cbc:TaxPointDate>",
			"<cbc:DocumentCurrencyCode>",
		);

		const creditNote = serializeUblInvoice(
			doc({ documentType: "CreditNote", taxPointDate: "2026-04-15" }),
		);
		between(
			creditNote,
			"<cbc:IssueDate>",
			"<cbc:TaxPointDate>",
			"<cbc:CreditNoteTypeCode>",
		);
	});

	it("refuses a tax point date next to a tax point date code (BR-CO-3)", () => {
		expect(() =>
			serializeUblInvoice(
				doc({
					taxPointDate: "2026-04-15",
					invoicePeriod: { startDate: "2026-04-01", descriptionCode: "35" },
				}),
			),
		).toThrow(/BR-CO-3/);
	});

	it("writes the tax point date code on the document period", () => {
		const xml = serializeUblInvoice(
			doc({ invoicePeriod: { startDate: "2026-04-01", descriptionCode: "35" } }),
		);
		expect(xml).toMatch(
			/<cac:InvoicePeriod>\s*<cbc:StartDate>2026-04-01<\/cbc:StartDate>\s*<cbc:DescriptionCode>35<\/cbc:DescriptionCode>\s*<\/cac:InvoicePeriod>/,
		);
	});

	it("emits BT-6 and a second TaxTotal carrying BT-111, and requires the latter (BR-53)", () => {
		const base = doc();
		const xml = serializeUblInvoice({
			...base,
			buyerReference: "Dept 7",
			taxCurrency: "SEK",
			taxTotal: { ...base.taxTotal, taxAmountInTaxCurrency: 231.5 },
		});
		between(
			xml,
			"<cbc:DocumentCurrencyCode>",
			"<cbc:TaxCurrencyCode>SEK</cbc:TaxCurrencyCode>",
			"<cbc:BuyerReference>",
		);
		expect(xml.match(/<cac:TaxTotal>/g)).toHaveLength(2);
		expect(xml).toMatch(
			/<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SEK">231.50<\/cbc:TaxAmount>\s*<\/cac:TaxTotal>\s*<cac:LegalMonetaryTotal>/,
		);
		expect(() => serializeUblInvoice({ ...base, taxCurrency: "SEK" })).toThrow(
			/BT-111/,
		);
	});

	it("emits BT-19 between the currency codes and the buyer reference", () => {
		const xml = serializeUblInvoice(
			doc({ accountingCost: "4711:CC-12", buyerReference: "Dept 7" }),
		);
		between(
			xml,
			"<cbc:DocumentCurrencyCode>",
			"<cbc:AccountingCost>4711:CC-12</cbc:AccountingCost>",
			"<cbc:BuyerReference>",
		);
	});

	it("emits the reference set (BT-11 to BT-18, BT-26) in sequence order", () => {
		const xml = serializeUblInvoice(
			doc({
				buyerReference: "Dept 7",
				invoicePeriod: { startDate: "2026-04-01" },
				orderReference: "PO-1",
				billingReference: {
					invoiceId: "INV-000",
					invoiceIssueDate: "2026-01-01",
				},
				despatchReference: "DESP-1",
				receivingAdviceReference: "RCPT-1",
				contractReference: "CTR-1",
				projectReference: "PRJ-1",
				tenderReference: "TND-1",
				invoicedObjectId: { value: "OBJ-1", scheme: "ABZ" },
				documentReferences: [{ id: "TERMS", description: "General terms" }],
			}),
		);
		const order = [
			"<cbc:BuyerReference>",
			"<cac:InvoicePeriod>",
			"<cac:OrderReference>",
			"<cac:BillingReference>",
			"<cac:DespatchDocumentReference>",
			"<cac:ReceiptDocumentReference>",
			"<cac:ContractDocumentReference>",
			"<cac:AdditionalDocumentReference>",
			"<cac:ProjectReference>",
			"<cac:AccountingSupplierParty>",
		];
		const positions = order.map((tag) => xml.indexOf(tag));
		expect(positions.every((position) => position > -1)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		expect(xml).toMatch(
			/<cac:InvoiceDocumentReference>\s*<cbc:ID>INV-000<\/cbc:ID>\s*<cbc:IssueDate>2026-01-01<\/cbc:IssueDate>/,
		);
		expect(xml).toMatch(
			/<cac:AdditionalDocumentReference>\s*<cbc:ID>TERMS<\/cbc:ID>\s*<cbc:DocumentDescription>General terms<\/cbc:DocumentDescription>\s*<\/cac:AdditionalDocumentReference>/,
		);
		expect(xml).toMatch(
			/<cbc:ID schemeID="ABZ">OBJ-1<\/cbc:ID>\s*<cbc:DocumentTypeCode>130<\/cbc:DocumentTypeCode>/,
		);
		expect(xml).toMatch(
			/<cbc:ID>TND-1<\/cbc:ID>\s*<cbc:DocumentTypeCode>50<\/cbc:DocumentTypeCode>/,
		);
		expect(xml).toMatch(/<cac:ProjectReference>\s*<cbc:ID>PRJ-1<\/cbc:ID>/);
	});

	it("writes a credit note's project reference as document type 50 and drops its tender reference", () => {
		const xml = serializeUblInvoice(
			doc({
				documentType: "CreditNote",
				projectReference: "PRJ-1",
				tenderReference: "TND-1",
			}),
		);
		expect(xml).not.toContain("cac:ProjectReference");
		expect(xml).not.toContain("TND-1");
		expect(xml).toMatch(
			/<cbc:ID>PRJ-1<\/cbc:ID>\s*<cbc:DocumentTypeCode>50<\/cbc:DocumentTypeCode>/,
		);
	});

	it("writes the attachment description (BT-123) before the attachment", () => {
		const xml = serializeUblInvoice(
			doc({
				attachments: [
					{
						filename: "a.pdf",
						mimeCode: "application/pdf",
						base64Content: "AAAA",
						description: "Timesheet",
					},
				],
			}),
		);
		expect(xml).toMatch(
			/<cbc:ID>a.pdf<\/cbc:ID>\s*<cbc:DocumentDescription>Timesheet<\/cbc:DocumentDescription>\s*<cac:Attachment>/,
		);
	});
});

describe("parties", () => {
	it("emits identifications, legal form and contact in the Party sequence", () => {
		const xml = serializeUblInvoice(
			doc({
				seller: party({
					partyIdentifications: [{ id: "0800279001", schemeId: "0208" }],
					companyLegalForm: "BV",
					contact: {
						name: "Ann",
						phone: "+32 2 000 00 00",
						email: "ann@acme.be",
					},
				}),
			}),
		);
		const supplier = xml.slice(
			xml.indexOf("<cac:AccountingSupplierParty>"),
			xml.indexOf("</cac:AccountingSupplierParty>"),
		);
		const order = [
			"<cbc:EndpointID",
			"<cac:PartyIdentification>",
			"<cac:PartyName>",
			"<cac:PostalAddress>",
			"<cac:PartyTaxScheme>",
			"<cac:PartyLegalEntity>",
			"<cac:Contact>",
		].map((tag) => supplier.indexOf(tag));
		expect(order.every((position) => position > -1)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(supplier).toMatch(/<cbc:ID schemeID="0208">0800279001<\/cbc:ID>/);
		expect(supplier).toMatch(
			/<cbc:CompanyID schemeID="0208">0800279001<\/cbc:CompanyID>\s*<cbc:CompanyLegalForm>BV<\/cbc:CompanyLegalForm>/,
		);
		expect(supplier).toMatch(
			/<cac:Contact>\s*<cbc:Name>Ann<\/cbc:Name>\s*<cbc:Telephone>\+32 2 000 00 00<\/cbc:Telephone>\s*<cbc:ElectronicMail>ann@acme.be<\/cbc:ElectronicMail>/,
		);
	});

	it("emits the payee (BG-10) and tax representative (BG-11) after the customer", () => {
		const xml = serializeUblInvoice(
			doc({
				payee: {
					name: "Factor NV",
					partyIdentifications: [{ id: "0999999999", schemeId: "0208" }],
					companyId: { value: "0999999999", scheme: "0208" },
				},
				taxRepresentative: {
					name: "Fiscal Rep SA",
					vatId: "FR12345678901",
					address: { city: "Lille", countryCode: "FR" },
				},
				delivery: { actualDeliveryDate: "2026-04-20" },
			}),
		);
		between(
			xml,
			"</cac:AccountingCustomerParty>",
			"<cac:PayeeParty>",
			"<cac:TaxRepresentativeParty>",
		);
		between(
			xml,
			"<cac:TaxRepresentativeParty>",
			"</cac:TaxRepresentativeParty>",
			"<cac:Delivery>",
		);
		expect(xml).toMatch(
			/<cac:PayeeParty>\s*<cac:PartyIdentification>\s*<cbc:ID schemeID="0208">0999999999<\/cbc:ID>\s*<\/cac:PartyIdentification>\s*<cac:PartyName>\s*<cbc:Name>Factor NV<\/cbc:Name>\s*<\/cac:PartyName>\s*<cac:PartyLegalEntity>\s*<cbc:CompanyID schemeID="0208">0999999999<\/cbc:CompanyID>/,
		);
		expect(xml).toMatch(
			/<cac:TaxRepresentativeParty>\s*<cac:PartyName>\s*<cbc:Name>Fiscal Rep SA<\/cbc:Name>\s*<\/cac:PartyName>\s*<cac:PostalAddress>[\s\S]*?<\/cac:PostalAddress>\s*<cac:PartyTaxScheme>\s*<cbc:CompanyID>FR12345678901<\/cbc:CompanyID>/,
		);
	});

	it("requires a payee name (BT-59) and the tax representative's name, VAT id and country", () => {
		expect(() =>
			serializeUblInvoice(doc({ payee: { companyId: { value: "1" } } })),
		).toThrow(/BT-59/);
		expect(() =>
			serializeUblInvoice(
				doc({
					taxRepresentative: { name: "Rep", address: { countryCode: "FR" } },
				}),
			),
		).toThrow(/BT-63/);
		expect(() =>
			serializeUblInvoice(
				doc({ taxRepresentative: { name: "Rep", vatId: "FR1" } }),
			),
		).toThrow(/BT-69/);
	});
});

describe("delivery", () => {
	it("emits BG-13 between the parties and the payment means", () => {
		const xml = serializeUblInvoice(
			doc({
				delivery: {
					actualDeliveryDate: "2026-04-20",
					locationId: { value: "5790000435951", scheme: "0088" },
					address: {
						street: "Kaai 1",
						city: "Antwerp",
						postalZone: "2000",
						countryCode: "BE",
					},
					partyName: "Globex warehouse",
				},
				paymentMeansList: [{ code: "58", iban: "BE71096123456769" }],
			}),
		);
		between(
			xml,
			"</cac:AccountingCustomerParty>",
			"<cac:Delivery>",
			"<cac:PaymentMeans>",
		);
		expect(xml).toMatch(
			/<cac:Delivery>\s*<cbc:ActualDeliveryDate>2026-04-20<\/cbc:ActualDeliveryDate>\s*<cac:DeliveryLocation>\s*<cbc:ID schemeID="0088">5790000435951<\/cbc:ID>\s*<cac:Address>\s*<cbc:StreetName>Kaai 1<\/cbc:StreetName>[\s\S]*?<\/cac:Address>\s*<\/cac:DeliveryLocation>\s*<cac:DeliveryParty>\s*<cac:PartyName>\s*<cbc:Name>Globex warehouse<\/cbc:Name>/,
		);
	});
});

describe("payment means", () => {
	it("emits a credit transfer with its account, name and BIC before the payment terms", () => {
		const xml = serializeUblInvoice(
			doc({
				paymentMeansList: [
					{
						code: "58",
						codeName: "SEPA credit transfer",
						paymentId: "+++090/9337/55023+++",
						iban: "BE71096123456769",
						accountName: "Acme BV",
						bic: "GKCCBEBB",
					},
				],
				paymentTermsNote: "30 days",
			}),
		);
		between(
			xml,
			"</cac:AccountingCustomerParty>",
			"<cac:PaymentMeans>",
			"<cac:PaymentTerms>",
		);
		expect(xml).toMatch(
			/<cac:PaymentMeans>\s*<cbc:PaymentMeansCode name="SEPA credit transfer">58<\/cbc:PaymentMeansCode>\s*<cbc:PaymentID>\+\+\+090\/9337\/55023\+\+\+<\/cbc:PaymentID>\s*<cac:PayeeFinancialAccount>\s*<cbc:ID>BE71096123456769<\/cbc:ID>\s*<cbc:Name>Acme BV<\/cbc:Name>\s*<cac:FinancialInstitutionBranch>\s*<cbc:ID>GKCCBEBB<\/cbc:ID>/,
		);
	});

	it("emits direct debit mandates and card accounts", () => {
		const xml = serializeUblInvoice(
			doc({
				paymentMeansList: [
					{
						code: "59",
						mandateId: "MANDATE-1",
						debitedAccount: "BE71096123456769",
					},
					{ code: "48", cardNumber: "1234", cardHolder: "J. Doe" },
				],
			}),
		);
		expect(xml).toMatch(
			/<cac:PaymentMandate>\s*<cbc:ID>MANDATE-1<\/cbc:ID>\s*<cac:PayerFinancialAccount>\s*<cbc:ID>BE71096123456769<\/cbc:ID>/,
		);
		expect(xml).toMatch(
			/<cac:CardAccount>\s*<cbc:PrimaryAccountNumberID>1234<\/cbc:PrimaryAccountNumberID>\s*<cbc:NetworkID>NA<\/cbc:NetworkID>\s*<cbc:HolderName>J. Doe<\/cbc:HolderName>/,
		);
	});

	it("puts a credit note's due date in the first payment means", () => {
		const xml = serializeUblInvoice(
			doc({
				documentType: "CreditNote",
				dueDate: "2026-05-30",
				paymentMeansList: [
					{ code: "58", iban: "BE71096123456769" },
					{ code: "1" },
				],
			}),
		);
		expect(xml).not.toContain("<cbc:DueDate>");
		expect(
			xml.match(/<cbc:PaymentDueDate>2026-05-30<\/cbc:PaymentDueDate>/g),
		).toHaveLength(1);
		expect(xml).toMatch(
			/<cbc:PaymentMeansCode>58<\/cbc:PaymentMeansCode>\s*<cbc:PaymentDueDate>/,
		);
	});

	it("requires a code, an account for a credit transfer and a mandate for a direct debit", () => {
		expect(() =>
			serializeUblInvoice(doc({ paymentMeansList: [{ iban: "BE71" }] })),
		).toThrow(/BT-81/);
		expect(() =>
			serializeUblInvoice(doc({ paymentMeansList: [{ code: "58" }] })),
		).toThrow(/BT-84/);
		expect(() =>
			serializeUblInvoice(doc({ paymentMeansList: [{ code: "59" }] })),
		).toThrow(/BT-89/);
	});
});

describe("document allowances and charges", () => {
	const shipping = {
		chargeIndicator: true,
		amount: 20,
		reason: "Shipping",
		reasonCode: "FC",
		taxCategory: { id: "S", percent: 21 },
	};
	const discount = {
		chargeIndicator: false,
		amount: 10,
		reason: "Volume discount",
		baseAmount: 100,
		multiplierFactorNumeric: 10,
		taxCategory: { id: "S", percent: 21 },
	};

	it("emits BG-20/BG-21 between the payment terms and the tax total, with BT-107/BT-108", () => {
		const xml = serializeUblInvoice(
			doc({
				paymentTermsNote: "30 days",
				...consistent([line()], { allowanceCharges: [discount, shipping] }),
			}),
		);
		between(xml, "</cac:PaymentTerms>", "<cac:AllowanceCharge>", "<cac:TaxTotal>");
		expect(xml).toMatch(
			/<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReason>Volume discount<\/cbc:AllowanceChargeReason>\s*<cbc:MultiplierFactorNumeric>10.00<\/cbc:MultiplierFactorNumeric>\s*<cbc:Amount currencyID="EUR">10.00<\/cbc:Amount>\s*<cbc:BaseAmount currencyID="EUR">100.00<\/cbc:BaseAmount>\s*<cac:TaxCategory>\s*<cbc:ID>S<\/cbc:ID>\s*<cbc:Percent>21.00<\/cbc:Percent>/,
		);
		expect(xml).toMatch(
			/<cbc:ChargeIndicator>true<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReasonCode>FC<\/cbc:AllowanceChargeReasonCode>\s*<cbc:AllowanceChargeReason>Shipping<\/cbc:AllowanceChargeReason>/,
		);
		expect(childOrder(xml, "cac:LegalMonetaryTotal")).toEqual([
			"cbc:LineExtensionAmount",
			"cbc:TaxExclusiveAmount",
			"cbc:TaxInclusiveAmount",
			"cbc:AllowanceTotalAmount",
			"cbc:ChargeTotalAmount",
			"cbc:PayableAmount",
		]);
		expect(xml).toContain(
			'<cbc:TaxExclusiveAmount currencyID="EUR">110.00</cbc:TaxExclusiveAmount>',
		);
		expect(xml).toContain(
			'<cbc:TaxableAmount currencyID="EUR">110.00</cbc:TaxableAmount>',
		);
	});

	it("requires an amount, a reason and a VAT category, and checks the percentage (R040)", () => {
		const base = doc();
		const withItem = (item: Record<string, unknown>) =>
			serializeUblInvoice({
				...base,
				allowanceCharges: [{ chargeIndicator: true, ...item }],
			});
		expect(() =>
			withItem({ reason: "x", taxCategory: { id: "S", percent: 21 } }),
		).toThrow(/BT-92\/BT-99/);
		expect(() =>
			withItem({ amount: 1, taxCategory: { id: "S", percent: 21 } }),
		).toThrow(/BT-97\/BT-98/);
		expect(() => withItem({ amount: 1, reason: "x" })).toThrow(/BT-151\/BT-118/);
		expect(() =>
			withItem({
				amount: 5,
				reason: "x",
				baseAmount: 100,
				multiplierFactorNumeric: 10,
				taxCategory: { id: "S", percent: 21 },
			}),
		).toThrow(/R040/);
	});
});

describe("lines", () => {
	it("emits the line terms and item identifiers in sequence order", () => {
		const full = line({
			note: "Batch 7",
			accountingCost: "CC-12",
			orderLineReference: "3",
			objectIdentifier: { value: "SUB-1", scheme: "ABZ" },
			invoicePeriod: { startDate: "2026-04-01", endDate: "2026-04-30" },
			itemName: "Widget",
			buyersItemId: "B-1",
			sellersItemId: "S-1",
			standardItemId: { value: "5790000435951", scheme: "0160" },
			originCountryCode: "DE",
			commodityClassifications: [
				{ value: "09348023", listId: "SRV", listVersionId: "1" },
			],
			additionalItemProperties: [{ name: "Colour", value: "Red" }],
			lineExtensionAmount: 90,
			allowanceCharges: [
				{
					chargeIndicator: false,
					amount: 10,
					reason: "Damaged box",
					reasonCode: "95",
				},
			],
			priceAllowance: { amount: 5, baseAmount: 55 },
		});
		const xml = serializeUblInvoice(doc(consistent([full])));
		const body = xml.slice(xml.indexOf("<cac:InvoiceLine>"));
		const order = [
			"<cbc:ID>",
			"<cbc:Note>",
			"<cbc:InvoicedQuantity",
			"<cbc:LineExtensionAmount",
			"<cbc:AccountingCost>",
			"<cac:InvoicePeriod>",
			"<cac:OrderLineReference>",
			"<cac:DocumentReference>",
			"<cac:AllowanceCharge>",
			"<cac:Item>",
			"<cbc:Description>",
			"<cbc:Name>",
			"<cac:BuyersItemIdentification>",
			"<cac:SellersItemIdentification>",
			"<cac:StandardItemIdentification>",
			"<cac:OriginCountry>",
			"<cac:CommodityClassification>",
			"<cac:ClassifiedTaxCategory>",
			"<cac:AdditionalItemProperty>",
			"<cac:Price>",
		].map((tag) => body.indexOf(tag));
		expect(order.every((position) => position > -1)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		// A line allowance carries no VAT category; the line's applies.
		const lineAllowance = body.slice(
			body.indexOf("<cac:AllowanceCharge>"),
			body.indexOf("</cac:AllowanceCharge>"),
		);
		expect(lineAllowance).not.toContain("cac:TaxCategory");
		expect(lineAllowance).toMatch(
			/<cbc:AllowanceChargeReasonCode>95<\/cbc:AllowanceChargeReasonCode>/,
		);
		expect(body).toMatch(/<cbc:ID schemeID="0160">5790000435951<\/cbc:ID>/);
		expect(body).toMatch(
			/<cbc:ItemClassificationCode listID="SRV" listVersionID="1">09348023<\/cbc:ItemClassificationCode>/,
		);
		expect(body).toMatch(
			/<cbc:ID schemeID="ABZ">SUB-1<\/cbc:ID>\s*<cbc:DocumentTypeCode>130<\/cbc:DocumentTypeCode>/,
		);
		expect(body).toMatch(
			/<cac:Price>\s*<cbc:PriceAmount currencyID="EUR">50.00<\/cbc:PriceAmount>\s*<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>\s*<cbc:Amount currencyID="EUR">5.00<\/cbc:Amount>\s*<cbc:BaseAmount currencyID="EUR">55.00<\/cbc:BaseAmount>/,
		);
	});

	it("writes the exemption reason code before the reason text", () => {
		const category = {
			id: "E",
			percent: 0,
			exemptionReasonCode: "VATEX-EU-79-C",
			exemptionReason: "Exempt",
		};
		const xml = serializeUblInvoice(
			doc(consistent([line({ taxCategory: category })])),
		);
		expect(xml).toMatch(
			/<cbc:TaxExemptionReasonCode>VATEX-EU-79-C<\/cbc:TaxExemptionReasonCode>\s*<cbc:TaxExemptionReason>Exempt<\/cbc:TaxExemptionReason>/,
		);
	});
});

describe("arithmetic rules", () => {
	const base = doc();
	const withTotal = (patch: Partial<UblInvoice["monetaryTotal"]>) =>
		serializeUblInvoice({
			...base,
			monetaryTotal: { ...base.monetaryTotal, ...patch },
		});

	it("checks the line sum, totals and amount due (BR-CO-10/13/15/16)", () => {
		expect(() => withTotal({ lineExtensionAmount: 99 })).toThrow(/BR-CO-10/);
		expect(() => withTotal({ taxExclusiveAmount: 99 })).toThrow(/BR-CO-13/);
		expect(() => withTotal({ taxInclusiveAmount: 120 })).toThrow(/BR-CO-15/);
		expect(() => withTotal({ payableAmount: 120 })).toThrow(/BR-CO-16/);
	});

	it("checks each line's net against quantity, price and line allowances (R120)", () => {
		expect(() =>
			serializeUblInvoice(doc({ lines: [line({ unitPrice: 49 })] })),
		).toThrow(/R120/);
		// A line allowance explains the gap between quantity × price and the net.
		expect(() =>
			serializeUblInvoice(
				doc(
					consistent([
						line({
							lineExtensionAmount: 90,
							allowanceCharges: [
								{ chargeIndicator: false, amount: 10, reason: "x" },
							],
						}),
					]),
				),
			),
		).not.toThrow();
	});

	it("checks each VAT subtotal's taxable amount against its lines (BR-S-08)", () => {
		expect(() =>
			serializeUblInvoice({
				...base,
				taxTotal: {
					taxAmount: 21,
					subtotals: [
						{
							taxableAmount: 90,
							taxAmount: 21,
							category: { id: "S", percent: 21 },
						},
					],
				},
			}),
		).toThrow(/BR-S-08/);
		expect(() =>
			serializeUblInvoice({
				...base,
				taxTotal: {
					taxAmount: 21,
					subtotals: [
						{
							taxableAmount: 100,
							taxAmount: 21,
							category: { id: "S", percent: 6 },
						},
					],
				},
			}),
		).toThrow(/BR-S-08/);
	});
});
