/**
 * Public entry point for @financica/ecb-client.
 *
 * A small, dependency-free client for the European Central Bank's euro
 * foreign-exchange reference rates (data API dataflow `EXR`), with first-class
 * support for historical single-day lookups and last-business-day fallback.
 */

export { EcbClient } from "./client.js";
export type { EcbClientOptions, FetchLike, RateCache } from "./client.js";
export { BASE_CURRENCY, ECB_CURRENCIES, isEcbCurrency } from "./currencies.js";
export type { EcbCurrency } from "./currencies.js";
export { EcbError, EcbHttpError, NoRateError } from "./errors.js";
export { parseCsv } from "./csv.js";
export type {
	ConvertResult,
	CurrencyCode,
	IsoDate,
	RateSnapshot,
	ReferenceRate,
} from "./types.js";
