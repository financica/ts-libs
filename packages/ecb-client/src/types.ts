import type { EcbCurrency } from "./currencies.js";

/** An ISO 8601 calendar date, formatted `YYYY-MM-DD`. */
export type IsoDate = string;

/**
 * A currency code. ECB reference currencies are strongly typed for
 * autocomplete; any other ISO 4217 code is still accepted. The `string & {}`
 * member preserves literal autocomplete while widening to accept any string.
 */
export type CurrencyCode = EcbCurrency | "EUR" | (string & {});

/** A single euro reference-rate observation. */
export interface ReferenceRate {
	/** ISO 4217 code of the quoted currency. */
	currency: CurrencyCode;
	/** Units of {@link currency} per 1 EUR. */
	rate: number;
	/**
	 * The date the observation actually applies to. Equal to the requested date
	 * on a TARGET business day, or the most recent prior business day when the
	 * requested date had no published rate (weekend, holiday).
	 */
	date: IsoDate;
}

/** A set of reference rates resolved for a single requested date. */
export interface RateSnapshot {
	/** The date that was requested, normalized to `YYYY-MM-DD`. */
	requestedDate: IsoDate;
	/**
	 * One entry per currency. Each entry's effective {@link ReferenceRate.date}
	 * may differ — discontinued series resolve to their last published date.
	 */
	rates: ReferenceRate[];
}

/** Every published observation over a date range. */
export interface RateSeries {
	/** Start of the requested window, inclusive, normalized to `YYYY-MM-DD`. */
	from: IsoDate;
	/** End of the requested window, inclusive, normalized to `YYYY-MM-DD`. */
	to: IsoDate;
	/**
	 * Every observation the ECB published inside the window, oldest first and
	 * then by currency. Non-business days are simply absent — unlike
	 * {@link RateSnapshot}, a series never substitutes a prior day's rate, so
	 * callers can see the real publication calendar and fill gaps themselves.
	 */
	rates: ReferenceRate[];
}

/** The outcome of converting an amount between two currencies. */
export interface ConvertResult {
	/** The converted amount, expressed in {@link to}. Not rounded. */
	amount: number;
	/** The effective {@link from} → {@link to} rate applied. */
	rate: number;
	/** Source currency. */
	from: CurrencyCode;
	/** Target currency. */
	to: CurrencyCode;
	/** The requested date, normalized to `YYYY-MM-DD`. */
	requestedDate: IsoDate;
	/** The effective observation date of the rate(s) applied. */
	rateDate: IsoDate;
}
