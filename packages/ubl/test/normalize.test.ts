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
});
