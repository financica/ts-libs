import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
	buildUblCreditNoteDocument,
	buildUblInvoiceDocument,
	buildUblInvoiceFromStripeInvoice,
	resolveCreditNoteSettledCents,
	resolvePrepaidAmount,
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
	vatStatus: "subject",
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

	it("joins the memo and footer into the BT-22 note", () => {
		expect(
			buildUblInvoiceDocument({
				invoice: buildStripeInvoice({ footer: "Legal mentions" }),
				supplier: buildSupplier(),
			}).note,
		).toBe("Test invoice\n\nLegal mentions");
		expect(
			buildUblInvoiceDocument({
				invoice: buildStripeInvoice({ description: null, footer: null }),
				supplier: buildSupplier(),
			}).note,
		).toBeNull();
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

	it("falls back the due date to the issue date when Stripe has none (BR-CO-25)", () => {
		// `charge_automatically` invoices carry no due_date; without a fallback the
		// UBL would omit BT-9 and BT-20 and Peppol rejects any positive payable.
		// Still open here, so there *is* a positive payable to cover.
		const finalizedAt = Math.floor(Date.UTC(2026, 3, 11, 9) / 1000);
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				collection_method: "charge_automatically",
				due_date: null,
				status: "open",
				amount_due: 12100,
				amount_paid: 0,
				status_transitions: { finalized_at: finalizedAt },
			}),
			supplier: buildSupplier(),
		});
		expect(doc.issueDate).toBe("2026-04-11");
		expect(doc.dueDate).toBe("2026-04-11");
		expect(doc.monetaryTotal.payableAmount).toBe(121);
	});

	it("invents no due date for a settled invoice with none (BR-CO-25 moot)", () => {
		// Once BT-113 is emitted a paid invoice reports a payable amount of 0, so
		// BR-CO-25 no longer applies and fabricating a due date would put a date
		// on the wire for an invoice that is not due.
		const finalizedAt = Math.floor(Date.UTC(2026, 3, 11, 9) / 1000);
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				collection_method: "charge_automatically",
				due_date: null,
				status: "paid",
				amount_due: 0,
				amount_paid: 12100,
				status_transitions: { finalized_at: finalizedAt },
			}),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.payableAmount).toBe(0);
		expect(doc.dueDate).toBeNull();
	});

	it("keeps a due date Stripe did supply even once settled", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({ status: "paid", amount_paid: 12100 }),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.payableAmount).toBe(0);
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

	it("coerces all lines to exempt when the supplier is a franchise (small_business)", () => {
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
			supplier: buildSupplier({ vatStatus: "small_business" }),
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
	it("notes the credit reason as #ACD# when there is no memo", () => {
		const base = {
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		};
		expect(
			buildUblCreditNoteDocument({
				...base,
				creditNote: buildStripeCreditNote({
					memo: null,
					reason: "order_change",
				}),
			}).note,
		).toBe("#ACD#order change");
		// The memo wins over the coded reason.
		expect(
			buildUblCreditNoteDocument({
				...base,
				creditNote: buildStripeCreditNote({ reason: "order_change" }),
			}).note,
		).toBe("Partial refund");
	});

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

describe("prepaid amount (BT-113)", () => {
	it("reports nothing prepaid for an unpaid invoice", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({ amount_paid: 0 }),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBeUndefined();
		expect(doc.monetaryTotal.payableAmount).toBe(121);
	});

	it("reports a fully paid invoice as settled (BR-CO-16)", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({ status: "paid", amount_paid: 12100 }),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.taxInclusiveAmount).toBe(121);
		expect(doc.monetaryTotal.prepaidAmount).toBe(121);
		expect(doc.monetaryTotal.payableAmount).toBe(0);
	});

	it("reports a partially paid invoice as the outstanding remainder", () => {
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({ amount_paid: 5000, amount_due: 7100 }),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBe(50);
		expect(doc.monetaryTotal.payableAmount).toBe(71);
	});

	it("excludes credit-note reductions from BT-113", () => {
		// `amount_due` is also reduced by credit notes, so `total - amount_due`
		// would report 121 prepaid here. Only the 50 actually paid is BT-113; the
		// 21 credited travels as its own document and is netted via BT-25.
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				amount_paid: 5000,
				amount_due: 5000,
				post_payment_credit_notes_amount: 2100,
			}),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBe(50);
		expect(doc.monetaryTotal.payableAmount).toBe(71);
	});

	it("snaps a settled document to the derived BT-112, not Stripe's total", () => {
		// Derived VAT is 105.11 (BR-CO-17) against Stripe's reported 605.60 total.
		// Passing Stripe's gross figure would leave 0.01 payable — positive, so
		// BR-CO-25 would demand a due date again.
		const doc = buildUblInvoiceDocument({
			invoice: buildStripeInvoice({
				subtotal: 50050,
				total: 60560,
				total_excluding_tax: 50050,
				status: "paid",
				amount_paid: 60560,
				due_date: null,
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
		expect(doc.monetaryTotal.taxInclusiveAmount).toBe(605.61);
		expect(doc.monetaryTotal.prepaidAmount).toBe(605.61);
		expect(doc.monetaryTotal.payableAmount).toBe(0);
		expect(doc.dueDate).toBeNull();
	});

	it("serializes cbc:PrepaidAmount before cbc:PayableAmount", () => {
		const xml = buildUblInvoiceFromStripeInvoice({
			invoice: buildStripeInvoice({ status: "paid", amount_paid: 12100 }),
			supplier: buildSupplier(),
		});
		expect(xml).toContain(
			'<cbc:PrepaidAmount currencyID="EUR">121.00</cbc:PrepaidAmount>',
		);
		expect(xml.indexOf("cbc:PrepaidAmount")).toBeLessThan(
			xml.indexOf("cbc:PayableAmount"),
		);
	});

	it("treats a refunded credit note as settled", () => {
		// post_payment: the money already went back via refund / balance credit /
		// out-of-band. Emitting the full total as payable is the double-pay risk.
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({
				type: "post_payment",
				pre_payment_amount: 0,
				post_payment_amount: 12100,
			}),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBe(121);
		expect(doc.monetaryTotal.payableAmount).toBe(0);
	});

	it("leaves a pre-payment credit note fully payable so BT-25 netting works", () => {
		// Nothing was returned to the buyer; the credit only reduced the open
		// invoice's balance. The receiver nets the two documents via BT-25, so the
		// credit note must carry the full amount as payable — see below.
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({
				type: "pre_payment",
				pre_payment_amount: 12100,
				post_payment_amount: 0,
			}),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBeUndefined();
		expect(doc.monetaryTotal.payableAmount).toBe(121);
	});

	it("nets a pre-payment credit note against its parent invoice to zero", () => {
		// The decisive case for excluding pre_payment_amount from BT-113. Both
		// documents go over Peppol; the receiver settles invoice minus credit
		// note. Emitting BT-113 here would make the credit note payable 0 and the
		// buyer would still owe 121 despite having been credited in full.
		const invoice = buildStripeInvoice({ amount_paid: 0 });
		const invoiceDoc = buildUblInvoiceDocument({
			invoice,
			supplier: buildSupplier(),
		});
		const creditNoteDoc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({
				type: "pre_payment",
				pre_payment_amount: 12100,
				post_payment_amount: 0,
			}),
			invoice,
			supplier: buildSupplier(),
		});

		expect(creditNoteDoc.precedingInvoiceId).toBe("INV-001");
		expect(
			invoiceDoc.monetaryTotal.payableAmount -
				creditNoteDoc.monetaryTotal.payableAmount,
		).toBe(0);
	});

	it("splits a mixed credit note on post_payment_amount", () => {
		const doc = buildUblCreditNoteDocument({
			creditNote: buildStripeCreditNote({
				type: "mixed",
				pre_payment_amount: 7100,
				post_payment_amount: 5000,
			}),
			invoice: buildStripeInvoice(),
			supplier: buildSupplier(),
		});
		expect(doc.monetaryTotal.prepaidAmount).toBe(50);
		expect(doc.monetaryTotal.payableAmount).toBe(71);
	});
});

describe("settlement resolvers", () => {
	it("reads the settled amount from the split, ignoring `type`", () => {
		// `type` is never consulted: it cannot express a mixed credit note on any
		// API version that lacks the split, so trusting it would overstate BT-113.
		expect(
			resolveCreditNoteSettledCents({
				type: "post_payment",
				total: 12100,
				post_payment_amount: 5000,
			} as unknown as Stripe.CreditNote),
		).toBe(5000);
	});

	it("asserts no settlement when the split is missing at runtime", () => {
		expect(
			resolveCreditNoteSettledCents({
				type: "post_payment",
				total: 12100,
			} as unknown as Stripe.CreditNote),
		).toBe(0);
	});

	it("returns undefined when nothing is settled", () => {
		expect(
			resolvePrepaidAmount({
				settledCents: 0,
				grossCents: 12100,
				taxInclusiveAmount: 121,
			}),
		).toBeUndefined();
	});

	it("absorbs an overpayment into a zero payable rather than a negative one", () => {
		expect(
			resolvePrepaidAmount({
				settledCents: 20000,
				grossCents: 12100,
				taxInclusiveAmount: 121,
			}),
		).toBe(121);
	});
});
