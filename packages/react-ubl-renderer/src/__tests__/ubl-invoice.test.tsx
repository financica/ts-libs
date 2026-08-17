import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUblInvoice, type UblInvoice as UblInvoiceData } from "@financica/ubl";
import { DOMParser } from "@xmldom/xmldom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatPercent } from "../format";
import { renderUblInvoiceHtml } from "../render-html";
import { ublInvoiceCss } from "../styles";
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

const LOCALE = "en-US";

const render = (invoice: UblInvoiceData) =>
	renderToStaticMarkup(<UblInvoice invoice={invoice} />);

// renderToStaticMarkup emits well-formed XHTML-ish markup (void elements
// self-closed, attributes quoted, text escaped) so an XML parser can walk it.
// Wrapped in a root so fragments with several top-level nodes still parse.
const parse = (html: string) => {
	const doc = new DOMParser({
		onError: (level, message) => {
			throw new Error(`${level}: ${message}`);
		},
	}).parseFromString(`<root>${html}</root>`, "text/xml");
	return doc.documentElement!;
};

type El = ReturnType<typeof parse>;

const byClass = (root: El, className: string): El[] =>
	Array.from(root.getElementsByTagName("*")).filter((el) =>
		(el.getAttribute("class") ?? "").split(/\s+/).includes(className),
	);
const text = (el: El | undefined | null): string => (el?.textContent ?? "").trim();
const rows = (root: El, cls: string) =>
	byClass(root, cls).map((row) => text(row.firstChild as El));

describe("UblInvoice", () => {
	it("renders header, parties, line items, totals and payment", () => {
		const root = parse(render(baseInvoice));

		// Heading carries the invoice number; body rows equal the line count.
		expect(text(root.getElementsByTagName("h1")[0])).toContain(baseInvoice.id);
		const tbody = root.getElementsByTagName("tbody")[0]!;
		expect(tbody.getElementsByTagName("tr").length).toBe(baseInvoice.lines.length);

		expect(byClass(root, "ubl-party-name").map(text)).toEqual([
			baseInvoice.seller.name,
			baseInvoice.buyer.name,
		]);

		// Peppol endpoint is shown as scheme:value in the party field list.
		const dds = Array.from(root.getElementsByTagName("dd")).map(text);
		expect(dds).toContain(
			`${baseInvoice.seller.endpointSchemeId}:${baseInvoice.seller.endpointId}`,
		);

		// Grand total is the tax-inclusive amount, formatted by the same formatter.
		const totals = byClass(root, "ubl-totals")[0]!;
		expect(text(totals)).toContain(formatMoney("EUR", 121, LOCALE));

		// Payment section carries the IBAN.
		expect(Array.from(root.getElementsByTagName("code")).map(text)).toContain(
			"BE10000123456789",
		);
	});

	it("labels a credit note and shows its billing reference", () => {
		const root = parse(
			render({
				...baseInvoice,
				documentType: "CreditNote",
				id: "CN-9001",
				billingReference: {
					invoiceId: "INV-ORIG-9001",
					invoiceIssueDate: "2026-01-26",
				},
			}),
		);

		expect(text(byClass(root, "ubl-badge")[0])).toBe("Credit Note");
		const reference = text(byClass(root, "ubl-reference")[0]);
		expect(reference).toContain("INV-ORIG-9001");
		expect(reference).toContain(formatDate("2026-01-26"));
	});

	it("does not render a billing reference on an Invoice", () => {
		const root = parse(
			render({
				...baseInvoice,
				billingReference: { invoiceId: "INV-ORIG-9001" },
			}),
		);
		expect(byClass(root, "ubl-reference")).toHaveLength(0);
	});

	it("falls back to the registration name when PartyName is empty", () => {
		const root = parse(
			render({
				...baseInvoice,
				seller: {
					...baseInvoice.seller,
					name: "",
					registrationName: "Acme Legal BV",
				},
			}),
		);
		expect(text(byClass(root, "ubl-party-name")[0])).toBe("Acme Legal BV");
	});

	it("escapes untrusted text fields", () => {
		const html = render({
			...baseInvoice,
			seller: { ...baseInvoice.seller, name: '<script>alert("x")</script>' },
		});
		expect(html).not.toContain("<script>alert");
		// Once parsed, the name comes back as the literal string.
		expect(text(byClass(parse(html), "ubl-party-name")[0])).toBe(
			'<script>alert("x")</script>',
		);
	});
});

describe("UblInvoice totals", () => {
	const labels = (invoice: UblInvoiceData) =>
		rows(parse(render(invoice)), "ubl-totals-row");

	it("shows the amount due only when it differs from the total", () => {
		expect(labels(baseInvoice)).not.toContain("Amount due");
		// Within the 0.005 tolerance: still equal.
		expect(
			labels({
				...baseInvoice,
				monetaryTotal: { ...baseInvoice.monetaryTotal, payableAmount: 121.004 },
			}),
		).not.toContain("Amount due");
		expect(
			labels({
				...baseInvoice,
				monetaryTotal: { ...baseInvoice.monetaryTotal, payableAmount: 100 },
			}),
		).toContain("Amount due");
	});

	it("renders prepaid, allowance, charge and rounding rows only when non-zero", () => {
		const zero = labels({
			...baseInvoice,
			monetaryTotal: {
				...baseInvoice.monetaryTotal,
				prepaidAmount: 0,
				allowanceTotalAmount: 0,
				chargeTotalAmount: 0,
				payableRoundingAmount: 0,
			},
		});
		expect(zero).toEqual(expect.not.arrayContaining(["Amount paid"]));
		expect(zero).toEqual(expect.not.arrayContaining(["Discount"]));
		expect(zero).toEqual(expect.not.arrayContaining(["Charges"]));
		expect(zero).toEqual(expect.not.arrayContaining(["Rounding"]));

		const nonZero = labels({
			...baseInvoice,
			monetaryTotal: {
				...baseInvoice.monetaryTotal,
				prepaidAmount: 10,
				allowanceTotalAmount: 5,
				chargeTotalAmount: 3,
				payableRoundingAmount: -0.01,
			},
		});
		expect(nonZero).toEqual(
			expect.arrayContaining(["Amount paid", "Discount", "Charges", "Rounding"]),
		);
	});

	it("renders a single placeholder row when there are no lines", () => {
		const root = parse(render({ ...baseInvoice, lines: [] }));
		const tbody = root.getElementsByTagName("tbody")[0]!;
		const trs = tbody.getElementsByTagName("tr");
		expect(trs.length).toBe(1);
		// The placeholder cell spans the whole header. React emits the attribute
		// as `colSpan`, which HTML matches case-insensitively but our XML parser
		// does not, so read it case-insensitively too.
		const cell = trs[0]!.getElementsByTagName("td")[0]!;
		const colspan = Array.from(cell.attributes).find(
			(attr) => attr.name.toLowerCase() === "colspan",
		)?.value;
		const headerCells = root
			.getElementsByTagName("thead")[0]!
			.getElementsByTagName("th").length;
		expect(colspan).toBe(String(headerCells));
	});
});

describe("UblInvoice xml input", () => {
	const fixtureXml = readFileSync(
		join(
			dirname(fileURLToPath(import.meta.url)),
			"../../../ubl/test/fixtures/ubl-invoice.xml",
		),
		"utf8",
	);

	it("renders the same data the parser extracts from the fixture", () => {
		const parsed = parseUblInvoice(fixtureXml)!;
		expect(parsed).not.toBeNull();
		const root = parse(renderToStaticMarkup(<UblInvoice xml={fixtureXml} />));

		expect(text(root.getElementsByTagName("h1")[0])).toContain(parsed.id);
		expect(byClass(root, "ubl-party-name").map(text)).toEqual([
			parsed.seller.name,
			parsed.buyer.name,
		]);
		const tbody = root.getElementsByTagName("tbody")[0]!;
		expect(tbody.getElementsByTagName("tr").length).toBe(parsed.lines.length);
	});

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
		const invoice = { ...baseInvoice, id: "<x>" };
		const html = renderUblInvoiceHtml(invoice);
		expect(html.startsWith("<!doctype html>")).toBe(true);

		const doc = parse(html.replace(/^<!doctype html>/i, ""));
		// Untrimmed: ublInvoiceCss opens and closes with a newline.
		expect(doc.getElementsByTagName("style")[0]?.textContent).toContain(
			ublInvoiceCss,
		);
		// The <title> is escaped: the parsed text is the raw id, the source is not.
		expect(text(doc.getElementsByTagName("title")[0])).toBe("Invoice <x>");
		expect(html).not.toContain("<title>Invoice <x>");

		const body = doc.getElementsByTagName("body")[0]!;
		const expected = parse(renderToStaticMarkup(<UblInvoice invoice={invoice} />));
		expect(text(body)).toBe(text(expected));
		expect(byClass(body, "ubl-invoice")).toHaveLength(1);
	});

	it("throws when given unparseable xml", () => {
		expect(() => renderUblInvoiceHtml("not valid ubl")).toThrow(/could not parse/i);
	});
});

describe("format helpers", () => {
	// Renderer convention: UBL ISO dates (BT-2) shown as DD/MM/YYYY.
	it.each([
		["2026-02-25", "25/02/2026"],
		["2026-02-25T10:00:00", "25/02/2026"],
		["25 Feb 2026", "25 Feb 2026"], // non-ISO passes through untouched
		[null, "-"],
		[undefined, "-"],
		["", "-"],
	])("formatDate(%j) → %j", (input, expected) => {
		expect(formatDate(input)).toBe(expected);
	});

	// Trailing zeros dropped, at most two decimals.
	it.each([
		[0, "0%"],
		[6.5, "6.5%"],
		[21, "21%"],
		[100, "100%"],
		[12.345, "12.35%"],
	])("formatPercent(%s) → %s", (input, expected) => {
		expect(formatPercent(input)).toBe(expected);
	});

	it("falls back to a plain `amount CODE` when the currency code is invalid", () => {
		expect(formatMoney("NOPE", 12.5, LOCALE)).toBe("12.50 NOPE");
	});

	it("defaults an empty currency to EUR", () => {
		expect(formatMoney("", 1, LOCALE)).toBe(formatMoney("EUR", 1, LOCALE));
	});
});
