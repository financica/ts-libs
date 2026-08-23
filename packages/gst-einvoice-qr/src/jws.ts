import { GstQrParseError } from "./errors.js";
import { parseJsonObject } from "./json.js";

/** Decode a base64url segment to bytes. Throws on anything malformed. */
export const decodeBase64Url = (segment: string, what: string): Uint8Array => {
	if (!/^[A-Za-z0-9_-]*$/.test(segment)) {
		throw new GstQrParseError(`${what} is not valid base64url`);
	}
	const padded = segment.padEnd(
		segment.length + ((4 - (segment.length % 4)) % 4),
		"=",
	);
	try {
		return new Uint8Array(Buffer.from(padded, "base64url"));
	} catch (cause) {
		throw new GstQrParseError(`${what} is not valid base64url`, { cause });
	}
};

/** Encode bytes as base64url, unpadded. */
export const encodeBase64Url = (bytes: Uint8Array): string =>
	Buffer.from(bytes).toString("base64url");

const decodeJsonSegment = (segment: string, what: string): Record<string, unknown> => {
	const text = Buffer.from(decodeBase64Url(segment, what)).toString("utf8");
	return parseJsonObject(text, what, (message, cause) =>
		cause === undefined
			? new GstQrParseError(message)
			: new GstQrParseError(message, { cause }),
	);
};

export interface CompactJws {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
	/** `<header>.<payload>` — the ASCII bytes the signature is computed over. */
	signingInput: string;
	signature: Uint8Array;
}

/**
 * Split and decode a compact JWS (`header.payload.signature`).
 *
 * Deliberately not `jsonwebtoken`/`jose`: this is one hundred lines of parsing
 * we need to own anyway (the IRP payload is not a standard-claims JWT), and it
 * keeps the package dependency-free.
 */
export const decodeCompactJws = (token: string): CompactJws => {
	const trimmed = token.trim();
	const parts = trimmed.split(".");
	if (parts.length !== 3) {
		throw new GstQrParseError(
			`Expected a compact JWS with 3 dot-separated parts, got ${parts.length}`,
		);
	}

	const [headerSegment = "", payloadSegment = "", signatureSegment = ""] = parts;
	if (signatureSegment.length === 0) {
		throw new GstQrParseError("Compact JWS has an empty signature");
	}

	return {
		header: decodeJsonSegment(headerSegment, "JWS header"),
		payload: decodeJsonSegment(payloadSegment, "JWS payload"),
		signingInput: `${headerSegment}.${payloadSegment}`,
		signature: decodeBase64Url(signatureSegment, "JWS signature"),
	};
};
