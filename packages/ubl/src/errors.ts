/**
 * Thrown by the parse side of this package when input is broken: malformed
 * XML, or a UBL document missing an element EN 16931 makes mandatory. A parser
 * returns `null` instead when the input is well-formed but not the document
 * type it parses.
 */
export class UblParseError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = "UblParseError";
		if (options && "cause" in options) this.cause = options.cause;
	}
}
