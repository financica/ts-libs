/**
 * Parse `text` as JSON and require a plain object (not `null`, not an array).
 *
 * `what` names the value in the error message (`"${what} is not valid JSON"` /
 * `"${what} is not a JSON object"`); `makeError` builds the error to throw so
 * each call site keeps its own error class. `cause` is the `JSON.parse` error
 * when parsing failed, `undefined` when the value was simply not an object.
 */
export const parseJsonObject = (
	text: string,
	what: string,
	makeError: (message: string, cause: unknown) => Error,
): Record<string, unknown> => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		throw makeError(`${what} is not valid JSON`, cause);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw makeError(`${what} is not a JSON object`, undefined);
	}
	return parsed as Record<string, unknown>;
};
