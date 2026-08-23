import type { CurrencyCode, IsoDate } from "./types.js";

/**
 * Base class for every error thrown by this package. Network failures,
 * timeouts and aborts are wrapped in an `EcbError` with `cause` set to the
 * original rejection.
 */
export class EcbError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "EcbError";
		this.cause = options?.cause;
	}
}

/** The ECB data API returned a non-2xx response. */
export class EcbHttpError extends EcbError {
	readonly status: number;
	/** The raw response body. */
	readonly body: string;
	/** The raw response body; same value as `body`. */
	readonly details: string;

	constructor(status: number, body: string) {
		super(`ECB data API returned HTTP ${status}`);
		this.name = "EcbHttpError";
		this.status = status;
		this.body = body;
		this.details = body;
	}
}

/** No reference rate exists for the currency on or before the requested date. */
export class NoRateError extends EcbError {
	readonly currency: CurrencyCode;
	readonly date: IsoDate;

	constructor(currency: CurrencyCode, date: IsoDate) {
		super(`No ECB reference rate for ${currency} on or before ${date}`);
		this.name = "NoRateError";
		this.currency = currency;
		this.date = date;
	}
}
