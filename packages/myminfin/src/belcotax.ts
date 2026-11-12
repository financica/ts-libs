import { assertOk, authorizedFetch, resolveFetch, wrapFetchError } from "./http";
import type { ClientConfig, ProblemDetail } from "./types";
import { MyMinFinApiError, MyMinFinError } from "./types";

export interface BelcotaxClientConfig extends ClientConfig {
	/**
	 * The bulks API root, up to and including `/bulks/v1` (the paths below it
	 * are `/bulks/submit`, `/bulks/{id}/validations/last`, `/health`).
	 *
	 * Required because SPF have not published it: the OpenAPI's server URL
	 * (`https://server.minfin.be/external/api/bulks/v1`) is a placeholder they
	 * replace before production. Confirm it with the helpdesk when the scope is
	 * granted, then default it per environment here.
	 */
	baseUrl: string;
}

/** What a submission answers: the bulk's id and how many lines SPF counted. */
export interface BelcotaxSubmission {
	id: string;
	count: number;
}

export type BelcotaxValidationStatus = "accepted" | "rejected" | "inProgress";

export interface BelcotaxLink {
	rel: string;
	href: string;
	disabled?: boolean | undefined;
}

export interface BelcotaxValidation {
	id: string;
	requestDateTime: string;
	status: BelcotaxValidationStatus;
	links: BelcotaxLink[];
}

/** One field an issue concerns, as a JSON pointer into the line (`/$/2076`). */
export interface BelcotaxIssueInput {
	in?: string | undefined;
	name: string;
}

/**
 * One problem SPF found in a bulk. `line` is 1-based into the JSONL; `key` is
 * the fiche or resource key when the issue is a business rule about one.
 * `inputs` gathers the fields concerned: SPF send a format issue's field as
 * `in`/`name` and a business rule's as an `inputs` array, both land here.
 */
export interface BelcotaxIssue {
	type: string;
	title?: string | undefined;
	detail?: string | undefined;
	line?: number | undefined;
	column?: number | undefined;
	key?: string | undefined;
	value?: unknown;
	inputs: BelcotaxIssueInput[];
}

export interface BelcotaxFeedback {
	type: string;
	title?: string | undefined;
	status?: number | undefined;
	detail?: string | undefined;
	issues: BelcotaxIssue[];
}

export interface BelcotaxHealth {
	/** `UP`, `DEGRADED`, `DOWN`, or a custom value. */
	status: string;
}

/**
 * Thrown when SPF refuse a submitted bulk with feedback (HTTP 400,
 * `urn:problem-type:belcotax:feedback` or any problem carrying `issues`).
 */
export class BelcotaxFeedbackError extends MyMinFinApiError {
	readonly feedback: BelcotaxFeedback;

	constructor(feedback: BelcotaxFeedback, status: number) {
		super(
			feedback.detail ?? feedback.title ?? `HTTP ${status}`,
			status,
			problemOf(feedback, status),
		);
		this.name = "BelcotaxFeedbackError";
		this.feedback = feedback;
	}

	get issues(): BelcotaxIssue[] {
		return this.feedback.issues;
	}
}

/**
 * Client for the Belcotax-on-web 2.0 bulks API (`bulks-api-external` 1.1.1):
 * submit a JSONL bulk of 281.xx fiches (see `serializeBelcotaxBulk`), then
 * poll its validation, which runs asynchronously. Requires an access token
 * with the Belcotax scope, obtained through {@link MyMinFinAuth}.
 *
 * Every request carries a fresh `Minfin-Ws-Correlation` UUID, as the other
 * SPF APIs require.
 */
export class BelcotaxClient {
	private readonly accessToken: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: typeof fetch;

	constructor(config: BelcotaxClientConfig) {
		this.accessToken = config.accessToken;
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.fetchImpl = resolveFetch(config.fetch);
	}

	/**
	 * Submit a bulk. Answers once SPF accepted the upload; whether its fiches
	 * are valid is {@link getLastValidation}. A bulk SPF refuse outright throws
	 * {@link BelcotaxFeedbackError} with the issues.
	 */
	async submitBulk(
		content: string | Uint8Array,
		options?: { fileName?: string; signal?: AbortSignal },
	): Promise<BelcotaxSubmission> {
		const body = new FormData();
		const bytes = typeof content === "string" ? content : new Uint8Array(content);
		body.set(
			"content",
			new Blob([bytes], { type: "application/jsonl" }),
			options?.fileName ?? "bulk.jsonl",
		);

		const res = await this.request(`${this.baseUrl}/bulks/submit`, {
			method: "POST",
			body,
			signal: options?.signal,
		});
		await assertOkOrFeedback(res);
		return parseSubmission(await readJson(res));
	}

	/** The latest validation of a bulk: `inProgress` until SPF have checked it. */
	async getLastValidation(
		bulkId: string,
		options?: { signal?: AbortSignal },
	): Promise<BelcotaxValidation> {
		const res = await this.request(`${this.bulkUrl(bulkId)}/validations/last`, {
			signal: options?.signal,
		});
		await assertOk(res);
		return parseValidation(await readJson(res));
	}

	/** The issues found by the latest validation of a bulk. */
	async getLastValidationFeedback(
		bulkId: string,
		options?: { signal?: AbortSignal },
	): Promise<BelcotaxFeedback> {
		const res = await this.request(
			`${this.bulkUrl(bulkId)}/validations/last/feedback`,
			{ signal: options?.signal },
		);
		await assertOk(res);
		const feedback = parseFeedback(await readJson(res));
		if (!feedback)
			throw new MyMinFinError(
				"Belcotax feedback response is not a problem document",
			);
		return feedback;
	}

	/** Unauthenticated health probe. A 503 is reported as `DOWN`, not thrown. */
	async checkHealth(options?: { signal?: AbortSignal }): Promise<BelcotaxHealth> {
		const url = `${this.baseUrl}/health`;
		let res: Response;
		try {
			res = await this.fetchImpl(url, {
				headers: { Accept: "application/json" },
				...(options?.signal ? { signal: options.signal } : {}),
			});
		} catch (error) {
			throw wrapFetchError(error, url);
		}
		if (res.status !== 503) await assertOk(res);
		const body = await readJson(res);
		if (!isRecord(body) || typeof body["status"] !== "string") {
			throw new MyMinFinError("Belcotax health response has no status");
		}
		return { status: body["status"] };
	}

	private bulkUrl(bulkId: string): string {
		return `${this.baseUrl}/bulks/${encodeURIComponent(bulkId)}`;
	}

	private request(
		url: string,
		init: { method?: string; body?: BodyInit; signal?: AbortSignal | undefined },
	): Promise<Response> {
		return authorizedFetch(this.fetchImpl, url, this.accessToken, {
			...init,
			headers: {
				Accept: "application/json",
				"Minfin-Ws-Correlation": crypto.randomUUID(),
			},
		});
	}
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const VALIDATION_STATUSES: readonly BelcotaxValidationStatus[] = [
	"accepted",
	"rejected",
	"inProgress",
];

const isValidationStatus = (value: unknown): value is BelcotaxValidationStatus =>
	VALIDATION_STATUSES.some((status) => status === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const optString = (value: unknown): string | undefined =>
	typeof value === "string" ? value : undefined;

const optInt = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isInteger(value) ? value : undefined;

async function readJson(res: Response): Promise<unknown> {
	try {
		return (await res.json()) as unknown;
	} catch (error) {
		throw new MyMinFinError("Belcotax response is not JSON", { cause: error });
	}
}

/** A 400 carrying `issues` is bulk feedback; anything else goes the shared way. */
async function assertOkOrFeedback(res: Response): Promise<void> {
	if (res.status !== 400) return assertOk(res);
	let body: unknown;
	try {
		body = (await res.clone().json()) as unknown;
	} catch {
		return assertOk(res);
	}
	const feedback =
		isRecord(body) && Array.isArray(body["issues"]) ? parseFeedback(body) : null;
	if (feedback) throw new BelcotaxFeedbackError(feedback, res.status);
	return assertOk(res);
}

function parseSubmission(body: unknown): BelcotaxSubmission {
	const id = isRecord(body) ? optString(body["id"]) : undefined;
	const count = isRecord(body) ? optInt(body["count"]) : undefined;
	if (id === undefined || count === undefined) {
		throw new MyMinFinError("Belcotax submission response has no id and count");
	}
	return { id, count };
}

function parseValidation(body: unknown): BelcotaxValidation {
	if (!isRecord(body))
		throw new MyMinFinError("Belcotax validation response is not an object");
	const { id, requestDateTime, status } = body;
	if (typeof id !== "string" || typeof requestDateTime !== "string") {
		throw new MyMinFinError(
			"Belcotax validation response has no id or requestDateTime",
		);
	}
	if (!isValidationStatus(status)) {
		throw new MyMinFinError(
			`Belcotax validation status ${JSON.stringify(status)} is not one this client knows`,
		);
	}
	const links = Array.isArray(body["links"])
		? body["links"].filter(isRecord).flatMap((link): BelcotaxLink[] => {
				const rel = optString(link["rel"]);
				const href = optString(link["href"]);
				if (!rel || !href) return [];
				return typeof link["disabled"] === "boolean"
					? [{ rel, href, disabled: link["disabled"] }]
					: [{ rel, href }];
			})
		: [];
	return {
		id,
		requestDateTime,
		status,
		links,
	};
}

function parseFeedback(body: unknown): BelcotaxFeedback | null {
	if (!isRecord(body)) return null;
	const type = optString(body["type"]) ?? "about:blank";
	const issues = Array.isArray(body["issues"])
		? body["issues"].filter(isRecord).map(parseIssue)
		: [];
	return compact({
		type,
		title: optString(body["title"]),
		status: optInt(body["status"]),
		detail: optString(body["detail"]),
		issues,
	});
}

function parseIssue(raw: Record<string, unknown>): BelcotaxIssue {
	const inputs: BelcotaxIssueInput[] = [];
	const single = optString(raw["name"]);
	if (single) inputs.push(compact({ in: optString(raw["in"]), name: single }));
	if (Array.isArray(raw["inputs"])) {
		for (const input of raw["inputs"].filter(isRecord)) {
			const name = optString(input["name"]);
			if (name) inputs.push(compact({ in: optString(input["in"]), name }));
		}
	}
	return compact({
		type: optString(raw["type"]) ?? "about:blank",
		title: optString(raw["title"]),
		detail: optString(raw["detail"]),
		line: optInt(raw["line"]),
		column: optInt(raw["column"]),
		key: optString(raw["key"]),
		value: raw["value"],
		inputs,
	});
}

/** Drop undefined fields: an absent value is an absent key. */
function compact<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, v]) => v !== undefined),
	) as T;
}

function problemOf(feedback: BelcotaxFeedback, status: number): ProblemDetail {
	return compact({
		type: feedback.type,
		title: feedback.title ?? "Bulk feedback",
		status: feedback.status ?? status,
		detail: feedback.detail ?? "",
	});
}
