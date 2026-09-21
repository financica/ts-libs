import { BiztaxEnvelopeError } from "./errors.js";

/** Biztax takes at most this many returns in one upload. */
export const MAX_RETURNS_PER_FILE = 25;

const XML_DECLARATION = /^﻿?\s*<\?xml[^?]*\?>\s*/;
const ROOT = /^<(?:[\w.-]+:)?xbrl[\s>]/;

/**
 * Wrap rendered returns in the `.biztax` file that "Opladen aangiften" takes.
 *
 * The file is a `<biztax>` element holding one `<xbrl>` instance per return,
 * each complete with its own namespace declarations, so the instances go in
 * as they are, less their XML declaration.
 *
 * @throws {BiztaxEnvelopeError} on no returns, more than 25, or an entry that
 *   is not a single XBRL instance.
 */
export function wrapBiztax(instances: readonly string[]): string {
	if (instances.length === 0) {
		throw new BiztaxEnvelopeError("a .biztax file holds at least one return");
	}
	if (instances.length > MAX_RETURNS_PER_FILE) {
		throw new BiztaxEnvelopeError(
			`a .biztax file holds at most ${MAX_RETURNS_PER_FILE} returns, got ${instances.length}`,
		);
	}
	const bodies = instances.map((instance, index) => {
		const body = instance.replace(XML_DECLARATION, "").trim();
		if (!ROOT.test(body)) {
			throw new BiztaxEnvelopeError(
				`return ${index + 1} is not an XBRL instance`,
			);
		}
		return body;
	});
	return `<?xml version="1.0" encoding="utf-8"?>\n<biztax>\n${bodies.join("\n")}\n</biztax>\n`;
}

/**
 * A name Biztax accepts for the upload: unaccented letters, digits, spaces
 * and `. - _` only. Anything else is dropped, accents folded first.
 */
export function biztaxFileName(stem: string): string {
	const safe = stem
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^A-Za-z0-9 ._-]/g, "")
		.trim();
	return `${safe || "return"}.biztax`;
}
