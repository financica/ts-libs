/** Base class for every error thrown by this package. */
export class BiztaxError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "BiztaxError";
		this.cause = options?.cause;
	}
}

/**
 * `buildBiztaxReturn` rejected the input: a concept the entry point does not
 * declare, dimensions the concept cannot carry, a value its datatype has no
 * lexical form for, or one fact given twice.
 */
export class BiztaxBuildError extends BiztaxError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "BiztaxBuildError";
	}
}

/** `wrapBiztax` was handed something that is not one XBRL instance per entry, or too many of them. */
export class BiztaxEnvelopeError extends BiztaxError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "BiztaxEnvelopeError";
	}
}
