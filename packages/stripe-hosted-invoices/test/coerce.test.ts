import { describe, expect, it } from "vitest";
import {
	coerceCreditNote,
	coerceCreditNoteLinesPage,
	coerceHostedInvoice,
	coerceLinesPage,
} from "../src/coerce.js";

describe("coerceHostedInvoice", () => {
	it("normalizes the decimal strings Stripe sends for integer money fields", () => {
		const invoice = coerceHostedInvoice({
			id: "in_1",
			subtotal: "10000",
			tax: "2100",
			total: 12100,
			total_tax_amounts: [{ amount: "2100", inclusive: false }],
			lines: { data: [{ id: "il_1", amount: "10000", unit_amount: "5000" }] },
		});

		expect(invoice).toMatchObject({
			subtotal: 10000,
			tax: 2100,
			total: 12100,
			total_tax_amounts: [{ amount: 2100 }],
			lines: { data: [{ amount: 10000, unit_amount: 5000 }] },
		});
	});

	it("preserves fields it does not know about", () => {
		const invoice = coerceHostedInvoice({
			id: "in_1",
			some_future_field: { nested: true },
			lines: { data: [{ id: "il_1", future_line_field: "kept" }], url: "/v1/…" },
		});

		expect(invoice?.some_future_field).toEqual({ nested: true });
		expect(invoice?.lines?.url).toBe("/v1/…");
		expect(invoice?.lines?.data?.[0]?.future_line_field).toBe("kept");
	});

	it("leaves an unreadable money field null rather than defaulting it to zero", () => {
		// A silent 0 on a tax field understates the VAT due; null is "the
		// payload did not say", which callers must handle explicitly.
		const invoice = coerceHostedInvoice({ id: "in_1", total: "not-a-number" });
		expect(invoice?.total).toBeNull();
	});

	it("rejects only a non-object body", () => {
		expect(coerceHostedInvoice(null)).toBeNull();
		expect(coerceHostedInvoice("nope")).toBeNull();
		expect(coerceHostedInvoice([])).toBeNull();
		// An empty object is a legitimate (if useless) response, not a failure.
		expect(coerceHostedInvoice({})).toEqual({});
	});
});

describe("coerceCreditNote", () => {
	it("requires an id, since it is the document's identity and dedupe key", () => {
		expect(coerceCreditNote({ number: "CN-1", total: 100 })).toBeNull();
		expect(coerceCreditNote({ id: "", total: 100 })).toBeNull();
		expect(coerceCreditNote({ id: "cn_1" })?.id).toBe("cn_1");
	});

	it("normalizes both the legacy tax_amounts and the newer total_taxes", () => {
		const creditNote = coerceCreditNote({
			id: "cn_1",
			subtotal: "5000",
			total: "6050",
			tax_amounts: [{ amount: "1050" }],
			total_taxes: [{ amount: "1050" }],
			refunds: [{ refund: "re_1", amount_refunded: "6050" }],
		});

		expect(creditNote).toMatchObject({
			subtotal: 5000,
			total: 6050,
			tax_amounts: [{ amount: 1050 }],
			total_taxes: [{ amount: 1050 }],
			refunds: [{ refund: "re_1", amount_refunded: 6050 }],
		});
	});

	it("normalizes line amounts under both tax shapes", () => {
		const creditNote = coerceCreditNote({
			id: "cn_1",
			lines: {
				data: [
					{
						id: "cnl_1",
						amount: "2500",
						unit_amount_excluding_tax: "2066",
						taxes: [{ amount: "434" }],
					},
				],
			},
		});

		expect(creditNote?.lines?.data?.[0]).toMatchObject({
			amount: 2500,
			unit_amount_excluding_tax: 2066,
			taxes: [{ amount: 434 }],
		});
	});
});

describe("page coercion", () => {
	it("reports has_more only when Stripe says exactly true", () => {
		expect(coerceLinesPage({ data: [], has_more: true })?.has_more).toBe(true);
		expect(coerceLinesPage({ data: [], has_more: "true" })?.has_more).toBe(false);
		expect(coerceLinesPage({ data: [] })?.has_more).toBe(false);
	});

	it("drops non-object entries instead of failing the page", () => {
		const page = coerceLinesPage({ data: [{ id: "il_1" }, null, "junk"] });
		expect(page?.data).toHaveLength(1);

		const cnPage = coerceCreditNoteLinesPage({ data: [{ id: "cnl_1" }, 42] });
		expect(cnPage?.data).toHaveLength(1);
	});

	it("treats a missing data array as empty", () => {
		expect(coerceLinesPage({})?.data).toEqual([]);
		expect(coerceLinesPage(null)).toBeNull();
	});
});
