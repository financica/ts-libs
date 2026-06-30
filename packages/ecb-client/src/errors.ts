import type { CurrencyCode, IsoDate } from "./types.js";

/** Base class for every error thrown by this package. */
export class EcbError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "EcbError";
	}
}

/** The ECB data API returned a non-2xx response. */
export class EcbHttpError extends EcbError {
	readonly status: number;
	readonly body: string;

	constructor(status: number, body: string) {
		super(`ECB data API returned HTTP ${status}`);
		this.name = "EcbHttpError";
		this.status = status;
		this.body = body;
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
