import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
	buildUblCreditNoteDocument,
	buildUblInvoiceDocument,
	type UblSupplier,
} from "../index";

const buildSupplier = (overrides: Partial<UblSupplier> = {}): UblSupplier => ({
	name: "Acme BE",
	countryCode: "BE",
	address: {
		line1: "Rue de la Loi 16",
		city: "Brussels",
		postal_code: "1000",
		country: "BE",
	},
	companyNumber: "0800279001",
	vatNumber: "BE0800279001",
	vatStatus: 1,
	peppolID: "0208:0800279001",
	...overrides,
});

const buildStripeInvoice = (overrides: Record<string, unknown> = {}) =>
	({
		id: "in_test_123",
		object: "invoice",
		number: "INV-001",
		customer_name: "Test Customer",
		customer_email: "test@example.com",
		customer_address: {
			line1: "Rue Example 1",
			line2: null,
			city: "Brussels",
			postal_code: "1000",
			state: null,
			country: "BE",
		},
		customer_tax_ids: [{ type: "eu_vat", value: "BE0733756597" }],
		currency: "eur",
		subtotal: 10000,
		total: 12100,
		total_excluding_tax: 10000,
		amount_due: 12100,
		amount_paid: 0,
		status: "open",
		created: 1711929600,
		status_transitions: { finalized_at: 1712016000 },
		due_date: 1714521600,
		description: "Test invoice",
		lines: {
			object: "list",
			has_more: false,
			url: "/v1/invoices/in_test_123/lines",
			data: [
				{
					description: "Widget",
					amount: 10000,
					quantity: 2,
					tax_amounts: [{ amount: 2100 }],
					discount_amounts: [],
				},
			],
		},
		...overrides,
	}) as unknown as Stripe.Invoice;

const buildStripeCreditNote = (overrides: Record<string, unknown> = {}) =>
	({
		id: "cn_test_123",
		object: "credit_note",
		number: "CN-001",
		currency: "eur",
		created: 1711929600,
		effective_at: 1712016000,
		memo: "Partial refund",
		subtotal: 10000,
		total: 12100,
		total_excluding_tax: 10000,
		lines: {
			object: "list",
			has_more: false,
			url: "/v1/credit_notes/cn_test_123/lines",
			data: [
				{
					id: "cnli_123",
					object: "credit_note_line_item",
					amount: 10000,
					description: "Refunded widget",
					discount_amount: 0,
					quantity: 2,
					taxes: [{ amount: 2100 }],
					type: "invoice_line_item",
					unit_amount: 5000,
				},
			],
		},
		...overrides,
	}) as unknown as Stripe.CreditNote;

const linesData = (data: unknown[], url = "/v1/invoices/in_test_123/lines") => ({
	object: "list",
	has_more: false,
	url,
	data,
});

describe("buildUblInvoiceDocument", () => {
	it("converts a basic Stripe invoice", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});

		expect(doc.documentType).toBe("invoice");
		expect(doc.id).toBe("INV-001");
		expect(doc.currency).toBe("EUR");
		expect(doc.monetaryTotal.taxExclusiveAmount).toBe(100);
		expect(doc.taxTotal.taxAmount).toBe(21);
		expect(doc.monetaryTotal.taxInclusiveAmount).toBe(121);
		expect(doc.monetaryTotal.payableAmount).toBe(121);
		expect(doc.supplier.name).toBe("Acme BE");
		expect(doc.supplier.endpoint).toEqual({ scheme: "0208", value: "0800279001" });
		expect(doc.supplier.companyId).toEqual({ value: "0800279001", scheme: "0208" });
		expect(doc.customer.name).toBe("Test Customer");
		expect(doc.customer.vatNumber).toBe("BE0733756597");
		// The VAT-only customer must still get a routable Peppol endpoint: the
		// Belgian VAT maps to EAS scheme 9925.
		expect(doc.customer.endpoint).toEqual({
			scheme: "9925",
			value: "BE0733756597",
		});
	});

	it("converts amounts to a rate-derived VAT breakdown (BR-CO-17)", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 50050,
				total: 60560,
				total_excluding_tax: 50050,
				lines: linesData([
					{
						description: "Widget",
						amount: 50050,
						quantity: 1,
						tax_amounts: [{ amount: 10510 }],
						discount_amounts: [],
					},
				]),
			}),
			supplier: buildSupplier(),
		});

		expect(doc.monetaryTotal.taxExclusiveAmount).toBe(500.5);
		// 500.50 × 21% = 105.105 → 105.11 (rounded), not the 105.10 Stripe reports.
		expect(doc.taxTotal.taxAmount).toBe(105.11);
		expect(doc.monetaryTotal.taxInclusiveAmount).toBe(605.61);
	});

	it("uses finalized_at as the issue date and due_date as the due date", () => {
		const finalizedAt = Math.floor(Date.UTC(2026, 3, 30, 14) / 1000);
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				status_transitions: { finalized_at: finalizedAt },
				created: finalizedAt - 86400 * 5,
			}),
			supplier: buildSupplier(),
		});
		expect(doc.issueDate).toBe("2026-04-30");
		expect(doc.dueDate).toBe("2024-05-01");
	});

	it("rejects an invalid currency", () => {
		expect(() =>
			buildUblInvoiceDocument({
				invoice: buildStripeInvoice({ currency: "EU" as unknown as string }),
				supplier: buildSupplier(),
			}),
		).toThrowError(/Invalid currency/);
	});

	it("classifies reverse-charge lines as category AE with a reason", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 10000,
				total_excluding_tax: 10000,
				lines: linesData([
					{
						description: "Intra-EU service",
						amount: 10000,
						quantity: 1,
						tax_amounts: [
							{ amount: 0, taxability_reason: "reverse_charge" },
						],
						discount_amounts: [],
					},
				]),
			}),
			supplier: buildSupplier(),
		});

		expect(doc.lines[0]?.taxCategory.id).toBe("AE");
		expect(doc.lines[0]?.taxCategory.exemptionReason).toBe("Reverse charge");
		expect(doc.taxTotal.taxAmount).toBe(0);
	});

	it("classifies zero_rated lines as category Z", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 10000,
				total_excluding_tax: 10000,
				lines: linesData([
					{
						description: "Zero-rated export",
						amount: 10000,
						quantity: 1,
						tax_amounts: [{ amount: 0, taxability_reason: "zero_rated" }],
						discount_amounts: [],
					},
				]),
			}),
			supplier: buildSupplier(),
		});
		expect(doc.lines[0]?.taxCategory.id).toBe("Z");
	});

	it("reads VAT from line.taxes when tax_amounts is empty", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 15000,
				total: 18150,
				total_excluding_tax: 15000,
				lines: linesData([
					{
						description: "Conference ticket",
						amount: 15000,
						quantity: 1,
						tax_amounts: [],
						taxes: [
							{
								amount: 3150,
								tax_behavior: "exclusive",
								tax_rate_details: { tax_rate: "txr_test" },
								taxability_reason: null,
								taxable_amount: 15000,
								type: "tax_rate_details",
							},
						],
						discount_amounts: [],
					},
				]),
			}),
			supplier: buildSupplier(),
		});

		expect(doc.lines[0]?.taxCategory).toEqual({ id: "S", percent: 21 });
		expect(doc.taxTotal.taxAmount).toBe(31.5);
		expect(doc.taxTotal.subtotals).toHaveLength(1);
	});

	it("uses the post-discount net as the VAT base and line net for discounted lines", () => {
		// 120,00 line with a 36,00 discount and 21% VAT. Tax (17,64) is on the
		// 84,00 net. The line net must be 84,00 and the rate 21% (not 14,70%).
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 12000,
				total: 10164,
				total_excluding_tax: 8400,
				lines: linesData([
					{
						description: "Consulting",
						amount: 12000,
						quantity: 1,
						tax_amounts: [{ amount: 1764, tax_rate: { percentage: 21 } }],
						discount_amounts: [{ amount: 3600 }],
					},
				]),
			}),
			supplier: buildSupplier(),
		});

		expect(doc.lines[0]?.lineExtensionAmount).toBe(84);
		expect(doc.lines[0]?.taxCategory).toEqual({ id: "S", percent: 21 });
		expect(doc.monetaryTotal.taxExclusiveAmount).toBe(84);
		expect(doc.taxTotal.taxAmount).toBe(17.64);
		expect(doc.monetaryTotal.taxInclusiveAmount).toBe(101.64);
	});

	it("preserves the VAT rate for fully-discounted lines via expanded tax_rate", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 0,
				total: 0,
				total_excluding_tax: 0,
				lines: linesData([
					{
						description: "Fully discounted",
						amount: 0,
						quantity: 1,
						tax_amounts: [{ amount: 0, tax_rate: { percentage: 21 } }],
						discount_amounts: [{ amount: 10000 }],
					},
				]),
			}),
			supplier: buildSupplier(),
		});
		expect(doc.lines[0]?.taxCategory).toEqual({ id: "S", percent: 21 });
	});

	it("falls back to a single line when invoice.lines is empty", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 12100,
				total_excluding_tax: 10000,
				description: "Consulting services",
				lines: linesData([]),
			}),
			supplier: buildSupplier(),
		});

		expect(doc.lines).toHaveLength(1);
		expect(doc.lines[0]?.name).toBe("Consulting services");
		expect(doc.lines[0]?.lineExtensionAmount).toBe(100);
		expect(doc.lines[0]?.taxCategory).toEqual({ id: "S", percent: 21 });
	});

	it("coerces all lines to exempt when the supplier is a franchise (vatStatus 3)", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 10000,
				total_excluding_tax: 10000,
				lines: linesData([
					{
						description: "Item",
						amount: 10000,
						quantity: 1,
						tax_amounts: [],
						discount_amounts: [],
					},
				]),
			}),
			supplier: buildSupplier({ vatStatus: 3 }),
		});

		expect(doc.lines[0]?.taxCategory.id).toBe("E");
		expect(doc.lines[0]?.taxCategory.exemptionReason).toMatch(/56bis/);
		expect(doc.taxTotal.taxAmount).toBe(0);
	});

	it("does not substitute the supplier country when the customer country is missing", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				customer_address: {
					line1: "Unknown Street 1",
					city: "Somewhere",
					postal_code: "0000",
					country: null,
				},
			}),
			supplier: buildSupplier(),
		});
		expect(doc.customer.address.countryCode).toBeNull();
	});
});

describe("buildUblCreditNoteDocument", () => {
	it("marks the document as a credit note referencing the original invoice", () => {
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote(),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.documentType).toBe("creditNote");
		expect(doc.id).toBe("CN-001");
		expect(doc.precedingInvoiceId).toBe("INV-001");
		expect(doc.dueDate).toBeNull();
	});

	it("derives the customer party from the parent invoice", () => {
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote(),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.customer.name).toBe("Test Customer");
		expect(doc.customer.vatNumber).toBe("BE0733756597");
	});

	it("uses effective_at as the issue date", () => {
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({ effective_at: 1714521600 }),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.issueDate).toBe("2024-05-01");
	});

	it("reads the rate from tax_rate_details.tax_rate (real Stripe shape)", () => {
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({
				lines: linesData(
					[
						{
							id: "cnli_real",
							object: "credit_note_line_item",
							amount: 10000,
							description: "Heavily discounted",
							discount_amount: 9999,
							quantity: 1,
							taxes: [
								{
									amount: 0,
									tax_behavior: "exclusive",
									tax_rate_details: { tax_rate: { percentage: 21 } },
									taxability_reason: null,
									taxable_amount: 1,
									type: "tax_rate_details",
								},
							],
							type: "invoice_line_item",
							unit_amount: 10000,
						},
					],
					"/v1/credit_notes/cn_test_123/lines",
				),
			}),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});

		expect(doc.lines[0]?.taxCategory).toEqual({ id: "S", percent: 21 });
	});
});

describe("customer Peppol endpoint resolution", () => {
	const endpointOf = (overrides: Record<string, unknown>, opts = {}) =>
		buildUblInvoiceDocument({
			invoice: buildStripeInvoice(overrides),
			supplier: buildSupplier(),
			...opts,
		}).customer.endpoint;

	it("prefers an explicit Peppol ID over the VAT number", () => {
		expect(
			endpointOf({
				customer_tax_ids: [
					{ type: "eu_vat", value: "BE0733756597" },
					{ type: "peppol_id", value: "0208:0733756597" },
				],
			}),
		).toEqual({ scheme: "0208", value: "0733756597" });
	});

	it("falls back to a GLN under EAS 0088", () => {
		expect(
			endpointOf({
				customer_tax_ids: [{ type: "gln", value: "5400112000011" }],
			}),
		).toEqual({ scheme: "0088", value: "5400112000011" });
	});

	it("maps a Dutch VAT number to EAS 9944", () => {
		expect(
			endpointOf({
				customer_address: { country: "NL" },
				customer_tax_ids: [{ type: "eu_vat", value: "NL123456789B01" }],
			}),
		).toEqual({ scheme: "9944", value: "NL123456789B01" });
	});

	it("honours an explicit endpoint override (e.g. the registered identifier)", () => {
		expect(
			endpointOf(
				{ customer_tax_ids: [{ type: "eu_vat", value: "BE0733756597" }] },
				{ customerEndpoint: { scheme: "0208", value: "0733756597" } },
			),
		).toEqual({ scheme: "0208", value: "0733756597" });
	});

	it("leaves the endpoint null when no identifier resolves to a scheme", () => {
		expect(
			endpointOf({
				customer_address: { country: "US" },
				customer_tax_ids: [],
			}),
		).toBeNull();
	});
});
