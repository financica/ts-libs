/** Base class for every error thrown by this package. */
export class NbbCbsoError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "NbbCbsoError";
		this.cause = options?.cause;
	}
}

/** The CBSO web services returned a non-2xx response the client does not map to a result. */
export class NbbCbsoApiError extends NbbCbsoError {
	readonly status: number;
	/** The raw response body. */
	readonly details: string;

	constructor(status: number, details: string, path: string) {
		super(`CBSO web services returned HTTP ${status} for ${path}`);
		this.name = "NbbCbsoApiError";
		this.status = status;
		this.details = details;
	}
}

/** `buildNbbFiling` rejected the input: an unknown rubric code, or two names for one figure given different values. */
export class NbbBuildError extends NbbCbsoError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "NbbBuildError";
	}
}
