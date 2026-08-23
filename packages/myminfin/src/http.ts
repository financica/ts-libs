import type { ProblemDetail } from "./types";
import { MyMinFinApiError, MyMinFinError } from "./types";

interface AuthorizedRequestInit {
	method?: string;
	body?: BodyInit;
	headers?: Record<string, string>;
	signal?: AbortSignal | undefined;
}

/** Resolve the `fetch` to use from a config, defaulting to the global one. */
export function resolveFetch(override: typeof fetch | undefined): typeof fetch {
	return override ?? globalThis.fetch.bind(globalThis);
}

/** Wrap a raw `fetch` rejection (network failure, abort) in a {@link MyMinFinError}. */
export function wrapFetchError(error: unknown, url: string): MyMinFinError {
	if (error instanceof MyMinFinError) return error;
	const reason =
		error instanceof Error && error.name === "AbortError" ? "aborted" : "failed";
	return new MyMinFinError(`MyMinFin request to ${url} ${reason}`, { cause: error });
}

/**
 * Perform a fetch with a Bearer access token attached to the request.
 * Any headers in `init` are preserved; Authorization is added on top.
 * Raw `fetch` rejections are wrapped in {@link MyMinFinError}.
 */
export async function authorizedFetch(
	fetchImpl: typeof fetch,
	url: string,
	accessToken: string,
	init: AuthorizedRequestInit = {},
): Promise<Response> {
	const { signal, ...rest } = init;
	try {
		return await fetchImpl(url, {
			...rest,
			...(signal ? { signal } : {}),
			headers: {
				...init.headers,
				Authorization: `Bearer ${accessToken}`,
			},
		});
	} catch (error) {
		throw wrapFetchError(error, url);
	}
}

/**
 * Throw a {@link MyMinFinApiError} if the response is not OK, extracting an
 * RFC 7807 problem detail from the body when one is present. Business
 * validation errors (which extend ProblemDetail with `businessrules`) are
 * carried through intact on the thrown error's `problem` field.
 */
export async function assertOk(
	res: Response,
	options?: {
		/** Derive the message from the parsed JSON body (when there is one). */
		message?: (body: Record<string, unknown> | undefined) => string | undefined;
	},
): Promise<void> {
	if (res.ok) return;

	let body: Record<string, unknown> | undefined;
	try {
		const parsed = (await res.json()) as unknown;
		if (parsed && typeof parsed === "object") {
			body = parsed as Record<string, unknown>;
		}
	} catch {
		// Response body isn't JSON — fall through to a status-based message.
	}

	const problem = body as ProblemDetail | undefined;
	const message =
		options?.message?.(body) ??
		problem?.detail ??
		problem?.title ??
		`HTTP ${res.status} ${res.statusText}`;
	throw new MyMinFinApiError(message, res.status, problem);
}
