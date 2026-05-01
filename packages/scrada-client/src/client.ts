import { DEFAULT_SCRADA_API_BASE_URL, SCRADA_LANGUAGE_HEADER } from "./constants";
import { scradaApiErrorFromResponse } from "./errors";
import type {
	PeppolOnlyInvoice,
	ScradaInboundDocumentResponse,
	ScradaInboundUnconfirmedResponse,
	ScradaOutboundDocumentInfo,
	ScradaPeppolLookupResponse,
} from "./types";

type ScradaRequestMethod = "GET" | "POST" | "PUT" | "DELETE";

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
		if (typeof record.id === "string" && record.id.trim().length > 0) {
			return record.id.trim();
		}
		if (
			typeof record.documentID === "string" &&
			record.documentID.trim().length > 0
		) {
			return record.documentID.trim();
		}
	}
	throw new Error("Unable to resolve document ID from Scrada response");
};

const tryParseJson = (value: string): unknown => {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
};

/**
 * HTTP client for the Scrada Peppol API.
 *
 * https://api.scrada.be/v1
 *
 * Authenticates with API key + password sent as `X-API-KEY` / `X-PASSWORD`
 * headers. All non-2xx responses surface as `ScradaApiError`.
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
		expect?: "json" | "text" | "arrayBuffer";
	}): Promise<T> {
		const response = await this.fetchImpl(joinUrl(this.baseUrl, params.path), {
			method: params.method ?? "GET",
			headers: this.buildHeaders(params.headers),
			body: params.body,
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
		return textBody as T;
	}

	// ── Peppol registration ─────────────────────────────────────────────

	async registerCompany(
		companyId: string,
		payload: Record<string, unknown>,
	): Promise<string> {
		const response = await this.request<unknown>({
			path: `/company/${companyId}/peppol/register`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		return normalizeDocumentId(response);
	}

	async deregisterCompany(
		companyId: string,
		participantIdentifierScheme: string,
		participantIdentifierValue: string,
	): Promise<void> {
		await this.request<null>({
			path: `/company/${companyId}/peppol/deregister/${encodeURIComponent(
				participantIdentifierScheme,
			)}/${encodeURIComponent(participantIdentifierValue)}`,
			method: "DELETE",
		});
	}

	// ── Inbound documents ───────────────────────────────────────────────

	async getUnconfirmedInboundDocuments(
		companyId: string,
	): Promise<ScradaInboundUnconfirmedResponse> {
		return this.request<ScradaInboundUnconfirmedResponse>({
			path: `/company/${companyId}/peppol/inbound/document/unconfirmed`,
		});
	}

	async getInboundDocument(
		companyId: string,
		documentId: string,
	): Promise<ScradaInboundDocumentResponse> {
		const response = await this.fetchImpl(
			joinUrl(
				this.baseUrl,
				`/company/${companyId}/peppol/inbound/document/${documentId}`,
			),
			{
				method: "GET",
				headers: this.buildHeaders(),
			},
		);

		if (!response.ok) throw await scradaApiErrorFromResponse(response);

		return {
			body: await response.text(),
			contentType: response.headers.get("content-type"),
			headers: normalizeHeaders(response.headers),
		};
	}

	async getInboundDocumentPdf(
		companyId: string,
		documentId: string,
	): Promise<ScradaInboundPdfResponse> {
		const response = await this.fetchImpl(
			joinUrl(
				this.baseUrl,
				`/company/${companyId}/peppol/inbound/document/${documentId}/pdf`,
			),
			{
				method: "GET",
				headers: this.buildHeaders(),
			},
		);
		if (!response.ok) throw await scradaApiErrorFromResponse(response);

		return {
			arrayBuffer: await response.arrayBuffer(),
			contentType: response.headers.get("content-type") ?? "application/pdf",
			headers: normalizeHeaders(response.headers),
		};
	}

	async confirmInboundDocument(companyId: string, documentId: string): Promise<void> {
		await this.request<null>({
			path: `/company/${companyId}/peppol/inbound/document/${documentId}/confirm`,
			method: "PUT",
		});
	}

	// ── Outbound documents ──────────────────────────────────────────────

	/**
	 * @param options.idempotencyKey  Sent as `Idempotency-Key`. A transient
	 *   network-error retry with the same key is collapsed by Scrada, so the
	 *   recipient's Peppol endpoint won't receive the same invoice twice. The
	 *   caller should pass a deterministic key (typically the invoice ID).
	 */
	async sendOutboundSalesInvoice(
		companyId: string,
		payload: PeppolOnlyInvoice,
		options?: { idempotencyKey?: string },
	): Promise<string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (options?.idempotencyKey) {
			headers["Idempotency-Key"] = options.idempotencyKey;
		}
		const response = await this.request<unknown>({
			path: `/company/${companyId}/peppol/outbound/salesInvoice`,
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});
		return normalizeDocumentId(response);
	}

	async getOutboundDocumentInfo(
		companyId: string,
		documentId: string,
	): Promise<ScradaOutboundDocumentInfo> {
		return this.request<ScradaOutboundDocumentInfo>({
			path: `/company/${companyId}/peppol/outbound/document/${documentId}/info`,
		});
	}

	// ── Peppol participant lookup ───────────────────────────────────────

	async lookupPeppolParticipant(
		companyId: string,
		scheme: string,
		id: string,
	): Promise<ScradaPeppolLookupResponse> {
		return this.request<ScradaPeppolLookupResponse>({
			path: `/company/${companyId}/peppol/lookup/${encodeURIComponent(
				scheme,
			)}/${encodeURIComponent(id)}`,
		});
	}

	async lookupPeppolParty(
		companyId: string,
		payload: Record<string, unknown>,
	): Promise<ScradaPeppolLookupResponse> {
		return this.request<ScradaPeppolLookupResponse>({
			path: `/company/${companyId}/peppol/lookup`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
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
	const apiKey = env.SCRADA_API_KEY;
	const password = env.SCRADA_PASSWORD;
	if (!apiKey || !password) {
		throw new Error(
			"Scrada credentials are not configured. Set SCRADA_API_KEY and SCRADA_PASSWORD.",
		);
	}

	return new ScradaApiClient({
		apiKey,
		password,
		baseUrl: env.SCRADA_API_BASE_URL,
	});
};
