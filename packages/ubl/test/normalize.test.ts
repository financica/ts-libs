import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeUblResponse } from "../src/normalize.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("normalizeUblResponse", () => {
	it("maps UBL XML fields into DTO", () => {
		const xml = readFixture("ubl-invoice.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-ubl");
		expect(extracted.provider).toBe("ubl_xml");
		expect(extracted.document_id).toBe("doc-ubl");
		expect(extracted.invoice.invoice_number).toBe("INV-UBL-1001");
		expect(extracted.invoice.invoice_date).toBe("2026-02-25");
		expect(extracted.invoice.due_date).toBe("2026-03-10");
		expect(extracted.invoice.currency).toBe("EUR");
		expect(extracted.invoice.subtotal).toBe(100);
		expect(extracted.invoice.tax_total).toBe(21);
		expect(extracted.invoice.total).toBe(121);
		expect(extracted.invoice.supplier.name).toBe("Acme BV");
		expect(extracted.invoice.supplier.tax_id).toBe("BE0123456789");
		expect(extracted.invoice.extra).toMatchObject({
			supplier_address_structured: {
				line1: "Main Street 10",
				city: "Brussels",
				postal_code: "1000",
				country: "BE",
			},
		});
		const extra = extracted.invoice.extra as {
			payment_means_list?: Array<{ iban?: string | null }>;
		};
		expect(extra.payment_means_list).toHaveLength(2);
		expect(extra.payment_means_list?.[0]?.iban).toBe("BE10000123456789");
		expect(extracted.line_items.length).toBe(1);
		expect(extracted.line_items[0]?.description).toBe("Consulting services");
		expect(extracted.line_items[0]?.tax_rate).toBe(21);
		expect(extracted.line_items[0]?.tax_amount).toBe(21);
		expect(extracted.line_items[0]?.discount_amount).toBeNull();
	});

	it("maps UBL line allowance charges and discounts", () => {
		const xml = readFixture("ubl-invoice-allowance-charge.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-ubl-allowance");
		expect(extracted.provider).toBe("ubl_xml");
		expect(extracted.invoice.invoice_number).toBe("INV-UBL-1003");
		expect(extracted.invoice.discount_total).toBe(10);
		expect(extracted.invoice.tax_total).toBe(18.9);
		expect(extracted.invoice.total).toBe(108.9);
		expect(extracted.line_items).toHaveLength(1);
		expect(extracted.line_items[0]?.amount).toBe(90);
		expect(extracted.line_items[0]?.tax_rate).toBe(21);
		expect(extracted.line_items[0]?.tax_amount).toBe(18.9);
		expect(extracted.line_items[0]?.discount_amount).toBe(10);
		expect(extracted.line_items[0]?.extra).toMatchObject({
			allowance_charges: [
				{
					charge_indicator: false,
					amount: 10,
					reason: "Line discount",
				},
			],
			tax_category_id: "S",
		});
	});

	it("maps Price/AllowanceCharge discounts into line items and discount_total", () => {
		const xml = readFixture("ubl-invoice-price-discount.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-price-disc");
		expect(extracted.invoice.discount_total).toBe(2388);
		expect(extracted.invoice.total).toBe(0);
		expect(extracted.line_items).toHaveLength(1);
		expect(extracted.line_items[0]?.discount_amount).toBe(2388);
		expect(extracted.line_items[0]?.extra).toMatchObject({
			allowance_charges: [
				{
					charge_indicator: false,
					amount: 2388,
					base_amount: 2388,
					reason: "100% discount",
				},
			],
		});
	});

	it("captures extended UBL metadata while exposing user-facing invoice fields", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-ubl-extended");
		expect(extracted.invoice.invoice_number).toBe("INV-UBL-EXT-1");
		expect(extracted.invoice.po_number).toBe("SO-9988");
		expect(extracted.invoice.payment_terms).toBeNull();
		expect(extracted.line_items[0]?.tax_amount).toBe(21);
		expect(extracted.line_items[0]?.extra).toMatchObject({
			tax_category_id: "S",
			tax_scheme_id: "VAT",
		});
		expect(extracted.invoice.extra).toMatchObject({
			customization_id: "urn:example:customization:v1",
			profile_id: "urn:example:profile:v1",
			invoice_type_code: "380",
			order_reference_id: null,
			sales_order_id: "SO-9988",
			delivery: {
				actual_delivery_date: "2026-02-27",
				address: {
					line1: "Warehouse 5",
					city: "Antwerp",
					postal_code: "2000",
					country: "BE",
				},
			},
			supplier: {
				endpoint_id: "0898218515",
				endpoint_scheme_id: "0208",
				company_legal_form: "SA/NV",
				tax_scheme_id: "VAT",
			},
			receiver: {
				endpoint_id: "1006119434",
				endpoint_scheme_id: "0208",
				company_legal_form: "BV",
				tax_scheme_id: "VAT",
			},
			payment_means: {
				code: "30",
				code_name: "VIREMENT",
			},
		});
	});

	it("maps UBL attachments without persisting raw base64 in metadata", () => {
		const xml = readFixture("ubl-invoice-with-attachment.xml");
		const { extracted, rawPayload } = normalizeUblResponse(xml, "doc-ubl-embedded");
		const extra = extracted.invoice.extra as {
			attachments?: unknown[];
		};
		expect(extra.attachments?.length).toBeGreaterThan(0);
		expect(extra.attachments?.[0]).toMatchObject({
			mime_code: "application/pdf",
			filename: "invoice.pdf",
		});
		const raw = rawPayload as {
			invoice?: {
				attachments?: Array<Record<string, unknown>>;
			};
		};
		expect(raw.invoice?.attachments?.[0]?.base64Content).toBeUndefined();
	});

	it("throws on invalid XML", () => {
		expect(() => normalizeUblResponse("<bad", "doc")).toThrow(
			"Failed to parse UBL invoice XML",
		);
	});

	it("computes confidence scores", () => {
		const xml = readFixture("ubl-invoice.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-ubl");
		expect(extracted.confidence.overall).toBe(1);
		expect(extracted.confidence.fields).toMatchObject({
			invoice_id: 1,
			invoice_date: 1,
			total_amount: 1,
			supplier_name: 1,
		});
	});

	it("computes amount_paid when prepaid amount is present", () => {
		// The basic invoice has no prepaid and payable == total
		const xml = readFixture("ubl-invoice.xml");
		const { extracted } = normalizeUblResponse(xml, "doc");
		expect(extracted.invoice.amount_paid).toBeNull();
	});

	it("includes billing_reference in extra for invoices without one", () => {
		const xml = readFixture("ubl-invoice.xml");
		const { extracted } = normalizeUblResponse(xml, "doc");
		const extra = extracted.invoice.extra as {
			billing_reference?: unknown;
		};
		expect(extra.billing_reference).toBeNull();
	});

	describe("Proximus-style invoices", () => {
		it("surfaces mandate ID in payment means", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			const extra = extracted.invoice.extra as {
				payment_means?: { mandate_id?: string | null };
				payment_means_list?: Array<{ mandate_id?: string | null }>;
			};
			expect(extra.payment_means?.mandate_id).toBe("B013950122");
			expect(extra.payment_means_list?.[0]?.mandate_id).toBe("B013950122");
		});

		it("surfaces additional item properties as metadata in line extras", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			expect(extracted.line_items[0]?.extra).toMatchObject({
				metadata: { CHARGE_TYPE: "RC" },
			});
			expect(extracted.line_items[1]?.extra).toMatchObject({
				metadata: { CHARGE_TYPE: "USG" },
			});
		});

		it("surfaces external attachment URI", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			const extra = extracted.invoice.extra as {
				attachments?: Array<{
					external_uri?: string | null;
					size_bytes?: number | null;
				}>;
			};
			expect(extra.attachments).toHaveLength(1);
			expect(extra.attachments?.[0]?.external_uri).toBe(
				"7504668440_PEPPOL_20250714153756.pdf",
			);
			expect(extra.attachments?.[0]?.size_bytes).toBeNull();
		});

		it("surfaces text-only document references", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			const extra = extracted.invoice.extra as {
				document_references?: Array<{
					id: string;
					description?: string;
				}>;
			};
			expect(extra.document_references).toHaveLength(2);
			expect(extra.document_references?.[0]?.id).toBe("GTC_SCA_INSERT");
			expect(extra.document_references?.[1]?.id).toBe("FTC_DUR_TEXT");
		});

		it("surfaces party identifications and company ID scheme", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			const extra = extracted.invoice.extra as {
				supplier?: {
					party_identifications?: Array<{
						id: string;
						schemeId?: string;
					}>;
					company_id_scheme_id?: string | null;
				};
				receiver?: {
					party_identifications?: Array<{
						id: string;
						schemeId?: string;
					}>;
					company_id_scheme_id?: string | null;
				};
			};
			expect(extra.supplier?.party_identifications).toEqual([
				{ id: "0202239951", schemeId: "0208" },
			]);
			expect(extra.supplier?.company_id_scheme_id).toBe("0208");
			expect(extra.receiver?.party_identifications).toEqual([
				{ id: "624080006-1" },
			]);
			expect(extra.receiver?.company_id_scheme_id).toBe("0208");
		});

		it("normalizes N/A buyer reference to null", () => {
			const xml = readFixture("ubl-invoice-proximus.xml");
			const { extracted } = normalizeUblResponse(xml, "doc-proximus");
			const extra = extracted.invoice.extra as {
				buyer_reference?: string | null;
			};
			expect(extra.buyer_reference).toBeNull();
		});
	});

	describe("payable rounding (BT-114)", () => {
		// Belgian cash rounding to the nearest 0.05. BR-CO-16:
		// PayableAmount = TaxInclusiveAmount - PrepaidAmount + PayableRoundingAmount.
		const invoiceXml = (monetaryTotal: string) => `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
	xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
	xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
	<cbc:ID>TICKET-1</cbc:ID>
	<cbc:IssueDate>2026-08-02</cbc:IssueDate>
	<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
	<cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Winkel</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
	<cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Klant</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
	<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">4.71</cbc:TaxAmount></cac:TaxTotal>
	<cac:LegalMonetaryTotal>${monetaryTotal}</cac:LegalMonetaryTotal>
</Invoice>`;

		it("carries a rounded-up payable without inventing a prepayment", () => {
			const { extracted } = normalizeUblResponse(
				invoiceXml(`
					<cbc:LineExtensionAmount currencyID="EUR">22.42</cbc:LineExtensionAmount>
					<cbc:TaxExclusiveAmount currencyID="EUR">22.42</cbc:TaxExclusiveAmount>
					<cbc:TaxInclusiveAmount currencyID="EUR">27.13</cbc:TaxInclusiveAmount>
					<cbc:PayableRoundingAmount currencyID="EUR">0.02</cbc:PayableRoundingAmount>
					<cbc:PayableAmount currencyID="EUR">27.15</cbc:PayableAmount>`),
				"doc-up",
			);
			expect(extracted.invoice).toMatchObject({
				total: 27.13,
				amount_due: 27.15,
				rounding_total: 0.02,
				amount_paid: null,
			});
		});

		it("does not read a rounded-down payable as a partial prepayment", () => {
			const { extracted } = normalizeUblResponse(
				invoiceXml(`
					<cbc:LineExtensionAmount currencyID="EUR">22.42</cbc:LineExtensionAmount>
					<cbc:TaxExclusiveAmount currencyID="EUR">22.42</cbc:TaxExclusiveAmount>
					<cbc:TaxInclusiveAmount currencyID="EUR">27.17</cbc:TaxInclusiveAmount>
					<cbc:PayableRoundingAmount currencyID="EUR">-0.02</cbc:PayableRoundingAmount>
					<cbc:PayableAmount currencyID="EUR">27.15</cbc:PayableAmount>`),
				"doc-down",
			);
			expect(extracted.invoice.rounding_total).toBe(-0.02);
			expect(extracted.invoice.amount_paid).toBeNull();
		});

		it("infers a prepayment net of the rounding amount", () => {
			const { extracted } = normalizeUblResponse(
				invoiceXml(`
					<cbc:LineExtensionAmount currencyID="EUR">22.42</cbc:LineExtensionAmount>
					<cbc:TaxExclusiveAmount currencyID="EUR">22.42</cbc:TaxExclusiveAmount>
					<cbc:TaxInclusiveAmount currencyID="EUR">27.13</cbc:TaxInclusiveAmount>
					<cbc:PayableRoundingAmount currencyID="EUR">0.02</cbc:PayableRoundingAmount>
					<cbc:PayableAmount currencyID="EUR">17.15</cbc:PayableAmount>`),
				"doc-both",
			);
			// 10.00 was prepaid, not 9.98.
			expect(extracted.invoice.amount_paid).toBe(10);
		});

		it("still infers a prepayment when no rounding is present", () => {
			const { extracted } = normalizeUblResponse(
				invoiceXml(`
					<cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
					<cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
					<cbc:TaxInclusiveAmount currencyID="EUR">121.00</cbc:TaxInclusiveAmount>
					<cbc:PayableAmount currencyID="EUR">21.00</cbc:PayableAmount>`),
				"doc-plain",
			);
			expect(extracted.invoice.rounding_total).toBeNull();
			expect(extracted.invoice.amount_paid).toBe(100);
		});
	});
});

describe("service period in the DTO", () => {
	it("promotes the document period to first-class fields", () => {
		const xml = readFixture("ubl-invoice-extended.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-extended");
		expect(extracted.invoice).toMatchObject({
			period_start: "2026-02-01",
			period_end: "2026-02-28",
		});
	});

	it("reports null on a document and lines that state no period", () => {
		const xml = readFixture("ubl-invoice.xml");
		const { extracted } = normalizeUblResponse(xml, "doc-ubl");
		expect(extracted.invoice).toMatchObject({
			period_start: null,
			period_end: null,
		});
		expect(extracted.line_items[0]).toMatchObject({
			period_start: null,
			period_end: null,
		});
	});
});
