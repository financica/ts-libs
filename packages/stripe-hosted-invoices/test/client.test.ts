import { describe, expect, it } from "vitest";
import {
	ephemeralHeaders,
	fetchStripeCreditNotes,
	fetchStripeHostedInvoice,
	fetchStripeHostedPage,
	fetchStripePdf,
	STRIPE_HOSTED_API_VERSION,
} from "../src/client.js";

/**
 * A `fetch` stub that answers from a URL-substring → response map and records
 * every request, so tests can assert on the protocol's wire behaviour rather
 * than on its internals.
 */
const stubFetch = (
	routes: Array<[match: string, respond: () => Response]>,
): typeof globalThis.fetch & {
	calls: Array<{ url: string; init: RequestInit | undefined }>;
} => {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		const route = routes.find(([match]) => url.includes(match));
		if (!route) return Promise.resolve(new Response("not found", { status: 404 }));
		return Promise.resolve(route[1]());
	}) as ReturnType<typeof stubFetch>;
	impl.calls = calls;
	return impl;
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

describe("ephemeralHeaders", () => {
	it("pins the API version and the hosted-page origin", () => {
		// Stripe rejects an ephemeral key when the request does not name an
		// explicit version, and the endpoints reject a missing Origin/Referer.
		expect(ephemeralHeaders("ek_test")).toMatchObject({
			Authorization: "Bearer ek_test",
			"Stripe-Version": STRIPE_HOSTED_API_VERSION,
			Origin: "https://invoice.stripe.com",
			Referer: "https://invoice.stripe.com/",
		});
	});
});

describe("fetchStripeHostedPage", () => {
	const parts = { accountId: "acct_1ABC", liveToken: "live_XYZ" };

	it("digs the ephemeral key and invoice id out of an arbitrarily nested payload", async () => {
		const fetch = stubFetch([
			[
				"invoicedata.stripe.com",
				() =>
					json({
						config: { deep: { ephemeral_key: "ek_live_abc" } },
						other: [{ invoice_id: "in_1234567890abc" }],
					}),
			],
		]);

		const result = await fetchStripeHostedPage(parts, { fetch });

		expect(result).toMatchObject({
			ok: true,
			ephemeralKey: "ek_live_abc",
			invoiceId: "in_1234567890abc",
		});
	});

	it("rejects a key that is not an ephemeral key", async () => {
		const fetch = stubFetch([
			["invoicedata", () => json({ ephemeral_key: "sk_live_secret" })],
		]);

		const result = await fetchStripeHostedPage(parts, { fetch });

		expect(result).toMatchObject({
			ok: false,
			error: { kind: "invalid_response" },
		});
	});

	it("surfaces the status on a non-OK response", async () => {
		const fetch = stubFetch([["invoicedata", () => json({}, 403)]]);

		const result = await fetchStripeHostedPage(parts, { fetch });

		expect(result).toMatchObject({
			ok: false,
			error: { kind: "http_error", status: 403 },
		});
	});

	it("returns a network error rather than throwing", async () => {
		const fetch = (() =>
			Promise.reject(new Error("ECONNRESET"))) as typeof globalThis.fetch;

		const result = await fetchStripeHostedPage(parts, { fetch });

		expect(result).toMatchObject({ ok: false, error: { kind: "network_error" } });
	});
});

describe("fetchStripeHostedInvoice", () => {
	const args = { invoiceId: "in_1", ephemeralKey: "ek_1" };

	it("follows the starting_after cursor until has_more clears", async () => {
		let page = 0;
		const fetch = stubFetch([
			[
				"/hosted",
				() =>
					json({
						id: "in_1",
						total: 300,
						lines: { data: [{ id: "il_1", amount: 100 }], has_more: true },
					}),
			],
			[
				"/lines",
				() => {
					page += 1;
					return page === 1
						? json({ data: [{ id: "il_2", amount: 100 }], has_more: true })
						: json({
								data: [{ id: "il_3", amount: 100 }],
								has_more: false,
							});
				},
			],
		]);

		const result = await fetchStripeHostedInvoice(args, { fetch });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.lines.map((line) => line.id)).toEqual(["il_1", "il_2", "il_3"]);

		const cursors = fetch.calls
			.filter((call) => call.url.includes("/lines"))
			.map((call) => new URL(call.url).searchParams.get("starting_after"));
		expect(cursors).toEqual(["il_1", "il_2"]);
	});

	it("keeps the lines it has when pagination fails mid-way", async () => {
		// A truncated line list is more useful than no invoice at all, but the
		// caller has to be told.
		const warnings: string[] = [];
		const fetch = stubFetch([
			[
				"/hosted",
				() =>
					json({
						id: "in_1",
						lines: { data: [{ id: "il_1" }], has_more: true },
					}),
			],
			["/lines", () => json({}, 500)],
		]);

		const result = await fetchStripeHostedInvoice(args, {
			fetch,
			onWarning: (message) => warnings.push(message),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.lines).toHaveLength(1);
		expect(warnings).toContain("failed to paginate invoice lines");
	});

	it("stops at the page cap and warns when has_more never clears", async () => {
		// MAX_LINE_PAGES is 20. A server that always says has_more with fresh
		// ids would otherwise be followed forever.
		let page = 0;
		const warnings: string[] = [];
		const fetch = stubFetch([
			[
				"/hosted",
				() =>
					json({
						id: "in_1",
						lines: { data: [{ id: "il_0" }], has_more: true },
					}),
			],
			[
				"/lines",
				() => {
					page += 1;
					return json({ data: [{ id: `il_${page}` }], has_more: true });
				},
			],
		]);

		const result = await fetchStripeHostedInvoice(args, {
			fetch,
			onWarning: (message) => warnings.push(message),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(fetch.calls.filter((call) => call.url.includes("/lines"))).toHaveLength(
			20,
		);
		expect(result.lines).toHaveLength(21);
		expect(warnings).toContain(
			"invoice line pagination hit its page cap; lines are truncated",
		);
	});

	it("does not paginate when the first page is already complete", async () => {
		const fetch = stubFetch([
			[
				"/hosted",
				() =>
					json({
						id: "in_1",
						lines: { data: [{ id: "il_1" }], has_more: false },
					}),
			],
		]);

		await fetchStripeHostedInvoice(args, { fetch });

		expect(fetch.calls.filter((call) => call.url.includes("/lines"))).toHaveLength(
			0,
		);
	});
});

describe("fetchStripeCreditNotes", () => {
	const args = { invoiceId: "in_1", ephemeralKey: "ek_1" };

	it("requests only issued credit notes", async () => {
		// Voided credit notes were retracted and never credited anything.
		const fetch = stubFetch([["/credit_notes", () => json({ data: [] })]]);

		await fetchStripeCreditNotes(args, { fetch });

		const url = new URL(fetch.calls[0]?.url ?? "");
		expect(url.searchParams.get("status")).toBe("issued");
	});

	it("keeps the readable credit notes when one entry is unreadable", async () => {
		const warnings: string[] = [];
		const fetch = stubFetch([
			[
				"/credit_notes",
				() => json({ data: [{ id: "cn_1", total: 100 }, { number: "no-id" }] }),
			],
		]);

		const results = await fetchStripeCreditNotes(args, {
			fetch,
			onWarning: (message) => warnings.push(message),
		});

		expect(results.map((entry) => entry.creditNote.id)).toEqual(["cn_1"]);
		expect(warnings).toContain("skipping unreadable credit note");
	});

	it("follows the starting_after cursor for a credit note's remaining lines", async () => {
		// The list endpoint embeds only the first page of each note's lines;
		// the rest live under /v1/credit_notes/{id}/lines.
		let page = 0;
		const fetch = stubFetch([
			[
				"/v1/invoices/in_1/credit_notes",
				() =>
					json({
						data: [
							{
								id: "cn_1",
								total: 300,
								lines: {
									data: [{ id: "cnli_1", amount: 100 }],
									has_more: true,
								},
							},
						],
					}),
			],
			[
				"/v1/credit_notes/cn_1/lines",
				() => {
					page += 1;
					return page === 1
						? json({
								data: [{ id: "cnli_2", amount: 100 }],
								has_more: true,
							})
						: json({
								data: [{ id: "cnli_3", amount: 100 }],
								has_more: false,
							});
				},
			],
		]);

		const results = await fetchStripeCreditNotes(args, { fetch });

		expect(results[0]?.lines.map((line) => line.id)).toEqual([
			"cnli_1",
			"cnli_2",
			"cnli_3",
		]);
		const cursors = fetch.calls
			.filter((call) => call.url.includes("/v1/credit_notes/cn_1/lines"))
			.map((call) => new URL(call.url).searchParams.get("starting_after"));
		expect(cursors).toEqual(["cnli_1", "cnli_2"]);
	});

	it("keeps the embedded credit-note lines when their pagination fails", async () => {
		const warnings: string[] = [];
		const fetch = stubFetch([
			[
				"/v1/invoices/in_1/credit_notes",
				() =>
					json({
						data: [
							{
								id: "cn_1",
								lines: { data: [{ id: "cnli_1" }], has_more: true },
							},
						],
					}),
			],
			["/v1/credit_notes/cn_1/lines", () => json({}, 500)],
		]);

		const results = await fetchStripeCreditNotes(args, {
			fetch,
			onWarning: (message) => warnings.push(message),
		});

		expect(results[0]?.lines.map((line) => line.id)).toEqual(["cnli_1"]);
		expect(warnings).toContain("failed to paginate credit-note lines");
	});

	it("does not fetch credit-note lines when the embedded page is complete", async () => {
		const fetch = stubFetch([
			[
				"/v1/invoices/in_1/credit_notes",
				() =>
					json({
						data: [
							{
								id: "cn_1",
								lines: { data: [{ id: "cnli_1" }], has_more: false },
							},
						],
					}),
			],
		]);

		await fetchStripeCreditNotes(args, { fetch });

		expect(
			fetch.calls.filter((call) => call.url.includes("/v1/credit_notes/")),
		).toHaveLength(0);
	});

	it("returns an empty list rather than failing when the endpoint is unreachable", async () => {
		// An invoice read that cannot reach this endpoint is still a correct
		// invoice read; the caller must not have to map an error for it.
		const fetch = stubFetch([["/credit_notes", () => json({}, 500)]]);

		await expect(fetchStripeCreditNotes(args, { fetch })).resolves.toEqual([]);
	});
});

/** A response whose body is the %PDF magic and whose type says so. */
const pdf = (): Response =>
	new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
		headers: { "content-type": "application/pdf" },
	});

describe("fetchStripePdf", () => {
	it("returns the bytes when the URL serves a PDF directly", async () => {
		const fetch = stubFetch([["files.stripe.com", pdf]]);

		const bytes = await fetchStripePdf("https://files.stripe.com/a.pdf", { fetch });

		expect(bytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
	});

	it("follows a JSON body that names the real file URL", async () => {
		const fetch = stubFetch([
			[
				"invoicedata.stripe.com",
				() => json({ file_url: "https://files.stripe.com/a.pdf" }),
			],
			["files.stripe.com", pdf],
		]);

		const bytes = await fetchStripePdf("https://invoicedata.stripe.com/x", {
			fetch,
		});

		expect(bytes).not.toBeNull();
	});

	it("follows the indirection even on a non-OK response", async () => {
		const fetch = stubFetch([
			["start", () => json({ url: "https://files.stripe.com/a.pdf" }, 404)],
			["files.stripe.com", pdf],
		]);

		expect(await fetchStripePdf("https://start", { fetch })).not.toBeNull();
	});

	it("gives up instead of looping when a body points back at itself", async () => {
		const fetch = stubFetch([["loop", () => json({ url: "https://loop" })]]);

		expect(await fetchStripePdf("https://loop", { fetch })).toBeNull();
		expect(fetch.calls).toHaveLength(1);
	});

	it("returns null when nothing in the chain is a PDF", async () => {
		const fetch = stubFetch([
			[
				"start",
				() =>
					new Response("<html>", {
						headers: { "content-type": "text/html" },
					}),
			],
		]);

		expect(await fetchStripePdf("https://start", { fetch })).toBeNull();
	});
});
