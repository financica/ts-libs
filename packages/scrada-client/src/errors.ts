/**
 * Error thrown for every non-2xx response from the Scrada API. `status` is
 * the HTTP status code; `details` is the parsed response body (JSON when
 * parseable, otherwise the raw text).
 */
export class ScradaApiError extends Error {
	readonly status: number;
	readonly details: unknown;

	constructor(message: string, status: number, details: unknown) {
		super(message);
		this.name = "ScradaApiError";
		this.status = status;
		this.details = details;
	}
}

/** Parse `value` as JSON, returning `null` when it is not valid JSON. */
export const tryParseJson = (value: string): unknown => {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
};

/** Maximum nesting depth walked when collecting detail messages. */
const MAX_DETAIL_DEPTH = 4;
/** Maximum number of messages joined into the error summary. */
const MAX_DETAIL_MESSAGES = 6;

const normalizeDetailMessage = (value: string) => value.trim().replace(/\s+/g, " ");

const collectDetailMessages = (value: unknown, collector: Set<string>, depth = 0) => {
	if (depth > MAX_DETAIL_DEPTH || value === null || value === undefined) return;

	if (typeof value === "string") {
		const normalized = normalizeDetailMessage(value);
		if (normalized.length > 0) collector.add(normalized);
		return;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			collectDetailMessages(entry, collector, depth + 1);
		}
		return;
	}

	if (typeof value !== "object") return;
	const record = value as Record<string, unknown>;

	const preferredFields = [
		"defaultFormat",
		"message",
		"error",
		"title",
		"detail",
		"description",
		"reason",
	];

	for (const field of preferredFields) {
		const fieldValue = record[field];
		if (typeof fieldValue === "string") {
			const normalized = normalizeDetailMessage(fieldValue);
			if (normalized.length > 0) collector.add(normalized);
		}
	}

	const nestedFields = ["details", "errors", "validationErrors", "modelState"];
	for (const field of nestedFields) {
		if (field in record) {
			collectDetailMessages(record[field], collector, depth + 1);
		}
	}

	for (const [key, fieldValue] of Object.entries(record)) {
		if (preferredFields.includes(key) || nestedFields.includes(key)) continue;
		if (typeof fieldValue === "string") {
			const normalized = normalizeDetailMessage(fieldValue);
			if (normalized.length > 0 && /error|invalid|missing|required/i.test(key)) {
				collector.add(normalized);
			}
			continue;
		}
		if (
			Array.isArray(fieldValue) ||
			(fieldValue && typeof fieldValue === "object")
		) {
			collectDetailMessages(fieldValue, collector, depth + 1);
		}
	}
};

/**
 * Walks a Scrada error response body and pulls out the human-readable
 * message strings. Returns `null` when nothing usable is found.
 *
 * Scrada returns errors in several shapes (string, `{message}`,
 * `{errors: [{detail}]}`, `{modelState: {...}}`, etc.); this collapses
 * them into a single ` | `-separated summary.
 */
export const summarizeScradaErrorDetails = (details: unknown): string | null => {
	const collector = new Set<string>();
	collectDetailMessages(details, collector);
	if (collector.size === 0) return null;
	return Array.from(collector).slice(0, MAX_DETAIL_MESSAGES).join(" | ");
};

const coerceErrorMessage = (details: unknown, fallback: string) =>
	summarizeScradaErrorDetails(details) ?? fallback;

/**
 * Converts a non-2xx Scrada response into a ScradaApiError, parsing the body
 * as JSON when possible and extracting message strings via
 * {@link summarizeScradaErrorDetails}.
 */
export const scradaApiErrorFromResponse = async (
	response: Response,
): Promise<ScradaApiError> => {
	const textBody = await response.text();
	const parsed = tryParseJson(textBody) ?? textBody;
	return new ScradaApiError(
		coerceErrorMessage(
			parsed,
			`Scrada request failed with status ${response.status}`,
		),
		response.status,
		parsed,
	);
};
