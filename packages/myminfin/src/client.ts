import { myminfinDocumentsUrl } from "./endpoints.js";
import type {
	ClientConfig,
	DocumentDownloadParams,
	DocumentMetadata,
	DocumentSearchParams,
	DocumentSearchResult,
	ProblemDetail,
} from "./types.js";
import { MyMinFinApiError } from "./types.js";

/**
 * Client for the MyMinFin document search and download API (FineAPI v2).
 *
 * Allows searching for documents available on MyMinFin (MyDoc / MyDocPro)
 * and downloading their content. Requires a valid OAuth2 access token
 * obtained via {@link MyMinFinAuth}.
 */
export class MyMinFinClient {
	private readonly accessToken: string;
	private readonly baseUrl: string;

	constructor(config: ClientConfig) {
		this.accessToken = config.accessToken;
		this.baseUrl = myminfinDocumentsUrl(config.environment);
	}

	/**
	 * Search for documents available to the authenticated company.
	 *
	 * The search is limited to the last 60 days. Date format: YYYY-MM-dd.
	 * If ownerType/ownerIdentifier are omitted, returns documents for the
	 * connected entity plus any mandated entities.
	 */
	async searchDocuments(params: DocumentSearchParams): Promise<DocumentSearchResult> {
		const qs = new URLSearchParams({ since: params.since });
		if (params.until) qs.set("until", params.until);
		if (params.ownerType) qs.set("ownerType", params.ownerType);
		if (params.ownerIdentifier) qs.set("ownerIdentifier", params.ownerIdentifier);

		const url = `${this.baseUrl}?${qs.toString()}`;
		const res = await this.request(url);

		if (res.status === 204) {
			return { documents: [] };
		}

		await assertOk(res);

		const json = (await res.json()) as DocumentMetadata[] | Record<string, unknown>;
		const documents = Array.isArray(json) ? json : [];

		return { documents };
	}

	/**
	 * Download a document's content by UUID.
	 *
	 * When downloading a document owned by another entity (via mandate),
	 * you must provide ownerType and ownerIdentifier.
	 *
	 * Returns the raw binary content as an ArrayBuffer along with the
	 * Content-Type header.
	 */
	async downloadDocument(
		uuid: string,
		params?: DocumentDownloadParams,
	): Promise<{ content: ArrayBuffer; contentType: string }> {
		const qs = new URLSearchParams();
		if (params?.ownerType) qs.set("ownerType", params.ownerType);
		if (params?.ownerIdentifier) qs.set("ownerIdentifier", params.ownerIdentifier);

		const query = qs.toString();
		const url = query
			? `${this.baseUrl}/${uuid}/content?${query}`
			: `${this.baseUrl}/${uuid}/content`;

		const res = await this.request(url);
		await assertOk(res);

		const content = await res.arrayBuffer();
		const contentType =
			res.headers.get("content-type") ?? "application/octet-stream";

		return { content, contentType };
	}

	private request(url: string): Promise<Response> {
		return fetch(url, {
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
			},
		});
	}
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function assertOk(res: Response): Promise<void> {
	if (res.ok) return;

	let problem: ProblemDetail | undefined;
	try {
		problem = (await res.json()) as ProblemDetail;
	} catch {
		// Response body isn't JSON — fall through
	}

	const message =
		problem?.detail ?? problem?.title ?? `HTTP ${res.status} ${res.statusText}`;
	throw new MyMinFinApiError(message, res.status, problem);
}
