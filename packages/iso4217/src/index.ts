/**
 * Public entry point for @financica/iso4217.
 *
 * All lookups are O(1) via precomputed `Map`s built once at module load. The
 * underlying data is `Object.freeze`d, and every exported array is declared
 * `readonly`, so consumers cannot accidentally mutate package state.
 */

import { ALPHABETIC_CODES, COUNTRY_CODES, NUMERIC_CODES } from "./codes.js";
import { CURRENCIES } from "./data.js";
import type { AlphabeticCode, CountryCode, Currency, NumericCode } from "./types.js";

// ── Indexes ──────────────────────────────────────────────────────────────────

const BY_ALPHABETIC = new Map<AlphabeticCode, Currency>();
const BY_NUMERIC = new Map<NumericCode, Currency>();
const BY_COUNTRY = new Map<CountryCode, Currency[]>();

for (const currency of CURRENCIES) {
	BY_ALPHABETIC.set(currency.alphabeticCode, currency);
	BY_NUMERIC.set(currency.numericCode, currency);
	for (const code of currency.countryCodes) {
		const bucket = BY_COUNTRY.get(code);
		if (bucket) bucket.push(currency);
		else BY_COUNTRY.set(code, [currency]);
	}
}

// Freeze per-country buckets so callers can't mutate package state via the
// arrays returned from `getByCountry`.
for (const [key, bucket] of BY_COUNTRY) {
	BY_COUNTRY.set(key, Object.freeze(bucket) as Currency[]);
}

const EMPTY_CURRENCIES: readonly Currency[] = Object.freeze([]);

// ── Type guards ──────────────────────────────────────────────────────────────

const ALPHABETIC_SET: ReadonlySet<string> = new Set(ALPHABETIC_CODES);
const NUMERIC_SET: ReadonlySet<string> = new Set(NUMERIC_CODES);
const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

/**
 * Narrow an arbitrary string to a known ISO 4217 alphabetic code.
 *
 * Matching is **case-sensitive** — the canonical form is uppercase. Use
 * {@link getByCode} if you want case-insensitive lookup.
 */
export function isAlphabeticCode(value: string): value is AlphabeticCode {
	return ALPHABETIC_SET.has(value);
}

/**
 * Narrow an arbitrary string to a known ISO 4217 numeric code.
 *
 * The canonical form is a zero-padded three-character string.
 */
export function isNumericCode(value: string): value is NumericCode {
	return NUMERIC_SET.has(value);
}

/**
 * Narrow an arbitrary string to a known ISO 3166-1 alpha-2 country code
 * that appears on at least one currency in this dataset.
 */
export function isCountryCode(value: string): value is CountryCode {
	return COUNTRY_SET.has(value);
}

// ── Normalisers ──────────────────────────────────────────────────────────────

/**
 * Normalise user input to the canonical alphabetic-code form (uppercase,
 * trimmed). Returns `undefined` for any string that isn't exactly 3 letters
 * after normalisation.
 */
function normalizeAlphabetic(input: string): string | undefined {
	const trimmed = input.trim();
	if (trimmed.length !== 3) return undefined;
	const upper = trimmed.toUpperCase();
	return /^[A-Z]{3}$/.test(upper) ? upper : undefined;
}

/**
 * Normalise user input to the canonical numeric-code form (zero-padded
 * three-character string). Accepts numbers and numeric strings; returns
 * `undefined` if the value isn't a non-negative integer ≤ 999.
 */
function normalizeNumeric(input: string | number): string | undefined {
	if (typeof input === "number") {
		if (!Number.isInteger(input) || input < 0 || input > 999) return undefined;
		return input.toString().padStart(3, "0");
	}
	const trimmed = input.trim();
	if (!/^\d{1,3}$/.test(trimmed)) return undefined;
	return trimmed.padStart(3, "0");
}

// ── Public lookups ───────────────────────────────────────────────────────────

/**
 * Look up a currency by its ISO 4217 alphabetic code.
 *
 * Accepts any case and trims whitespace. Returns `undefined` if the code
 * doesn't correspond to an active ISO 4217 entry.
 *
 * @example
 *   getByCode("USD");  // → { alphabeticCode: "USD", ... }
 *   getByCode("usd");  // → { alphabeticCode: "USD", ... }
 *   getByCode("XYZ");  // → undefined
 */
export function getByCode(code: string): Currency | undefined {
	const normalized = normalizeAlphabetic(code);
	if (normalized === undefined) return undefined;
	return BY_ALPHABETIC.get(normalized as AlphabeticCode);
}

/**
 * Look up a currency by its ISO 4217 numeric code.
 *
 * Accepts both strings and numbers; the leading-zero variants of short
 * codes (`8`, `"8"`, `"008"`, `"08"`) all resolve identically.
 *
 * @example
 *   getByNumericCode("840");  // → USD
 *   getByNumericCode(840);    // → USD
 *   getByNumericCode("8");    // → Albanian Lek (numeric 008)
 */
export function getByNumericCode(code: string | number): Currency | undefined {
	const normalized = normalizeNumeric(code);
	if (normalized === undefined) return undefined;
	return BY_NUMERIC.get(normalized as NumericCode);
}

/**
 * Look up every currency associated with a given ISO 3166-1 alpha-2 country
 * code. Matching is case-insensitive; the returned array is frozen.
 *
 * The array is non-empty in the order the currencies were emitted
 * (alphabetic-code ascending). Returns an empty array for unknown codes.
 *
 * @example
 *   getByCountry("US");  // → [USD, USN]
 *   getByCountry("CH");  // → [CHE, CHF, CHW]
 */
export function getByCountry(countryCode: string): readonly Currency[] {
	const trimmed = countryCode.trim();
	if (trimmed.length !== 2) return EMPTY_CURRENCIES;
	const upper = trimmed.toUpperCase();
	return BY_COUNTRY.get(upper as CountryCode) ?? EMPTY_CURRENCIES;
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a numeric amount as a currency string using the ISO 4217 minor-unit
 * precision for the given currency. Thin wrapper around `Intl.NumberFormat`
 * that guarantees the correct number of fractional digits — you don't need
 * to remember that JOD has 3 digits, JPY has 0, and XAU has no precision.
 *
 * For metals and other `minorUnits === null` codes this falls back to
 * locale-default precision.
 *
 * @param amount   The value to format.
 * @param code     ISO 4217 alphabetic code of the currency.
 * @param options  Forwarded to `Intl.NumberFormat` (locale, style etc.).
 *                 Passing `style` overrides the default `"currency"` style.
 */
export function formatAmount(
	amount: number,
	code: AlphabeticCode,
	options: { locale?: string | string[] } & Omit<
		Intl.NumberFormatOptions,
		"currency"
	> = {},
): string {
	const currency = BY_ALPHABETIC.get(code);
	if (currency === undefined) {
		throw new Error(`Unknown ISO 4217 code: ${code}`);
	}
	const { locale, ...rest } = options;
	const format: Intl.NumberFormatOptions = {
		style: "currency",
		currency: code,
		...rest,
	};
	if (currency.minorUnits !== null && rest.minimumFractionDigits === undefined) {
		format.minimumFractionDigits = currency.minorUnits;
	}
	if (currency.minorUnits !== null && rest.maximumFractionDigits === undefined) {
		format.maximumFractionDigits = currency.minorUnits;
	}
	return new Intl.NumberFormat(locale, format).format(amount);
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { CURRENCIES, PUBLISHED_AT } from "./data.js";
export { ALPHABETIC_CODES, COUNTRY_CODES, NUMERIC_CODES } from "./codes.js";
export type {
	AlphabeticCode,
	CountryCode,
	Currency,
	CurrencyKind,
	HistoricCurrency,
	NumericCode,
} from "./types.js";
