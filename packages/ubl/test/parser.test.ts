import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUblInvoice } from "../src/parser.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

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

		expect(invoice.taxSubtotals).toHaveLength(1);
		expect(invoice.taxSubtotals[0]).toMatchObject({
			taxableAmount: 100,
			taxAmount: 21,
			taxPercent: 21,
			taxCategoryId: "S",
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
			taxPercent: 21,
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

	it("extracts line-level tax subtotals", () => {
		const xml = readFixture("ubl-invoice-allowance-charge.xml");
		const invoice = parseUblInvoice(xml)!;

		expect(invoice.lines[0]!.taxSubtotals).toHaveLength(1);
		expect(invoice.lines[0]!.taxSubtotals![0]).toMatchObject({
			taxableAmount: 90,
			taxAmount: 18.9,
			taxPercent: 21,
			taxCategoryId: "S",
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

		expect(invoice.seller.endpointId).toBe("0898218515");
		expect(invoice.seller.endpointSchemeId).toBe("0208");
		expect(invoice.buyer.endpointId).toBe("1006119434");
		expect(invoice.buyer.endpointSchemeId).toBe("0208");
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

	it("returns null for invalid XML", () => {
		expect(parseUblInvoice("<not-valid")).toBeNull();
	});

	it("returns null for non-UBL documents", () => {
		const xml = '<?xml version="1.0"?><html><body>Hi</body></html>';
		expect(parseUblInvoice(xml)).toBeNull();
	});

	it("returns null for UBL documents without an ID", () => {
		const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:IssueDate>2026-01-01</cbc:IssueDate>
</Invoice>`;
		expect(parseUblInvoice(xml)).toBeNull();
	});

	it("parses a CreditNote document", () => {
		const xml = `<?xml version="1.0"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-001</cbc:ID>
  <cbc:IssueDate>2026-03-01</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
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
		expect(invoice.lines).toHaveLength(1);
		expect(invoice.lines[0]!.description).toBe("Return");
		expect(invoice.lines[0]!.quantity).toBe(1);
	});
});
