import { myminfinDocumentsUrl } from "./endpoints";
import { assertOk, authorizedFetch, resolveFetch } from "./http";
import type {
	ClientConfig,
	DocumentDownloadParams,
	DocumentMetadataEntry,
	DocumentOwner,
	DocumentSearchParams,
	DocumentSearchResult,
	LocalizedString,
	MyMinFinDocument,
} from "./types";

/**
 * Client for the MyMinFin document search and download API (FineAPI v2).
 *
 * Allows searching for documents available on MyMinFin (MyDoc / MyDocPro)
 * and downloading their content. Requires a valid OAuth2 access token
 * obtained via {@link MyMinFinAuth}.
 *
 * Every request carries a fresh `Minfin-Ws-Correlation` UUID, which the API
 * requires and echoes back; it is a trace id, not the error `instance` SPF's
 * helpdesk asks for.
 */
export class MyMinFinClient {
	private readonly accessToken: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(config: ClientConfig) {
		this.accessToken = config.accessToken;
		this.baseUrl = myminfinDocumentsUrl(config.environment);
		this.fetchImpl = resolveFetch(config.fetch);
	}

	/**
	 * Search for documents available to the authenticated company.
	 *
	 * The search is limited to the last 60 days. Date format: YYYY-MM-dd.
	 * If ownerType/ownerIdentifier are omitted, returns documents for the
	 * connected entity plus any mandated entities, in one call — which matters
	 * because SPF allow one search per company every 10 minutes.
	 */
	async searchDocuments(
		params: DocumentSearchParams,
		options?: { signal?: AbortSignal },
	): Promise<DocumentSearchResult> {
		const qs = new URLSearchParams({ since: params.since });
		if (params.until) qs.set("until", params.until);
		if (params.ownerType) qs.set("ownerType", params.ownerType);
		if (params.ownerIdentifier) qs.set("ownerIdentifier", params.ownerIdentifier);

		const url = `${this.baseUrl}?${qs.toString()}`;
		const res = await this.request(url, options?.signal);

		if (res.status === 204) {
			return { documents: [], total: 0, lastSyncDate: null };
		}

		await assertOk(res);

		const json = (await res.json()) as unknown;
		return parseDocumentCollection(json);
	}

	/**
	 * Download a document's content by UUID.
	 *
	 * When downloading a document owned by another entity (via mandate),
	 * you must provide ownerType and ownerIdentifier — pass the `relatedTo`
	 * entry the search returned.
	 *
	 * Returns the raw binary content as an ArrayBuffer along with the
	 * Content-Type header. SPF serve every document as
	 * `application/octet-stream`; the real type is the search's `mimeType`.
	 */
	async downloadDocument(
		uuid: string,
		params?: DocumentDownloadParams,
		options?: { signal?: AbortSignal },
	): Promise<{ content: ArrayBuffer; contentType: string }> {
		const qs = new URLSearchParams();
		if (params?.ownerType) qs.set("ownerType", params.ownerType);
		if (params?.ownerIdentifier) qs.set("ownerIdentifier", params.ownerIdentifier);

		const query = qs.toString();
		const url = query
			? `${this.baseUrl}/${uuid}/content?${query}`
			: `${this.baseUrl}/${uuid}/content`;

		const res = await this.request(url, options?.signal);
		await assertOk(res);

		const content = await res.arrayBuffer();
		const contentType =
			res.headers.get("content-type") ?? "application/octet-stream";

		return { content, contentType };
	}

	private request(url: string, signal?: AbortSignal): Promise<Response> {
		return authorizedFetch(this.fetchImpl, url, this.accessToken, {
			signal,
			headers: { "Minfin-Ws-Correlation": crypto.randomUUID() },
		});
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

const parseLocalized = (value: unknown): LocalizedString => {
	const record = isRecord(value) ? value : {};
	// Some labels carry a leading space (" Versements anticipés - Avantages").
	const clean = (v: unknown) => str(v)?.trim() || null;
	return {
		nl: clean(record["nl"]),
		fr: clean(record["fr"]),
		de: clean(record["de"]),
		en: clean(record["en"]),
	};
};

const parseOwner = (value: unknown): DocumentOwner | null => {
	if (!isRecord(value)) return null;
	const identifier = str(value["identifier"]);
	if (!identifier) return null;
	return { type: value["type"] === "SSIN" ? "SSIN" : "CBE", identifier };
};

const parseMetadata = (value: unknown): DocumentMetadataEntry[] =>
	Array.isArray(value)
		? value.filter(isRecord).map((entry) => ({
				name: parseLocalized(entry["name"]),
				values: Array.isArray(entry["values"])
					? entry["values"].filter((v): v is string => typeof v === "string")
					: [],
			}))
		: [];

/** The first value of the metadata entry whose Dutch label matches. */
const metadataValue = (
	metadata: DocumentMetadataEntry[],
	label: string,
): string | null =>
	metadata.find((entry) => entry["name"].nl === label)?.values[0] ?? null;

/**
 * Parse one document as the search lists it. Exported for callers that keep
 * the raw JSON and rehydrate it later.
 */
export function parseMyMinFinDocument(value: unknown): MyMinFinDocument | null {
	if (!isRecord(value)) return null;
	const uuid = str(value["uuid"]);
	if (!uuid) return null;
	const metadata = parseMetadata(value["metadata"]);
	const docType = isRecord(value["docType"]) ? value["docType"] : {};
	return {
		uuid,
		contentUrl: str(value["content"]),
		docType: parseLocalized(docType["name"]),
		relatedTo: Array.isArray(value["relatedTo"])
			? value["relatedTo"]
					.map(parseOwner)
					.filter((o): o is DocumentOwner => o !== null)
			: [],
		metadata,
		modifiedOn: str(value["modifiedOn"]),
		mimeType: metadataValue(metadata, "Mimetype"),
		publishedOn: metadataValue(metadata, "Publicatiedatum"),
		externalReference: metadataValue(metadata, "Externe referentie"),
	};
}

/**
 * Parse a FineAPI `DocumentCollection`. A bare array is accepted too, which is
 * what the acceptance environment returned before the collection wrapper.
 */
export function parseDocumentCollection(json: unknown): DocumentSearchResult {
	const items = Array.isArray(json)
		? json
		: isRecord(json) && Array.isArray(json["items"])
			? json["items"]
			: [];
	const documents = items
		.map(parseMyMinFinDocument)
		.filter((d): d is MyMinFinDocument => d !== null);
	const collection = isRecord(json) ? json : {};
	return {
		documents,
		total:
			typeof collection["total"] === "number"
				? collection["total"]
				: documents.length,
		lastSyncDate: str(collection["lastSyncDate"]),
	};
}
