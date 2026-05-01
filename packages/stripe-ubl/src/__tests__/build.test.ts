import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
	buildScradaCreditInvoiceFromStripeCreditNote,
	buildScradaInvoiceFromStripeInvoice,
	type ScradaSupplier,
} from "../index";

const buildSupplier = (overrides: Partial<ScradaSupplier> = {}): ScradaSupplier => ({
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
					discount_amounts: [],
					invoice_line_item: "il_123",
					livemode: false,
					metadata: {},
					pretax_credit_amounts: [],
					quantity: 2,
					tax_rates: [],
					taxes: [{ amount: 2100 }],
					type: "invoice_line_item",
					unit_amount: 5000,
					unit_amount_decimal: "5000",
				},
			],
		},
		...overrides,
	}) as unknown as Stripe.CreditNote;

describe("buildScradaInvoiceFromStripeInvoice", () => {
	it("converts a basic Stripe invoice to a Scrada payload", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});

		expect(payload.number).toBe("INV-001");
		expect(payload.currency).toBe("EUR");
		expect(payload.creditInvoice).toBe(false);
		expect(payload.totalExclVat).toBe(100);
		expect(payload.totalVat).toBe(21);
		expect(payload.totalInclVat).toBe(121);
		expect(payload.supplier.name).toBe("Acme BE");
		expect(payload.customer.name).toBe("Test Customer");
		expect(payload.customer.vatNumber).toBe("BE0733756597");
	});

	it("sends supplier.vatStatus by default", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(payload.supplier.vatStatus).toBe(1);
	});

	it("propagates a franchise vatStatus", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
						{
							description: "Item",
							amount: 10000,
							quantity: 1,
							tax_amounts: [],
							discount_amounts: [],
						},
					],
				},
				total: 10000,
				total_excluding_tax: 10000,
			}),
			supplier: buildSupplier({ vatStatus: 3 }),
		});
		expect(payload.supplier.vatStatus).toBe(3);
		expect(payload.totalVat).toBe(0);
	});

	it("converts amounts from cents to decimals", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 50050,
				total: 60560,
				total_excluding_tax: 50050,
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
						{
							description: "Widget",
							amount: 50050,
							quantity: 1,
							tax_amounts: [{ amount: 10510 }],
							discount_amounts: [],
						},
					],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.totalExclVat).toBe(500.5);
		expect(payload.totalVat).toBe(105.1);
		expect(payload.totalInclVat).toBe(605.6);
	});

	it("uses finalized_at as the invoice date", () => {
		// 2026-04-30 14:00 UTC
		const finalizedAt = Math.floor(Date.UTC(2026, 3, 30, 14) / 1000);
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				status_transitions: { finalized_at: finalizedAt },
				created: finalizedAt - 86400 * 5, // five days earlier
			}),
			supplier: buildSupplier(),
		});
		expect(payload.invoiceDate).toBe("2026-04-30");
	});

	it("derives the externalReference from the prefix + invoice ID", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({ id: "in_special_123" }),
			supplier: buildSupplier(),
		});
		expect(payload.externalReference).toBe("stripe:in_special_123");
	});

	it("honors a custom externalReference", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
			externalReference: "peppost:custom",
		});
		expect(payload.externalReference).toBe("peppost:custom");
	});

	it("includes attachment when provided", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
			attachment: {
				filename: "invoice.pdf",
				fileType: 1,
				mimeType: "application/pdf",
				base64Data: "JVBERg==",
			},
		});
		expect(payload.attachments).toHaveLength(1);
		expect(payload.attachments?.[0]?.filename).toBe("invoice.pdf");
	});

	it("rejects an invalid currency", () => {
		expect(() =>
			buildScradaInvoiceFromStripeInvoice({
				invoice: buildStripeInvoice({ currency: "EU" as unknown as string }),
				supplier: buildSupplier(),
			}),
		).toThrowError(/Invalid currency/);
	});

	it("classifies reverse-charge lines as exempt (vatType 3)", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 10000,
				total_excluding_tax: 10000,
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
						{
							description: "Intra-EU service",
							amount: 10000,
							quantity: 1,
							tax_amounts: [
								{ amount: 0, taxability_reason: "reverse_charge" },
							],
							discount_amounts: [],
						},
					],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.lines[0]?.vatType).toBe(3);
		expect(payload.lines[0]?.vatPercentage).toBe(0);
	});

	it("classifies zero_rated lines as zero-rated (vatType 2)", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 10000,
				total_excluding_tax: 10000,
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
						{
							description: "Zero-rated export",
							amount: 10000,
							quantity: 1,
							tax_amounts: [
								{ amount: 0, taxability_reason: "zero_rated" },
							],
							discount_amounts: [],
						},
					],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.lines[0]?.vatType).toBe(2);
	});

	it("reads VAT from line.taxes when tax_amounts is empty", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 15000,
				total: 18150,
				total_excluding_tax: 15000,
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
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
					],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.lines[0]?.vatPercentage).toBe(21);
		expect(payload.lines[0]?.vatType).toBe(1);
		expect(payload.totalVat).toBe(31.5);
		expect(payload.vatTotals).toHaveLength(1);
		expect(payload.vatTotals[0]?.vatType).toBe(1);
		expect(payload.vatTotals[0]?.totalVat).toBe(31.5);
	});

	it("preserves VAT rate for fully-discounted lines via expanded tax_rate", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 0,
				total: 0,
				total_excluding_tax: 0,
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [
						{
							description: "Fully discounted",
							amount: 0,
							quantity: 1,
							tax_amounts: [{ amount: 0, tax_rate: { percentage: 21 } }],
							discount_amounts: [{ amount: 10000 }],
						},
					],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.lines[0]?.vatPercentage).toBe(21);
		expect(payload.lines[0]?.vatType).toBe(1);
	});

	it("falls back to a single line when invoice.lines is empty", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({
				subtotal: 10000,
				total: 12100,
				total_excluding_tax: 10000,
				description: "Consulting services",
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/invoices/in_test_123/lines",
					data: [],
				},
			}),
			supplier: buildSupplier(),
		});

		expect(payload.lines).toHaveLength(1);
		expect(payload.lines[0]?.itemName).toBe("Consulting services");
		expect(payload.lines[0]?.totalExclVat).toBe(100);
		expect(payload.lines[0]?.vatPercentage).toBe(21);
	});

	it("does not silently substitute supplier country when customer country is missing", () => {
		const payload = buildScradaInvoiceFromStripeInvoice({
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
		expect(payload.customer.address.countryCode).toBeNull();
	});
});

describe("buildScradaCreditInvoiceFromStripeCreditNote", () => {
	it("marks the document as a credit invoice", () => {
		const payload = buildScradaCreditInvoiceFromStripeCreditNote({
			creditNote: buildStripeCreditNote(),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(payload.creditInvoice).toBe(true);
		expect(payload.number).toBe("CN-001");
	});

	it("derives the customer party from the parent invoice", () => {
		const payload = buildScradaCreditInvoiceFromStripeCreditNote({
			creditNote: buildStripeCreditNote(),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(payload.customer.name).toBe("Test Customer");
		expect(payload.customer.vatNumber).toBe("BE0733756597");
	});

	it("uses effective_at as the invoice date", () => {
		const payload = buildScradaCreditInvoiceFromStripeCreditNote({
			creditNote: buildStripeCreditNote({ effective_at: 1714521600 }),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(payload.invoiceDate).toBe("2024-05-01");
	});

	it("sends supplier.vatStatus from the supplier param", () => {
		const payload = buildScradaCreditInvoiceFromStripeCreditNote({
			creditNote: buildStripeCreditNote(),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier({ vatStatus: 3 }),
		});
		expect(payload.supplier.vatStatus).toBe(3);
	});

	it("reads the rate from tax_rate_details.tax_rate (real Stripe shape)", () => {
		const payload = buildScradaCreditInvoiceFromStripeCreditNote({
			creditNote: buildStripeCreditNote({
				lines: {
					object: "list",
					has_more: false,
					url: "/v1/credit_notes/cn_test_123/lines",
					data: [
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
									tax_rate_details: {
										tax_rate: { percentage: 21 },
									},
									taxability_reason: null,
									taxable_amount: 1,
									type: "tax_rate_details",
								},
							],
							type: "invoice_line_item",
							unit_amount: 10000,
						},
					],
				},
			}),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});

		expect(payload.lines[0]?.vatPercentage).toBe(21);
		expect(payload.lines[0]?.vatType).toBe(1);
	});
});
