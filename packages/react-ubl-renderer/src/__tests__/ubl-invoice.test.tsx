import type { UblInvoice as UblInvoiceData } from "@financica/ubl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderUblInvoiceHtml } from "../render-html";
import { UblInvoice } from "../ubl-invoice";

const baseInvoice: UblInvoiceData = {
	documentType: "Invoice",
	id: "INV-1001",
	issueDate: "2026-02-25",
	dueDate: "2026-03-10",
	currency: "EUR",
	seller: {
		name: "Acme BV",
		vatId: "BE0123456789",
		endpointId: "0793904121",
		endpointSchemeId: "0208",
		address: {
			street: "Main Street 10",
			city: "Brussels",
			postalZone: "1000",
			countryCode: "BE",
		},
	},
	buyer: {
		name: "Buyer NV",
		vatId: "BE9876543210",
		address: {
			street: "Customer Road 5",
			city: "Ghent",
			postalZone: "9000",
			countryCode: "BE",
		},
	},
	lines: [
		{
			id: "1",
			description: "Consulting services",
			quantity: 2,
			unitCode: "C62",
			unitPrice: 50,
			lineExtensionAmount: 100,
			taxPercent: 21,
			taxAmount: 21,
			taxCategoryId: "S",
			itemName: "Consulting",
		},
	],
	taxSubtotals: [
		{ taxableAmount: 100, taxAmount: 21, taxPercent: 21, taxCategoryId: "S" },
	],
	monetaryTotal: {
		lineExtensionAmount: 100,
		taxExclusiveAmount: 100,
		taxInclusiveAmount: 121,
		payableAmount: 121,
	},
	paymentMeansList: [{ code: "30", iban: "BE10000123456789", bic: "GEBABEBB" }],
};

const render = (invoice: UblInvoiceData) =>
	renderToStaticMarkup(<UblInvoice invoice={invoice} />);

describe("UblInvoice", () => {
	it("renders header, parties, line items, totals and payment", () => {
		const html = render(baseInvoice);

		expect(html).toContain("Invoice INV-1001");
		expect(html).toContain("Acme BV");
		expect(html).toContain("Buyer NV");
		// Peppol endpoint scheme:value.
		expect(html).toContain("0208:0793904121");
		// One line item, with its item name.
		expect((html.match(/<tr>/g) ?? []).length).toBe(2); // header row + 1 line
		expect(html).toContain("Consulting");
		// Amounts from monetaryTotal / taxSubtotals.
		expect(html).toContain("€100.00");
		expect(html).toContain("€21.00");
		expect(html).toContain("€121.00");
		expect(html).toContain("Standard rate (21%)");
		expect(html).toContain("BE10000123456789");
	});

	it("labels a credit note and shows its billing reference", () => {
		const html = render({
			...baseInvoice,
			documentType: "CreditNote",
			id: "CN-9001",
			billingReference: {
				invoiceId: "INV-ORIG-9001",
				invoiceIssueDate: "2026-01-26",
			},
		});

		expect(html).toContain("Credit Note CN-9001");
		expect(html).toContain("INV-ORIG-9001");
		expect(html).toContain("issued on 26/01/2026");
	});

	it("falls back to the registration name when PartyName is empty", () => {
		const html = render({
			...baseInvoice,
			seller: {
				...baseInvoice.seller,
				name: "",
				registrationName: "Acme Legal BV",
			},
		});
		expect(html).toContain("Acme Legal BV");
	});

	it("escapes untrusted text fields", () => {
		const html = render({
			...baseInvoice,
			seller: { ...baseInvoice.seller, name: '<script>alert("x")</script>' },
		});
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("UblInvoice xml input", () => {
	it("renders the fallback when xml cannot be parsed", () => {
		const html = renderToStaticMarkup(
			<UblInvoice xml="not valid ubl" fallback={<p>broken</p>} />,
		);
		expect(html).toBe("<p>broken</p>");
	});

	it("renders nothing when xml is unparseable and no fallback is given", () => {
		const html = renderToStaticMarkup(<UblInvoice xml="not valid ubl" />);
		expect(html).toBe("");
	});
});

describe("renderUblInvoiceHtml", () => {
	it("returns a self-contained HTML document with inlined styles", () => {
		const html = renderUblInvoiceHtml(baseInvoice);
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain("<title>Invoice INV-1001</title>");
		expect(html).toContain(".ubl-invoice");
		expect(html).toContain('<article class="ubl-invoice">');
		expect(html).toContain("Acme BV");
	});

	it("throws when given unparseable xml", () => {
		expect(() => renderUblInvoiceHtml("not valid ubl")).toThrow(/could not parse/i);
	});
});
