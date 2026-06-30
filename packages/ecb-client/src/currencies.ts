/**
 * The currencies for which the European Central Bank publishes daily euro
 * foreign-exchange reference rates, as of the ECB's current daily reference
 * list. Every rate is quoted as units of the currency per 1 EUR.
 *
 * The ECB occasionally adds or suspends currencies. This list is a convenience
 * for callers and the source of the {@link EcbCurrency} literal union; the
 * client never restricts lookups to it, so any ISO 4217 code the ECB exposes
 * (including discontinued series) can still be requested.
 */
export const ECB_CURRENCIES = [
	"AUD",
	"BGN",
	"BRL",
	"CAD",
	"CHF",
	"CNY",
	"CZK",
	"DKK",
	"GBP",
	"HKD",
	"HUF",
	"IDR",
	"ILS",
	"INR",
	"ISK",
	"JPY",
	"KRW",
	"MXN",
	"MYR",
	"NOK",
	"NZD",
	"PHP",
	"PLN",
	"RON",
	"SEK",
	"SGD",
	"THB",
	"TRY",
	"USD",
	"ZAR",
] as const;

/** A currency on the ECB's daily reference list. */
export type EcbCurrency = (typeof ECB_CURRENCIES)[number];

/** The base currency of every ECB reference rate. */
export const BASE_CURRENCY = "EUR";

const ECB_CURRENCY_SET: ReadonlySet<string> = new Set(ECB_CURRENCIES);

/** Narrowing guard: is `code` on the ECB daily reference list? */
export const isEcbCurrency = (code: string): code is EcbCurrency =>
	ECB_CURRENCY_SET.has(code);
