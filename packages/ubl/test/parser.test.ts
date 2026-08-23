import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UblParseError } from "../src/errors.js";
import { parseUblInvoice } from "../src/parser.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

const headerOnly = (body: string) => `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-1</cbc:ID>${body}
</Invoice>`;

describe("parseUblInvoice", () => {
	it("parses a standard UBL invoice", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml);

		expect(invoice).not.toBeNull();
		expect(invoice!.documentType).toBe("Invoice");
		expect(invoice!.id).toBe("INV-UBL-1001");
		expect(invoice!.issueDate).toBe("2026-02-25");
		expect(invoice!.dueDate).toBe("2026-03-10");
		expect(invoice!.currency).toBe("EUR");
	});

	it("extracts seller party fields", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.seller.name).toBe("Acme BV");
		expect(invoice.seller.vatId).toBe("BE0123456789");
		expect(invoice.seller.address).toMatchObject({
			street: "Main Street 10",
			city: "Brussels",
			postalZone: "1000",
			countryCode: "BE",
		});
	});

	it("extracts buyer party fields", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.buyer.name).toBe("Buyer NV");
		expect(invoice.buyer.vatId).toBe("BE9876543210");
		expect(invoice.buyer.address).toMatchObject({
			street: "Customer Road 5",
			city: "Ghent",
			postalZone: "9000",
			countryCode: "BE",
		});
	});

	it("extracts monetary totals", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.monetaryTotal).toMatchObject({
			lineExtensionAmount: 100,
			taxExclusiveAmount: 100,
			taxInclusiveAmount: 121,
			payableAmount: 121,
		});
	});

	it("extracts tax subtotals", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.taxTotal.taxAmount).toBe(21);
		expect(invoice.taxTotal.subtotals).toHaveLength(1);
		expect(invoice.taxTotal.subtotals[0]).toEqual({
			taxableAmount: 100,
			taxAmount: 21,
			category: { id: "S", percent: 21 },
		});
	});

	it("extracts invoice lines", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines).toHaveLength(1);
		expect(invoice.lines[0]).toMatchObject({
			id: "1",
			description: "Consulting services",
			quantity: 2,
			unitCode: "C62",
			unitPrice: 50,
			lineExtensionAmount: 100,
			taxCategory: { id: "S", percent: 21 },
			itemName: "Consulting",
			sellersItemId: "CONSULT-01",
		});
	});

	it("extracts multiple payment means", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.paymentMeansList).toHaveLength(2);
		expect(invoice.paymentMeans).toMatchObject({
			code: "30",
			paymentId: "PM-001",
			iban: "BE10000123456789",
			bic: "GEBA BE BB",
		});
		expect(invoice.paymentMeansList![1]).toMatchObject({
			code: "31",
			paymentId: "PM-002",
			iban: "NL20INGB0001234567",
		});
	});

	it("extracts payment terms note", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.paymentTermsNote).toBe("Net 14 days");
	});

	it("extracts order reference", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.orderReference).toBe("PO-42");
	});

	it("extracts embedded attachments", () => {
		const xml = readFixture("ubl-invoice-with-attachment.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.attachments).toHaveLength(1);
		expect(invoice.attachments![0]).toMatchObject({
			id: "ATT-1",
			filename: "invoice.pdf",
			mimeCode: "application/pdf",
			base64Content: "SGVsbG8=",
		});
	});

	it("divides PriceAmount by BaseQuantity to compute unit price", () => {
		const xml = readFixture("ubl-invoice-base-quantity.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines[0]).toMatchObject({
			quantity: 1.5,
			unitPrice: 50,
			lineExtensionAmount: 75,
		});
	});

	it("extracts line-level allowance charges", () => {
		const xml = readFixture("ubl-invoice-allowance-charge.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines[0]!.allowanceCharges).toHaveLength(1);
		expect(invoice.lines[0]!.allowanceCharges![0]).toMatchObject({
			chargeIndicator: false,
			amount: 10,
			reason: "Line discount",
		});
		expect(invoice.lines[0]!.discountAmount).toBe(10);
	});

	it("extracts Price/AllowanceCharge discounts", () => {
		const xml = readFixture("ubl-invoice-price-discount.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines[0]!.allowanceCharges).toHaveLength(1);
		expect(invoice.lines[0]!.allowanceCharges![0]).toMatchObject({
			chargeIndicator: false,
			amount: 2388,
			baseAmount: 2388,
			reason: "100% discount",
		});
		expect(invoice.lines[0]!.discountAmount).toBe(2388);
	});

	it("extracts line-level tax subtotals", () => {
		const xml = readFixture("ubl-invoice-allowance-charge.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines[0]!.taxSubtotals).toHaveLength(1);
		expect(invoice.lines[0]!.taxSubtotals![0]).toMatchObject({
			taxableAmount: 90,
			taxAmount: 18.9,
			category: { id: "S", percent: 21 },
		});
	});

	it("extracts extended metadata fields", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.customizationId).toBe("urn:example:customization:v1");
		expect(invoice.profileId).toBe("urn:example:profile:v1");
		expect(invoice.invoiceTypeCode).toBe("380");
		expect(invoice.buyerReference).toBe("BUY-REF-1");
		expect(invoice.salesOrderId).toBe("SO-9988");
		expect(invoice.note).toBe(
			"Long legal note should not be mapped to payment terms",
		);
	});

	it("extracts delivery information", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.delivery).toMatchObject({
			actualDeliveryDate: "2026-02-27",
			address: {
				street: "Warehouse 5",
				city: "Antwerp",
				postalZone: "2000",
				countryCode: "BE",
			},
		});
	});

	it("extracts contact information", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.seller.contact).toMatchObject({
			name: "Supplier Contact",
			email: "supplier@example.com",
		});
		expect(invoice.buyer.contact).toMatchObject({
			name: "Buyer Contact",
			email: "buyer@example.com",
		});
	});

	it("extracts party endpoint IDs", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.seller.endpoint).toEqual({
			value: "0898218515",
			scheme: "0208",
		});
		expect(invoice.buyer.endpoint).toEqual({ value: "1006119434", scheme: "0208" });
	});

	it("extracts invoice period", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.invoicePeriod).toMatchObject({
			startDate: "2026-02-01",
			endDate: "2026-02-28",
			descriptionCode: "3",
		});
	});

	it("extracts payment means code name attribute", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.paymentMeans).toMatchObject({
			code: "30",
			codeName: "VIREMENT",
			accountName: "Bank Account Name",
		});
	});

	it.each([
		{ name: "unclosed tag", xml: "<not-valid" },
		{ name: "empty input", xml: "" },
		{ name: "non-XML text", xml: "not xml at all" },
	])("throws UblParseError on malformed XML ($name)", ({ xml }) => {
		expect(() => parseUblInvoice(xml)).toThrow(UblParseError);
	});

	it("returns null for non-UBL documents", () => {
		const xml = '<?xml version="1.0"?><html><body>Hi</body></html>';
		expect(parseUblInvoice(xml)).toBeNull();
	});

	it("returns null for an Invoice root outside the UBL namespace", () => {
		const xml =
			'<?xml version="1.0"?><Invoice xmlns="urn:example:other"><ID>1</ID></Invoice>';
		expect(parseUblInvoice(xml)).toBeNull();
	});

	it("throws UblParseError for UBL documents without an ID", () => {
		const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
</Invoice>`;
		expect(() => parseUblInvoice(xml)).toThrow(UblParseError);
		expect(() => parseUblInvoice(xml)).toThrow(/cbc:ID/);
	});

	it("throws UblParseError for UBL documents without an issue date or currency", () => {
		expect(() =>
			parseUblInvoice(
				headerOnly("<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>"),
			),
		).toThrow(/cbc:IssueDate/);
		expect(() =>
			parseUblInvoice(headerOnly("<cbc:IssueDate>2026-01-01</cbc:IssueDate>")),
		).toThrow(/cbc:DocumentCurrencyCode/);
	});

	it("throws UblParseError for a line without an ID", () => {
		const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-1</cbc:ID>
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity></cac:InvoiceLine>
</Invoice>`;
		expect(() => parseUblInvoice(xml)).toThrow(UblParseError);
	});

	it("leaves an absent optional field absent rather than empty", () => {
		const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-1</cbc:ID>
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>   </cbc:BuyerReference>
  <cac:OrderReference><cbc:SalesOrderID>SO-1</cbc:SalesOrderID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PostalAddress><cbc:CityName>Ghent</cbc:CityName></cac:PostalAddress>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cac:Item><cbc:Name>Thing</cbc:Name></cac:Item>
  </cac:InvoiceLine>
</Invoice>`;
		const invoice = parseUblInvoice(xml)!;
		expect(invoice).not.toHaveProperty("dueDate");
		expect(invoice).not.toHaveProperty("buyerReference");
		expect(invoice.orderReference).toBeUndefined();
		expect(invoice.salesOrderId).toBe("SO-1");
		expect(invoice.seller.name).toBeUndefined();
		expect(invoice.seller.address).toEqual({ city: "Ghent" });
		expect(invoice.buyer).toEqual({});
		expect(invoice.monetaryTotal).toEqual({});
		expect(invoice.taxTotal).toEqual({ subtotals: [] });
		const line = invoice.lines[0]!;
		expect(line.description).toBeUndefined();
		expect(line.unitCode).toBeUndefined();
		expect(line.unitPrice).toBeUndefined();
		expect(line.lineExtensionAmount).toBeUndefined();
		expect(line.quantity).toBe(1);
		expect(JSON.stringify(invoice)).not.toContain('""');
	});

	it("parses a CreditNote document", () => {
		const xml = `<?xml version="1.0"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-001</cbc:ID>
  <cbc:IssueDate>2026-03-01</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>INV-ORIG-100</cbc:ID>
      <cbc:IssueDate>2026-02-15</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Seller</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">50.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">50.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">60.50</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">60.50</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:CreditNoteLine>
    <cbc:ID>1</cbc:ID>
    <cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">50.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>Return</cbc:Description>
      <cbc:Name>Widget</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">50.00</cbc:PriceAmount>
    </cac:Price>
  </cac:CreditNoteLine>
</CreditNote>`;
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.documentType).toBe("CreditNote");
		expect(invoice.id).toBe("CN-001");
		expect(invoice.invoiceTypeCode).toBe("381");
		expect(invoice.lines).toHaveLength(1);
		expect(invoice.lines[0]!.description).toBe("Return");
		expect(invoice.lines[0]!.quantity).toBe(1);
	});

	it("extracts billing reference from CreditNote", () => {
		const xml = `<?xml version="1.0"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-002</cbc:ID>
  <cbc:IssueDate>2026-03-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>INV-ORIG-200</cbc:ID>
      <cbc:IssueDate>2026-01-26</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Seller</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">10.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">10.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">12.10</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">12.10</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`;
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.billingReference).toMatchObject({
			invoiceId: "INV-ORIG-200",
			invoiceIssueDate: "2026-01-26",
		});
	});

	it("returns undefined billingReference for invoices without one", () => {
		const xml = readFixture("ubl-invoice.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.billingReference).toBeUndefined();
	});

	describe("Proximus-style invoices", () => {
		it("extracts external attachment references", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.attachments).toHaveLength(1);
			expect(invoice.attachments![0]).toMatchObject({
				id: "ATT",
				description: "Commercial Invoice",
				externalUri: "7504668440_PEPPOL_20250714153756.pdf",
			});
			expect(invoice.attachments![0]!.base64Content).toBeUndefined();
		});

		it("extracts text-only document references", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.documentReferences).toHaveLength(2);
			expect(invoice.documentReferences![0]).toMatchObject({
				id: "GTC_SCA_INSERT",
				description: "Scarlet general terms and conditions apply.",
			});
			expect(invoice.documentReferences![1]).toMatchObject({
				id: "FTC_DUR_TEXT",
				description:
					"All contracts are for an indefinite period unless stated otherwise.",
			});
		});

		it("extracts payment mandate ID", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.paymentMeans).toMatchObject({
				code: "49",
				codeName: "Direct debit",
				paymentId: "750466844085",
				iban: "BE82210000088968",
				bic: "GEBABEBB",
				mandateId: "B013950122",
			});
		});

		it("extracts additional item properties as metadata", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.lines).toHaveLength(3);
			expect(invoice.lines[0]!.additionalItemProperties).toEqual([
				{ name: "CHARGE_TYPE", value: "RC" },
			]);
			expect(invoice.lines[1]!.additionalItemProperties).toEqual([
				{ name: "CHARGE_TYPE", value: "USG" },
			]);
		});

		it("extracts party identifications", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.seller.partyIdentifications).toEqual([
				{ id: "0202239951", schemeId: "0208" },
			]);
			expect(invoice.buyer.partyIdentifications).toEqual([{ id: "624080006-1" }]);
		});

		it("extracts company ID scheme ID", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.seller.companyId).toEqual({
				value: "0202239951",
				scheme: "0208",
			});
			expect(invoice.buyer.companyId).toEqual({
				value: "0766280697",
				scheme: "0208",
			});
		});

		it("normalizes N/A buyer reference to undefined", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const invoice = parseUblInvoice(xml)!;

			// The raw parser preserves "N/A"; the normalize layer strips it
			expect(invoice.buyerReference).toBe("N/A");
		});
	});

	describe("E-FFF.BE format", () => {
		it("parses an E-FFF.BE invoice", () => {
			const xml = readFixture("ubl-invoice-efff.xml");
			const invoice = parseUblInvoice(xml);

			expect(invoice).not.toBeNull();
			expect(invoice!.documentType).toBe("Invoice");
			expect(invoice!.id).toBe("EFFF-2025-001");
			expect(invoice!.issueDate).toBe("2025-10-20");
			expect(invoice!.currency).toBe("EUR");
			expect(invoice!.customizationId).toBe("1.0");
			expect(invoice!.profileId).toBe("E-FFF.BE Accountable");
			expect(invoice!.invoiceTypeCode).toBe("380");
		});

		it("extracts tax percent from TaxSubtotal (not inside TaxCategory)", () => {
			const xml = readFixture("ubl-invoice-efff.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.taxTotal.subtotals).toHaveLength(1);
			expect(invoice.taxTotal.subtotals[0]).toMatchObject({
				taxableAmount: 1500,
				taxAmount: 315,
				category: { id: "S", percent: 21 },
			});
		});

		it("extracts line-level tax percent from TaxSubtotal", () => {
			const xml = readFixture("ubl-invoice-efff.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.lines).toHaveLength(1);
			expect(invoice.lines[0]).toMatchObject({
				taxCategory: { id: "S", percent: 21 },
				taxAmount: 315,
				lineExtensionAmount: 1500,
			});
		});

		it("extracts parties without PartyTaxScheme", () => {
			const xml = readFixture("ubl-invoice-efff.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.seller.name).toBe("Supplier BVBA");
			expect(invoice.seller.vatId).toBeUndefined();
			expect(invoice.seller.companyId).toEqual({ value: "BE0123456789" });
			expect(invoice.seller.endpoint).toEqual({
				value: "BE0123456789",
				scheme: "9925",
			});

			expect(invoice.buyer.name).toBe("Client NV");
			expect(invoice.buyer.companyId).toEqual({ value: "BE9876543210" });
			expect(invoice.buyer.contact).toMatchObject({
				name: "Client NV",
				email: "billing@client.be",
			});
		});

		it("extracts monetary totals", () => {
			const xml = readFixture("ubl-invoice-efff.xml");
			const invoice = parseUblInvoice(xml)!;

			expect(invoice.monetaryTotal).toMatchObject({
				lineExtensionAmount: 1500,
				taxExclusiveAmount: 1500,
				taxInclusiveAmount: 1815,
				payableAmount: 1815,
			});
		});
	});

	describe("XXE prevention", () => {
		it("strips DOCTYPE with external entity and parses the invoice normally", () => {
			const xml = readFixture("ubl-invoice.xml");
			// Inject a DOCTYPE with an external entity before the root element
			const xxePayload = xml.replace(
				/<Invoice /,
				`<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<Invoice `,
			);
			expect(xxePayload).toContain("<!DOCTYPE");

			const invoice = parseUblInvoice(xxePayload);
			expect(invoice).not.toBeNull();
			expect(invoice!.id).toBe("INV-UBL-1001");
			// The entity reference should NOT have resolved
			expect(JSON.stringify(invoice)).not.toContain("/etc/passwd");
		});

		it("strips DOCTYPE with inline DTD subset", () => {
			const xml = readFixture("ubl-invoice.xml");
			const xxePayload = xml.replace(
				/<Invoice /,
				`<!DOCTYPE foo [
					<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
					<!ENTITY bomb "&xxe;&xxe;&xxe;&xxe;&xxe;">
				]>\n<Invoice `,
			);

			const invoice = parseUblInvoice(xxePayload);
			expect(invoice).not.toBeNull();
			expect(invoice!.id).toBe("INV-UBL-1001");
		});

		it("rejects XML that is only a DOCTYPE with no invoice content", () => {
			const xml = `<?xml version="1.0"?>
				<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/shadow">]>
				<root>&xxe;</root>`;
			// With the DOCTYPE stripped, what remains is a non-UBL <root>.
			expect(parseUblInvoice(xml)).toBeNull();
		});
	});
});

describe("invoice periods", () => {
	// A line-level period must not be reported as the document's: the lookup is
	// a direct-child one, not a descendant search over the whole document.
	const withLinePeriodOnly = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-1</cbc:ID>
  <cbc:IssueDate>2026-02-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:InvoicePeriod>
      <cbc:StartDate>2026-01-15</cbc:StartDate>
      <cbc:EndDate>2026-01-31</cbc:EndDate>
    </cac:InvoicePeriod>
    <cac:Item><cbc:Name>Proration</cbc:Name></cac:Item>
  </cac:InvoiceLine>
</Invoice>`;

	it("keeps a line period on its line and off the document", () => {
		const invoice = parseUblInvoice(withLinePeriodOnly)!;
		expect(invoice.invoicePeriod).toBeUndefined();
		expect(invoice.lines[0]?.invoicePeriod).toStrictEqual({
			startDate: "2026-01-15",
			endDate: "2026-01-31",
		});
	});

	it("reports no line period when the line states none", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const invoice = parseUblInvoice(xml)!;
		expect(invoice.invoicePeriod).toBeDefined();
		expect(invoice.lines[0]?.invoicePeriod).toBeUndefined();
	});
});
