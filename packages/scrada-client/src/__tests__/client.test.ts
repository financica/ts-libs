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

	it("posts raw UBL with application/xml on sendOutboundDocument", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-xml" }),
		) as typeof fetch & ReturnType<typeof vi.fn>;
		const client = buildClient(fetchSpy);

		const ubl = '<?xml version="1.0"?><Invoice/>';
		const id = await client.sendOutboundDocument("co-1", ubl, {
			idempotencyKey: "ubl:1",
			routing: {
				senderScheme: "iso6523-actorid-upis",
				senderId: "0208:0800279001",
				receiverScheme: "iso6523-actorid-upis",
				receiverId: "9925:BE0206582284",
				c1CountryCode: "BE",
				documentTypeScheme: "busdox-docid-qns",
				documentTypeValue:
					"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
				processScheme: "cenbii-procid-ubl",
				processValue: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
			},
		});

		expect(id).toBe("doc-xml");
		const [url, init] = vi.mocked(fetchSpy).mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/outbound/document",
		);
		const headers = new Headers(init?.headers);
		expect(headers.get("content-type")).toBe("application/xml");
		expect(headers.get("idempotency-key")).toBe("ubl:1");
		// The raw-UBL endpoint routes purely off these headers.
		expect(headers.get("x-scrada-peppol-sender-id")).toBe("0208:0800279001");
		expect(headers.get("x-scrada-peppol-receiver-id")).toBe("9925:BE0206582284");
		expect(headers.get("x-scrada-peppol-receiver-scheme")).toBe(
			"iso6523-actorid-upis",
		);
		expect(headers.get("x-scrada-peppol-c1-country-code")).toBe("BE");
		expect(headers.get("x-scrada-peppol-process-value")).toBe(
			"urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
		);
		expect(init?.body).toBe(ubl);
	});

	it("posts JSON to selfBillingInvoice and forwards idempotency key", async () => {
		const fetchSpy = vi.fn(async () =>
			buildOkResponse({ id: "doc-sb" }),
		) as typeof fetch & ReturnType<typeof vi.fn>;
		const client = buildClient(fetchSpy);

		const id = await client.sendOutboundSelfBillingInvoice(
			"co-1",
			buildMinimalInvoice(),
			{ idempotencyKey: "sb:1" },
		);

		expect(id).toBe("doc-sb");
		const [url, init] = vi.mocked(fetchSpy).mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/outbound/selfBillingInvoice",
		);
		const headers = new Headers(init?.headers);
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("idempotency-key")).toBe("sb:1");
	});

	it("returns the UBL body as text from getOutboundDocumentUbl", async () => {
		const ubl = '<?xml version="1.0"?><Invoice/>';
		const fetchSpy = vi.fn(
			async () =>
				new Response(ubl, {
					status: 200,
					headers: { "content-type": "application/xml" },
				}),
		) as unknown as typeof fetch;
		const client = buildClient(fetchSpy);

		const result = await client.getOutboundDocumentUbl("co-1", "doc-1");
		expect(result).toBe(ubl);
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
