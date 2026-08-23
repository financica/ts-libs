/** Base class for every error thrown by this package. */
export class NbbCbsoError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "NbbCbsoError";
		this.cause = options?.cause;
	}
}

/** `buildNbbFiling` rejected the input: an unknown rubric code, or two names for one figure given different values. */
export class NbbBuildError extends NbbCbsoError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "NbbBuildError";
	}
}
