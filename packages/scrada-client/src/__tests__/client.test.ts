import { describe, expect, it, vi } from "vitest";
import { ScradaApiClient } from "../client";
import { ScradaApiError } from "../errors";
import type { PeppolOnlyInvoice } from "../types";

const buildOkResponse = (body: unknown, init: ResponseInit = {}) =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});

const buildClient = (mockFetch: typeof fetch) =>
	new ScradaApiClient({
		apiKey: "key-123",
		password: "pw-456",
		baseUrl: "https://api.scrada.example/v1",
		fetch: mockFetch,
	});

describe("ScradaApiClient", () => {
	it("sends X-API-KEY, X-PASSWORD and Language headers on every request", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-1" }),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		await client.registerCompany("co-1", { example: true });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const call = vi.mocked(fetchSpy).mock.calls[0];
		expect(call).toBeDefined();
		const init = call?.[1];
		const headers = new Headers(init?.headers);
		expect(headers.get("x-api-key")).toBe("key-123");
		expect(headers.get("x-password")).toBe("pw-456");
		expect(headers.get("language")).toBe("EN");
		expect(headers.get("content-type")).toBe("application/json");
	});

	it("normalizes the base URL when joining paths", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-1" }),
		) as typeof fetch & ReturnType<typeof vi.fn>;
		const client = new ScradaApiClient({
			apiKey: "k",
			password: "p",
			baseUrl: "https://api.scrada.example/v1/",
			fetch: fetchSpy,
		});

		await client.getUnconfirmedInboundDocuments("co-1");

		expect(vi.mocked(fetchSpy).mock.calls[0]?.[0]).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/inbound/document/unconfirmed",
		);
	});

	it("forwards idempotencyKey as the Idempotency-Key header on send", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-1" }),
		) as typeof fetch & ReturnType<typeof vi.fn>;
		const client = buildClient(fetchSpy);

		await client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice(), {
			idempotencyKey: "invoice:in_123",
		});

		const init = vi.mocked(fetchSpy).mock.calls[0]?.[1];
		const headers = new Headers(init?.headers);
		expect(headers.get("idempotency-key")).toBe("invoice:in_123");
	});

	it("omits the Idempotency-Key header when no key is provided", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-1" }),
		) as typeof fetch & ReturnType<typeof vi.fn>;
		const client = buildClient(fetchSpy);

		await client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice());

		const init = vi.mocked(fetchSpy).mock.calls[0]?.[1];
		const headers = new Headers(init?.headers);
		expect(headers.has("idempotency-key")).toBe(false);
	});

	it("returns the document ID when sendOutboundSalesInvoice succeeds", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-abc" }),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		const payload: PeppolOnlyInvoice = {
			number: "INV-1",
			invoiceDate: "2026-05-01",
			supplier: { name: "Acme", address: makeEmptyAddress() },
			customer: { name: "Buyer", address: makeEmptyAddress() },
			totalExclVat: 100,
			totalInclVat: 121,
			totalVat: 21,
			lines: [],
			vatTotals: [],
		};

		const id = await client.sendOutboundSalesInvoice("co-1", payload);

		expect(id).toBe("doc-abc");
	});

	it("accepts a bare-string document ID response", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse('"705c1e19-18a7-40c6-86ae-c0e4f4bea7e8"'),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		const id = await client.registerCompany("co-1", {});
		expect(id).toBe("705c1e19-18a7-40c6-86ae-c0e4f4bea7e8");
	});

	it("throws ScradaApiError with the parsed message on non-2xx responses", async () => {
		const errorBody = {
			defaultFormat: "50,4 VAT difference left for 0% VAT",
		};
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify(errorBody), {
					status: 500,
					headers: { "content-type": "application/json" },
				}),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		await expect(
			client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice()),
		).rejects.toMatchObject({
			name: "ScradaApiError",
			status: 500,
			message: "50,4 VAT difference left for 0% VAT",
		});
	});

	it("surfaces 404 from getInboundDocument as ScradaApiError", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response("", {
					status: 404,
				}),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		await expect(
			client.getInboundDocument("co-1", "missing"),
		).rejects.toBeInstanceOf(ScradaApiError);
	});

	it("URL-encodes scheme and id in deregister/lookup paths", async () => {
		const fetchSpy = vi.fn(async () => buildOkResponse({})) as typeof fetch &
			ReturnType<typeof vi.fn>;
		const client = buildClient(fetchSpy);

		await client.deregisterCompany(
			"co-1",
			"iso6523-actorid-upis",
			"0208:0793904121",
		);
		await client.lookupPeppolParticipant("co-1", "0208", "0793904121");

		const calls = vi.mocked(fetchSpy).mock.calls.map((c) => c[0]);
		expect(calls[0]).toContain(
			"/peppol/deregister/iso6523-actorid-upis/0208%3A0793904121",
		);
		expect(calls[1]).toContain("/peppol/lookup/0208/0793904121");
	});
});

const makeEmptyAddress = () => ({
	street: null,
	streetNumber: null,
	streetBox: null,
	city: null,
	zipCode: null,
	countrySubentity: null,
	countryCode: null,
});

const buildMinimalInvoice = (): PeppolOnlyInvoice => ({
	number: "INV-1",
	invoiceDate: "2026-05-01",
	supplier: { name: "Acme", address: makeEmptyAddress() },
	customer: { name: "Buyer", address: makeEmptyAddress() },
	totalExclVat: 100,
	totalInclVat: 121,
	totalVat: 21,
	lines: [],
	vatTotals: [],
});
