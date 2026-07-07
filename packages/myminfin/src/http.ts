import type { ProblemDetail } from "./types";
import { MyMinFinApiError } from "./types";

interface AuthorizedRequestInit {
	method?: string;
	body?: BodyInit;
	headers?: Record<string, string>;
}

/**
 * Perform a fetch with a Bearer access token attached to the request.
 * Any headers in `init` are preserved; Authorization is added on top.
 */
export function authorizedFetch(
	url: string,
	accessToken: string,
	init: AuthorizedRequestInit = {},
): Promise<Response> {
	return fetch(url, {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${accessToken}`,
		},
	});
}

/**
 * Throw a {@link MyMinFinApiError} if the response is not OK, extracting an
 * RFC 7807 problem detail from the body when one is present. Business
 * validation errors (which extend ProblemDetail with `businessrules`) are
 * carried through intact on the thrown error's `problem` field.
 */
export async function assertOk(res: Response): Promise<void> {
	if (res.ok) return;

	let problem: ProblemDetail | undefined;
	try {
		problem = (await res.json()) as ProblemDetail;
	} catch {
		// Response body isn't JSON — fall through to a status-based message.
	}

	const message =
		problem?.detail ?? problem?.title ?? `HTTP ${res.status} ${res.statusText}`;
	throw new MyMinFinApiError(message, res.status, problem);
}
