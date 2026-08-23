import { describe, expect, it, vi } from "vitest";
import { createScradaApiClientFromEnv, ScradaApiClient } from "../client";
import { ScradaApiError, ScradaError } from "../errors";
import type { PeppolOnlyInvoice, PeppolOutboundDocumentRouting } from "../types";

const buildOkResponse = (body: unknown, init: ResponseInit = {}) =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});

type FetchSpy = typeof fetch & ReturnType<typeof vi.fn>;

const fetchReturning = (response: () => Response) =>
	vi.fn(async () => response()) as FetchSpy;

const buildClient = (mockFetch: typeof fetch) =>
	new ScradaApiClient({
		apiKey: "key-123",
		password: "pw-456",
		baseUrl: "https://api.scrada.example/v1",
		fetch: mockFetch,
	});

const lastCall = (fetchSpy: FetchSpy) => {
	const call = vi.mocked(fetchSpy).mock.calls.at(-1) as
		| [string, RequestInit]
		| undefined;
	return {
		url: call?.[0],
		init: call?.[1],
		headers: new Headers(call?.[1]?.headers),
	};
};

// Peppol BIS Billing 3.0 routing (document type / process ids from the
// Peppol BIS Billing 3.0 spec; sender/receiver are Belgian KBO / VAT ids).
const routing: PeppolOutboundDocumentRouting = {
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
};

describe("ScradaApiClient", () => {
	it("wraps a fetch rejection in ScradaError with the cause attached", async () => {
		const failure = new TypeError("fetch failed");
		const fetchSpy = vi.fn(async () => {
			throw failure;
		}) as FetchSpy;
		const client = buildClient(fetchSpy);

		const error = await client
			.getUnconfirmedInboundDocuments("co-1")
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ScradaError);
		expect(error).not.toBeInstanceOf(ScradaApiError);
		expect((error as ScradaError).name).toBe("ScradaError");
		expect((error as ScradaError).cause).toBe(failure);
	});

	it("wraps an abort in ScradaError and forwards the signal to fetch", async () => {
		const controller = new AbortController();
		const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
			init?.signal?.throwIfAborted();
			return buildOkResponse({});
		}) as unknown as FetchSpy;
		const client = buildClient(fetchSpy);
		controller.abort();

		const error = await client
			.getUnconfirmedInboundDocuments("co-1", { signal: controller.signal })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ScradaError);
		expect((error as ScradaError).message).toContain("aborted");
		expect(lastCall(fetchSpy).init?.signal).toBe(controller.signal);
	});

	it("throws ScradaApiError when a JSON endpoint answers with a non-JSON body", async () => {
		const fetchSpy = fetchReturning(() =>
			buildOkResponse("<html>maintenance</html>", {
				headers: { "content-type": "text/html" },
			}),
		);
		const client = buildClient(fetchSpy);

		const error = await client
			.getUnconfirmedInboundDocuments("co-1")
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ScradaApiError);
		expect((error as ScradaApiError).status).toBe(200);
		expect((error as ScradaApiError).details).toBe("<html>maintenance</html>");
	});

	it("still accepts a bare text document id from the outbound endpoints", async () => {
		const fetchSpy = fetchReturning(() =>
			buildOkResponse("doc-plain", { headers: { "content-type": "text/plain" } }),
		);
		const client = buildClient(fetchSpy);

		await expect(
			client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice()),
		).resolves.toBe("doc-plain");
	});

	it("sends X-API-KEY, X-PASSWORD and Language headers on every request", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-1" }));
		const client = buildClient(fetchSpy);

		await client.registerCompany("co-1", { example: true });

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const { headers } = lastCall(fetchSpy);
		expect(headers.get("x-api-key")).toBe("key-123");
		expect(headers.get("x-password")).toBe("pw-456");
		expect(headers.get("language")).toBe("EN");
		expect(headers.get("content-type")).toBe("application/json");
	});

	it("normalizes the base URL when joining paths", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-1" }));
		const client = new ScradaApiClient({
			apiKey: "k",
			password: "p",
			baseUrl: "https://api.scrada.example/v1/",
			fetch: fetchSpy,
		});

		await client.getUnconfirmedInboundDocuments("co-1");

		expect(lastCall(fetchSpy).url).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/inbound/document/unconfirmed",
		);
	});

	it("forwards idempotencyKey as the Idempotency-Key header on send", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-1" }));
		const client = buildClient(fetchSpy);

		await client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice(), {
			idempotencyKey: "invoice:in_123",
		});

		expect(lastCall(fetchSpy).headers.get("idempotency-key")).toBe(
			"invoice:in_123",
		);
	});

	it("omits the Idempotency-Key header when no key is provided", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-1" }));
		const client = buildClient(fetchSpy);

		await client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice());

		expect(lastCall(fetchSpy).headers.has("idempotency-key")).toBe(false);
	});

	// Scrada has returned the outbound document id in each of these shapes.
	it.each([
		["{id}", { id: "doc-abc" }, "doc-abc"],
		["{documentID}", { documentID: "doc-def" }, "doc-def"],
		[
			"bare JSON string",
			'"705c1e19-18a7-40c6-86ae-c0e4f4bea7e8"',
			"705c1e19-18a7-40c6-86ae-c0e4f4bea7e8",
		],
		["padded id", { id: "  doc-pad  " }, "doc-pad"],
	])(
		"resolves the document ID from a %s response",
		async (_label, body, expected) => {
			const fetchSpy = fetchReturning(() => buildOkResponse(body));
			const client = buildClient(fetchSpy);

			await expect(
				client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice()),
			).resolves.toBe(expected);
		},
	);

	it.each([
		["empty object", "{}"],
		["empty string", '""'],
		["empty 200 body", ""],
	])(
		"throws when the 200 response (%s) carries no document ID",
		async (_label, body) => {
			const fetchSpy = fetchReturning(() => buildOkResponse(body));
			const client = buildClient(fetchSpy);

			await expect(
				client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice()),
			).rejects.toThrow("Unable to resolve document ID");
		},
	);

	it("resolves an empty 200 body to null on JSON endpoints", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse(""));
		const client = buildClient(fetchSpy);

		await expect(client.getUnconfirmedInboundDocuments("co-1")).resolves.toBeNull();
	});

	// Message extraction from the body is covered in errors.test.ts; here only
	// the client-level contract: non-2xx surfaces as ScradaApiError with the status.
	it("throws ScradaApiError carrying the HTTP status on non-2xx responses", async () => {
		const fetchSpy = fetchReturning(
			() => new Response(JSON.stringify({ message: "nope" }), { status: 500 }),
		);
		const client = buildClient(fetchSpy);

		await expect(
			client.sendOutboundSalesInvoice("co-1", buildMinimalInvoice()),
		).rejects.toMatchObject({ name: "ScradaApiError", status: 500 });
	});

	it("surfaces 404 from getInboundDocument as ScradaApiError", async () => {
		const fetchSpy = fetchReturning(() => new Response("", { status: 404 }));
		const client = buildClient(fetchSpy);

		await expect(
			client.getInboundDocument("co-1", "missing"),
		).rejects.toBeInstanceOf(ScradaApiError);
	});

	it("returns body, content type and lower-cased headers from getInboundDocument", async () => {
		const ubl = '<?xml version="1.0"?><Invoice/>';
		const fetchSpy = fetchReturning(
			() =>
				new Response(ubl, {
					status: 200,
					headers: {
						"Content-Type": "application/xml",
						"X-Scrada-Document-Id": "doc-9",
					},
				}),
		);
		const client = buildClient(fetchSpy);

		const result = await client.getInboundDocument("co-1", "doc-9");

		expect(result.body).toBe(ubl);
		expect(result.contentType).toBe("application/xml");
		expect(result.headers["x-scrada-document-id"]).toBe("doc-9");
		expect(Object.keys(result.headers).every((k) => k === k.toLowerCase())).toBe(
			true,
		);
	});

	it("defaults the PDF content type to application/pdf when the server omits it", async () => {
		const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
		const fetchSpy = fetchReturning(
			() => new Response(bytes, { status: 200, headers: { "X-Custom": "y" } }),
		);
		const client = buildClient(fetchSpy);

		const result = await client.getInboundDocumentPdf("co-1", "doc-9");

		expect(new Uint8Array(result.arrayBuffer)).toEqual(bytes);
		expect(result.contentType).toBe("application/pdf");
		expect(result.headers["x-custom"]).toBe("y");
	});

	it("posts raw UBL with application/xml and the full routing header set on sendOutboundDocument", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-xml" }));
		const client = buildClient(fetchSpy);

		const ubl = '<?xml version="1.0"?><Invoice/>';
		const id = await client.sendOutboundDocument("co-1", ubl, {
			idempotencyKey: "ubl:1",
			routing,
		});

		expect(id).toBe("doc-xml");
		const { url, init, headers } = lastCall(fetchSpy);
		expect(url).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/outbound/document",
		);
		expect(init?.method).toBe("POST");
		expect(headers.get("content-type")).toBe("application/xml");
		expect(headers.get("idempotency-key")).toBe("ubl:1");
		// The raw-UBL endpoint routes purely off these headers.
		expect(Object.fromEntries(headers.entries())).toMatchObject({
			"x-scrada-peppol-sender-scheme": routing.senderScheme,
			"x-scrada-peppol-sender-id": routing.senderId,
			"x-scrada-peppol-receiver-scheme": routing.receiverScheme,
			"x-scrada-peppol-receiver-id": routing.receiverId,
			"x-scrada-peppol-c1-country-code": routing.c1CountryCode,
			"x-scrada-peppol-document-type-scheme": routing.documentTypeScheme,
			"x-scrada-peppol-document-type-value": routing.documentTypeValue,
			"x-scrada-peppol-process-scheme": routing.processScheme,
			"x-scrada-peppol-process-value": routing.processValue,
		});
		expect(headers.has("x-scrada-external-reference")).toBe(false);
		expect(init?.body).toBe(ubl);
	});

	it("sends x-scrada-external-reference only when an externalReference is supplied", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-xml" }));
		const client = buildClient(fetchSpy);

		await client.sendOutboundDocument("co-1", "<Invoice/>", {
			routing: { ...routing, externalReference: "INV-2026-001" },
		});

		expect(lastCall(fetchSpy).headers.get("x-scrada-external-reference")).toBe(
			"INV-2026-001",
		);
	});

	it("posts JSON to selfBillingInvoice and forwards idempotency key", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({ id: "doc-sb" }));
		const client = buildClient(fetchSpy);

		const id = await client.sendOutboundSelfBillingInvoice(
			"co-1",
			buildMinimalInvoice(),
			{ idempotencyKey: "sb:1" },
		);

		expect(id).toBe("doc-sb");
		const { url, init, headers } = lastCall(fetchSpy);
		expect(url).toBe(
			"https://api.scrada.example/v1/company/co-1/peppol/outbound/selfBillingInvoice",
		);
		expect(init?.method).toBe("POST");
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("idempotency-key")).toBe("sb:1");
	});

	it("returns the UBL body as text from getOutboundDocumentUbl", async () => {
		const ubl = '<?xml version="1.0"?><Invoice/>';
		const fetchSpy = fetchReturning(
			() =>
				new Response(ubl, {
					status: 200,
					headers: { "content-type": "application/xml" },
				}),
		);
		const client = buildClient(fetchSpy);

		const result = await client.getOutboundDocumentUbl("co-1", "doc-1");
		expect(result).toBe(ubl);
	});

	it("URL-encodes scheme and id in deregister/lookup paths", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({}));
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

	it.each([
		[
			"deregisterCompany",
			"DELETE",
			(c: ScradaApiClient) => c.deregisterCompany("co-1", "s", "v"),
		],
		[
			"confirmInboundDocument",
			"PUT",
			(c: ScradaApiClient) => c.confirmInboundDocument("co-1", "doc-1"),
		],
		[
			"lookupPeppolParty",
			"POST",
			(c: ScradaApiClient) =>
				c.lookupPeppolParty("co-1", { vat: "BE0206582284" }),
		],
		[
			"lookupPeppolParticipant",
			"GET",
			(c: ScradaApiClient) => c.lookupPeppolParticipant("co-1", "s", "v"),
		],
	])("%s uses HTTP %s", async (_name, method, call) => {
		const fetchSpy = fetchReturning(() => buildOkResponse({}));
		const client = buildClient(fetchSpy);

		await call(client);

		expect(lastCall(fetchSpy).init?.method).toBe(method);
	});
});

describe("createScradaApiClientFromEnv", () => {
	it.each([
		["SCRADA_API_KEY", { SCRADA_PASSWORD: "p" }],
		["SCRADA_PASSWORD", { SCRADA_API_KEY: "k" }],
	])("throws when %s is missing", (_name, env) => {
		expect(() => createScradaApiClientFromEnv(env)).toThrow(
			/SCRADA_API_KEY and SCRADA_PASSWORD/,
		);
	});

	it("uses SCRADA_API_BASE_URL and the credentials from env", async () => {
		const fetchSpy = fetchReturning(() => buildOkResponse({}));
		// The client binds globalThis.fetch at construction, so stub before building.
		vi.stubGlobal("fetch", fetchSpy);
		try {
			const client = createScradaApiClientFromEnv({
				SCRADA_API_KEY: "env-key",
				SCRADA_PASSWORD: "env-pw",
				SCRADA_API_BASE_URL: "https://sandbox.scrada.example/v1",
			});
			await client.getUnconfirmedInboundDocuments("co-1");
		} finally {
			vi.unstubAllGlobals();
		}

		const { url, headers } = lastCall(fetchSpy);
		expect(url).toBe(
			"https://sandbox.scrada.example/v1/company/co-1/peppol/inbound/document/unconfirmed",
		);
		expect(headers.get("x-api-key")).toBe("env-key");
		expect(headers.get("x-password")).toBe("env-pw");
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
