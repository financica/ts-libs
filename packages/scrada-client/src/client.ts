import { DEFAULT_SCRADA_API_BASE_URL, SCRADA_LANGUAGE_HEADER } from "./constants";
import {
	ScradaApiError,
	ScradaError,
	scradaApiErrorFromResponse,
	tryParseJson,
} from "./errors";
import type {
	PeppolOnlyInvoice,
	PeppolOutboundDocumentRouting,
	ScradaInboundDocumentResponse,
	ScradaInboundUnconfirmedResponse,
	ScradaOutboundDocumentInfo,
	ScradaPeppolLookupResponse,
} from "./types";

/** Map {@link PeppolOutboundDocumentRouting} to the `x-scrada-peppol-*` headers. */
const routingHeaders = (
	routing: PeppolOutboundDocumentRouting,
): Record<string, string> => {
	const headers: Record<string, string> = {
		"x-scrada-peppol-sender-scheme": routing.senderScheme,
		"x-scrada-peppol-sender-id": routing.senderId,
		"x-scrada-peppol-receiver-scheme": routing.receiverScheme,
		"x-scrada-peppol-receiver-id": routing.receiverId,
		"x-scrada-peppol-c1-country-code": routing.c1CountryCode,
		"x-scrada-peppol-document-type-scheme": routing.documentTypeScheme,
		"x-scrada-peppol-document-type-value": routing.documentTypeValue,
		"x-scrada-peppol-process-scheme": routing.processScheme,
		"x-scrada-peppol-process-value": routing.processValue,
	};
	if (routing.externalReference) {
		headers["x-scrada-external-reference"] = routing.externalReference;
	}
	return headers;
};

type ScradaRequestMethod = "GET" | "POST" | "PUT" | "DELETE";
/**
 * How the response body of a `request()` call is decoded.
 *
 * - `json` — the body must parse as JSON (an empty body yields `null`);
 *   anything else is a {@link ScradaApiError}.
 * - `documentId` — lenient: JSON when it parses, otherwise the raw text.
 *   Reserved for the endpoints that return a freshly created document id,
 *   which Scrada has sent as `{id}`, `{documentID}`, a JSON string and a bare
 *   text id; the caller resolves it with `normalizeDocumentId`.
 * - `text` / `arrayBuffer` — returned as-is.
 */
type ScradaResponseExpectation = "json" | "documentId" | "text" | "arrayBuffer";
/** Outbound endpoint segment under `/company/{id}/peppol/outbound/`. */
type ScradaOutboundSegment = "salesInvoice" | "selfBillingInvoice" | "document";

export interface ScradaApiClientOptions {
	apiKey: string;
	password: string;
	baseUrl?: string;
	/** Override the global `fetch` (e.g. for testing). */
	fetch?: typeof fetch;
}

export interface ScradaInboundPdfResponse {
	arrayBuffer: ArrayBuffer;
	contentType: string;
	headers: Record<string, string>;
}

const joinUrl = (baseUrl: string, path: string) => {
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${normalizedBase}${normalizedPath}`;
};

const normalizeHeaders = (headers: Headers) => {
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		result[key.toLowerCase()] = value;
	});
	return result;
};

const normalizeDocumentId = (value: unknown): string => {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record["id"] === "string" && record["id"].trim().length > 0) {
			return record["id"].trim();
		}
		if (
			typeof record["documentID"] === "string" &&
			record["documentID"].trim().length > 0
		) {
			return record["documentID"].trim();
		}
	}
	throw new ScradaError("Unable to resolve document ID from Scrada response");
};

/** Wrap a raw `fetch` rejection (network failure, abort) in a {@link ScradaError}. */
const wrapFetchError = (error: unknown, url: string): ScradaError => {
	if (error instanceof ScradaError) return error;
	const reason =
		error instanceof Error && error.name === "AbortError" ? "aborted" : "failed";
	return new ScradaError(`Scrada request to ${url} ${reason}`, { cause: error });
};

/**
 * HTTP client for the Scrada Peppol API.
 *
 * https://api.scrada.be/v1
 *
 * Authenticates with API key + password sent as `X-API-KEY` / `X-PASSWORD`
 * headers. All non-2xx responses surface as `ScradaApiError`; network
 * failures and aborts are wrapped in `ScradaError`.
 */
export class ScradaApiClient {
	private readonly apiKey: string;
	private readonly password: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: ScradaApiClientOptions) {
		this.apiKey = options.apiKey;
		this.password = options.password;
		this.baseUrl = options.baseUrl ?? DEFAULT_SCRADA_API_BASE_URL;
		this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	private buildHeaders(extra?: HeadersInit): Headers {
		const headers = new Headers({
			"X-API-KEY": this.apiKey,
			"X-PASSWORD": this.password,
			Language: SCRADA_LANGUAGE_HEADER,
		});
		if (extra) {
			const extraHeaders = new Headers(extra);
			extraHeaders.forEach((value, key) => {
				headers.set(key, value);
			});
		}
		return headers;
	}

	private async request<T>(params: {
		path: string;
		method?: ScradaRequestMethod;
		body?: BodyInit;
		headers?: HeadersInit;
		expect?: ScradaResponseExpectation;
		signal?: AbortSignal | undefined;
	}): Promise<T> {
		const response = await this.send(params.path, {
			method: params.method ?? "GET",
			headers: this.buildHeaders(params.headers),
			...(params.body !== undefined ? { body: params.body } : {}),
			...(params.signal ? { signal: params.signal } : {}),
		});

		if (!response.ok) {
			throw await scradaApiErrorFromResponse(response);
		}

		const expect = params.expect ?? "json";
		if (expect === "arrayBuffer") {
			return (await response.arrayBuffer()) as T;
		}
		if (expect === "text") {
			return (await response.text()) as T;
		}

		const textBody = await response.text();
		if (!textBody) return null as T;
		const parsed = tryParseJson(textBody);
		if (parsed !== null) return parsed as T;
		if (expect === "documentId") return textBody as T;
		throw new ScradaApiError(
			`Scrada returned a non-JSON body with status ${response.status}`,
			response.status,
			textBody,
		);
	}

	/** Perform the fetch, wrapping raw rejections in {@link ScradaError}. */
	private async send(path: string, init: RequestInit): Promise<Response> {
		const url = joinUrl(this.baseUrl, path);
		try {
			return await this.fetchImpl(url, init);
		} catch (error) {
			throw wrapFetchError(error, url);
		}
	}

	// ── Peppol registration ─────────────────────────────────────────────

	/**
	 * Register a company as a Peppol participant via Scrada. Returns the
	 * registration/document ID resolved from the response.
	 *
	 * @param payload  Registration body as defined by the Scrada API schema
	 *   (`POST /company/{companyId}/peppol/register`), see https://api.scrada.be/v1.
	 */
	async registerCompany(
		companyId: string,
		payload: Readonly<Record<string, unknown>>,
		options?: { signal?: AbortSignal },
	): Promise<string> {
		const response = await this.request<unknown>({
			path: `/company/${companyId}/peppol/register`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			expect: "documentId",
			signal: options?.signal,
		});
		return normalizeDocumentId(response);
	}

	/** Remove a company's Peppol participant registration for the given identifier. */
	async deregisterCompany(
		companyId: string,
		participantIdentifierScheme: string,
		participantIdentifierValue: string,
		options?: { signal?: AbortSignal },
	): Promise<void> {
		await this.request<null>({
			path: `/company/${companyId}/peppol/deregister/${encodeURIComponent(
				participantIdentifierScheme,
			)}/${encodeURIComponent(participantIdentifierValue)}`,
			method: "DELETE",
			signal: options?.signal,
		});
	}

	// ── Inbound documents ───────────────────────────────────────────────

	/** List inbound Peppol documents that have not yet been confirmed for the company. */
	async getUnconfirmedInboundDocuments(
		companyId: string,
		options?: { signal?: AbortSignal },
	): Promise<ScradaInboundUnconfirmedResponse> {
		return this.request<ScradaInboundUnconfirmedResponse>({
			path: `/company/${companyId}/peppol/inbound/document/unconfirmed`,
			signal: options?.signal,
		});
	}

	/**
	 * Fetch the raw body of an inbound document (typically UBL XML), along
	 * with its content type and response headers.
	 */
	async getInboundDocument(
		companyId: string,
		documentId: string,
		options?: { signal?: AbortSignal },
	): Promise<ScradaInboundDocumentResponse> {
		const response = await this.send(
			`/company/${companyId}/peppol/inbound/document/${documentId}`,
			{
				method: "GET",
				headers: this.buildHeaders(),
				...(options?.signal ? { signal: options.signal } : {}),
			},
		);

		if (!response.ok) throw await scradaApiErrorFromResponse(response);

		return {
			body: await response.text(),
			contentType: response.headers.get("content-type"),
			headers: normalizeHeaders(response.headers),
		};
	}

	/** Fetch the PDF rendering of an inbound document as an ArrayBuffer. */
	async getInboundDocumentPdf(
		companyId: string,
		documentId: string,
		options?: { signal?: AbortSignal },
	): Promise<ScradaInboundPdfResponse> {
		const response = await this.send(
			`/company/${companyId}/peppol/inbound/document/${documentId}/pdf`,
			{
				method: "GET",
				headers: this.buildHeaders(),
				...(options?.signal ? { signal: options.signal } : {}),
			},
		);
		if (!response.ok) throw await scradaApiErrorFromResponse(response);

		return {
			arrayBuffer: await response.arrayBuffer(),
			contentType: response.headers.get("content-type") ?? "application/pdf",
			headers: normalizeHeaders(response.headers),
		};
	}

	/** Mark an inbound document as confirmed (received/processed) so it drops out of the unconfirmed list. */
	async confirmInboundDocument(
		companyId: string,
		documentId: string,
		options?: { signal?: AbortSignal },
	): Promise<void> {
		await this.request<null>({
			path: `/company/${companyId}/peppol/inbound/document/${documentId}/confirm`,
			method: "PUT",
			signal: options?.signal,
		});
	}

	// ── Outbound documents ──────────────────────────────────────────────

	private async postOutbound(params: {
		companyId: string;
		segment: ScradaOutboundSegment;
		body: BodyInit;
		contentType: "application/json" | "application/xml";
		idempotencyKey?: string | undefined;
		extraHeaders?: Record<string, string>;
		signal?: AbortSignal | undefined;
	}): Promise<string> {
		const headers: Record<string, string> = {
			"Content-Type": params.contentType,
			...params.extraHeaders,
		};
		if (params.idempotencyKey) {
			headers["Idempotency-Key"] = params.idempotencyKey;
		}
		const response = await this.request<unknown>({
			path: `/company/${params.companyId}/peppol/outbound/${params.segment}`,
			method: "POST",
			headers,
			body: params.body,
			expect: "documentId",
			signal: params.signal,
		});
		return normalizeDocumentId(response);
	}

	/**
	 * @param options.idempotencyKey  Sent as `Idempotency-Key`. A transient
	 *   network-error retry with the same key is collapsed by Scrada, so the
	 *   recipient's Peppol endpoint won't receive the same invoice twice. The
	 *   caller should pass a deterministic key (typically the invoice ID).
	 */
	async sendOutboundSalesInvoice(
		companyId: string,
		payload: PeppolOnlyInvoice,
		options?: { idempotencyKey?: string; signal?: AbortSignal },
	): Promise<string> {
		return this.postOutbound({
			companyId,
			segment: "salesInvoice",
			body: JSON.stringify(payload),
			contentType: "application/json",
			idempotencyKey: options?.idempotencyKey,
			signal: options?.signal,
		});
	}

	/**
	 * Send a self-billing invoice or credit note (buyer issues the document
	 * on behalf of the supplier). Same payload shape as a sales invoice.
	 *
	 * @param options.idempotencyKey  See `sendOutboundSalesInvoice`.
	 */
	async sendOutboundSelfBillingInvoice(
		companyId: string,
		payload: PeppolOnlyInvoice,
		options?: { idempotencyKey?: string; signal?: AbortSignal },
	): Promise<string> {
		return this.postOutbound({
			companyId,
			segment: "selfBillingInvoice",
			body: JSON.stringify(payload),
			contentType: "application/json",
			idempotencyKey: options?.idempotencyKey,
			signal: options?.signal,
		});
	}

	/**
	 * Deliver a pre-built UBL document directly to Peppol. Use this when you
	 * already have a UBL XML string (BIS3 invoice, credit note, self-billing,
	 * Invoice Response, etc.); for JSON payloads use `sendOutboundSalesInvoice`
	 * or `sendOutboundSelfBillingInvoice` instead.
	 *
	 * The endpoint does not parse the UBL for routing, so `options.routing`
	 * (sender, receiver, document type and process) is required and sent as
	 * `x-scrada-peppol-*` headers — without it Scrada rejects the request with
	 * "Http header 'x-scrada-peppol-sender-scheme' is missing".
	 *
	 * @param options.idempotencyKey  See `sendOutboundSalesInvoice`.
	 */
	async sendOutboundDocument(
		companyId: string,
		ubl: string,
		options: {
			routing: PeppolOutboundDocumentRouting;
			idempotencyKey?: string;
			signal?: AbortSignal;
		},
	): Promise<string> {
		return this.postOutbound({
			companyId,
			segment: "document",
			body: ubl,
			contentType: "application/xml",
			idempotencyKey: options.idempotencyKey,
			extraHeaders: routingHeaders(options.routing),
			signal: options.signal,
		});
	}

	/** Fetch delivery status and metadata for an outbound document. */
	async getOutboundDocumentInfo(
		companyId: string,
		documentId: string,
		options?: { signal?: AbortSignal },
	): Promise<ScradaOutboundDocumentInfo> {
		return this.request<ScradaOutboundDocumentInfo>({
			path: `/company/${companyId}/peppol/outbound/document/${documentId}/info`,
			signal: options?.signal,
		});
	}

	/**
	 * Fetch the rendered UBL XML for an outbound document — useful when the
	 * document was sent as JSON and Scrada generated the UBL.
	 */
	async getOutboundDocumentUbl(
		companyId: string,
		documentId: string,
		options?: { signal?: AbortSignal },
	): Promise<string> {
		return this.request<string>({
			path: `/company/${companyId}/peppol/outbound/document/${documentId}/ubl`,
			expect: "text",
			signal: options?.signal,
		});
	}

	// ── Peppol participant lookup ───────────────────────────────────────

	/** Look up a Peppol participant by identifier scheme and value. */
	async lookupPeppolParticipant(
		companyId: string,
		scheme: string,
		id: string,
		options?: { signal?: AbortSignal },
	): Promise<ScradaPeppolLookupResponse> {
		return this.request<ScradaPeppolLookupResponse>({
			path: `/company/${companyId}/peppol/lookup/${encodeURIComponent(
				scheme,
			)}/${encodeURIComponent(id)}`,
			signal: options?.signal,
		});
	}

	/**
	 * Look up a Peppol participant from party details (name, address, VAT number…).
	 *
	 * @param payload  Lookup body as defined by the Scrada API schema
	 *   (`POST /company/{companyId}/peppol/lookup`), see https://api.scrada.be/v1.
	 */
	async lookupPeppolParty(
		companyId: string,
		payload: Readonly<Record<string, unknown>>,
		options?: { signal?: AbortSignal },
	): Promise<ScradaPeppolLookupResponse> {
		return this.request<ScradaPeppolLookupResponse>({
			path: `/company/${companyId}/peppol/lookup`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: options?.signal,
		});
	}
}

/**
 * Create a Scrada API client from the canonical environment variables.
 * Throws when SCRADA_API_KEY or SCRADA_PASSWORD is missing.
 */
export const createScradaApiClientFromEnv = (
	env: NodeJS.ProcessEnv = process.env,
): ScradaApiClient => {
	const apiKey = env["SCRADA_API_KEY"];
	const password = env["SCRADA_PASSWORD"];
	if (!apiKey || !password) {
		throw new Error(
			"Scrada credentials are not configured. Set SCRADA_API_KEY and SCRADA_PASSWORD.",
		);
	}

	return new ScradaApiClient({
		apiKey,
		password,
		...(env["SCRADA_API_BASE_URL"] ? { baseUrl: env["SCRADA_API_BASE_URL"] } : {}),
	});
};
