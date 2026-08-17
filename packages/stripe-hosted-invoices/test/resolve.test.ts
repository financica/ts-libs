import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStripeInvoiceUrl } from "../src/resolve.js";

const fixture = (name: string): string =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

/** The happy-path responses for the four hops the protocol makes. */
const protocolRoutes = (): Array<[string, () => Response]> => [
	[
		"invoicedata.stripe.com/hosted_invoice_page",
		() => json({ ephemeral_key: "ek_live_abc", invoice_id: "in_1234567890abc" }),
	],
	[
		"/v1/invoices/in_1234567890abc/hosted",
		() =>
			json({
				id: "in_1234567890abc",
				number: "INV-001",
				currency: "eur",
				total: 12100,
				lines: { data: [{ id: "il_1", amount: 10000 }], has_more: false },
			}),
	],
	[
		"/v1/invoices/in_1234567890abc/credit_notes",
		() => json({ data: [{ id: "cn_1", total: 2500 }] }),
	],
];

const stubFetch = (
	routes: Array<[string, () => Response]>,
): typeof globalThis.fetch => {
	return ((input: RequestInfo | URL) => {
		const url = String(input);
		const route = routes.find(([match]) => url.includes(match));
		if (!route) return Promise.resolve(new Response("not found", { status: 404 }));
		return Promise.resolve(route[1]());
	}) as typeof globalThis.fetch;
};

describe("resolveStripeInvoiceUrl", () => {
	it("resolves a hosted invoice URL to the invoice, its lines and its credit notes", async () => {
		const fetch = stubFetch(protocolRoutes());

		const result = await resolveStripeInvoiceUrl(
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
			{ fetch },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result).toMatchObject({
			accountId: "acct_1ABC",
			invoiceId: "in_1234567890abc",
			invoice: { number: "INV-001", total: 12100 },
			receipt: null,
			hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
		});
		expect(result.lines).toHaveLength(1);
		expect(result.creditNotes.map((entry) => entry.creditNote.id)).toEqual([
			"cn_1",
		]);
	});

	it("rejects a URL that is not a Stripe hosted URL before making any request", async () => {
		let called = false;
		const fetch = (() => {
			called = true;
			return Promise.resolve(new Response(""));
		}) as typeof globalThis.fetch;

		const result = await resolveStripeInvoiceUrl("https://example.com/inv/1", {
			fetch,
		});

		expect(result).toEqual({ ok: false, error: { kind: "invalid_url" } });
		expect(called).toBe(false);
	});

	it("follows a receipt URL to its invoice and attaches the parsed receipt", async () => {
		// The refund's amount and date exist only on this page; the hosted
		// invoice still reports the invoice as fully paid.
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const fetch = stubFetch([
			[
				"/receipts/invoices/",
				() => new Response(fixture("refund-receipt-348usd.html")),
			],
			...protocolRoutes(),
		]);

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.receipt).toMatchObject({
			kind: "refund",
			amount: 348.99,
			date: "2025-01-08",
			receiptToken,
		});
		// It still centres on the invoice the receipt points at, and the account
		// comes from the hosted link embedded in the page (acct_TESTACCOUNT in
		// the fixture), not from the receipt token.
		expect(result.invoiceId).toBe("in_1234567890abc");
		expect(result.accountId).toBe("acct_TESTACCOUNT");
	});

	it("reads a payment receipt as a payment, not a refund", async () => {
		// Payment receipts lead with "Receipt from <merchant>" and a "Paid <date>"
		// row; the fixtures on disk are both refunds, so this one is synthetic.
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const paymentReceipt = `<html><body><table>
			<tr><td>Receipt from Example Studio</td></tr>
			<tr><td>$120.00</td></tr>
			<tr><td>Paid March 3, 2025</td></tr>
			<tr><td>Receipt number</td></tr><tr><td>1111-2222</td></tr>
			<tr><td>Invoice number</td></tr><tr><td>ABCD1234-0001</td></tr>
			<tr><td><a href="https://invoice.stripe.com/i/acct_1ABC/live_XYZ">View invoice</a></td></tr>
		</table></body></html>`;
		const fetch = stubFetch([
			["/receipts/invoices/", () => new Response(paymentReceipt)],
			...protocolRoutes(),
		]);

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.receipt).toMatchObject({
			kind: "payment",
			merchantName: "Example Studio",
			amount: 120,
			date: "2025-03-03",
			receiptNumber: "1111-2222",
			invoiceNumber: "ABCD1234-0001",
			creditNote: null,
		});
	});

	it("surfaces the status and URL when the receipt page cannot be fetched", async () => {
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const fetch = stubFetch([
			["/receipts/invoices/", () => new Response("gone", { status: 410 })],
		]);

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result).toMatchObject({
			ok: false,
			error: {
				kind: "http_error",
				status: 410,
				url: `https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			},
		});
	});

	it("returns a network error rather than throwing when the receipt fetch fails", async () => {
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const fetch = (() =>
			Promise.reject(new Error("ECONNRESET"))) as typeof globalThis.fetch;

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result).toMatchObject({ ok: false, error: { kind: "network_error" } });
	});

	it("explains a receipt that is not linked to an invoice", async () => {
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const fetch = stubFetch([
			["/receipts/invoices/", () => new Response("<html>no invoice link</html>")],
		]);

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result).toMatchObject({
			ok: false,
			error: { kind: "invalid_response" },
		});
	});

	it("finds the hosted invoice link even when the receipt escapes its slashes", async () => {
		// The link usually sits inside a JSON script payload, not an href.
		const receiptToken = Buffer.from("acct_1ABCdef").toString("base64url");
		const escaped =
			'<script>{"url":"https:\\/\\/invoice.stripe.com\\/i\\/acct_1ABC\\/live_XYZ"}</script>';
		const fetch = stubFetch([
			["/receipts/invoices/", () => new Response(escaped)],
			...protocolRoutes(),
		]);

		const result = await resolveStripeInvoiceUrl(
			`https://pay.stripe.com/receipts/invoices/${receiptToken}`,
			{ fetch },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.accountId).toBe("acct_1ABC");
	});

	it("still returns the invoice when the credit-note endpoint fails", async () => {
		const fetch = stubFetch([
			...protocolRoutes().filter(([match]) => !match.endsWith("/credit_notes")),
			["/credit_notes", () => json({}, 500)],
		]);

		const result = await resolveStripeInvoiceUrl(
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
			{ fetch },
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.creditNotes).toEqual([]);
	});
});
