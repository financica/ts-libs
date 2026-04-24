/**
 * Public type definitions for ISO 4217.
 *
 * The canonical spec uses "Entity" for the issuing country/territory/organisation
 * and "Alphabetic Code" / "Numeric Code" for the two code forms. We preserve
 * those names to keep the API unambiguous.
 *
 * Country associations are represented as ISO 3166-1 alpha-2 codes rather
 * than localised country names. Consumers who need display names can pair
 * this package with any ISO 3166 library.
 *
 * @see https://www.iso.org/iso-4217-currency-codes.html
 * @see https://www.six-group.com/en/products-services/financial-information/data-standards.html
 */

import type { ALPHABETIC_CODES, COUNTRY_CODES, NUMERIC_CODES } from "./codes.js";

/**
 * Three-letter uppercase ISO 4217 alphabetic currency code, e.g. `"USD"`.
 *
 * Derived from the official SIX Group list-one.xml.
 */
export type AlphabeticCode = (typeof ALPHABETIC_CODES)[number];

/**
 * Three-digit zero-padded ISO 4217 numeric currency code, e.g. `"840"`.
 *
 * Always a string (never a number) so the leading zero is preserved and the
 * value is safe to use as an object key or JSON value.
 */
export type NumericCode = (typeof NUMERIC_CODES)[number];

/**
 * ISO 3166-1 alpha-2 country code that appears on at least one currency in
 * this dataset. Includes `"EU"` (European Union, exceptionally reserved)
 * but no withdrawn codes.
 */
export type CountryCode = (typeof COUNTRY_CODES)[number];

/**
 * High-level classification of an ISO 4217 entry. Useful for filtering —
 * e.g. excluding metals from a user-facing currency selector.
 *
 * - `"fiat"`     — sovereign or supranational currency used as legal tender
 *                  (USD, EUR, GBP, XAF, XOF, XCD, XCG, XPF, ...).
 * - `"fund"`     — fund / inflation-indexed unit that is *not* general tender
 *                  (CHE, CHW, BOV, CLF, COU, MXV, USN, UYI, UYW).
 * - `"metal"`    — precious metal commodity code (XAU, XAG, XPT, XPD).
 * - `"special"`  — reserved codes: bond market units (XBA–XBD), IMF SDR (XDR),
 *                  ADB unit (XUA), Sucre (XSU), Arab Accounting Dinar (XAD),
 *                  testing code (XTS), no-currency sentinel (XXX).
 */
export type CurrencyKind = "fiat" | "fund" | "metal" | "special";

/**
 * A single ISO 4217 currency record as found in list-one.xml.
 *
 * Every field is immutable. Arrays are `readonly` so downstream consumers
 * cannot accidentally mutate the package's internal state.
 */
export interface Currency {
	/** Three-letter uppercase alphabetic code. */
	readonly alphabeticCode: AlphabeticCode;
	/** Three-digit zero-padded numeric code. */
	readonly numericCode: NumericCode;
	/**
	 * Number of decimal digits used for the minor unit (the "fraction" in the
	 * spec). `null` when the spec reports `N.A.`, which is the case for
	 * non-cash codes such as XAU, XAG, XTS, XXX and the XBA–XBD bond units.
	 */
	readonly minorUnits: number | null;
	/** Human-readable currency name, e.g. `"US Dollar"`, `"Pound Sterling"`. */
	readonly name: string;
	/**
	 * ISO 3166-1 alpha-2 codes of territories that use this currency.
	 * Sorted ascending. Empty for metals and other non-national reserved
	 * codes, and for entries whose issuing entity is not a country
	 * (the IMF, the Arab Monetary Fund, the ADB member group, Sucre).
	 */
	readonly countryCodes: readonly CountryCode[];
	/**
	 * `true` for fund currencies (entries flagged `IsFund="true"` in the spec).
	 * Fund currencies are accounting/investment units, not general tender.
	 */
	readonly isFund: boolean;
	/** See {@link CurrencyKind}. */
	readonly kind: CurrencyKind;
}

/**
 * A withdrawn (historic) ISO 4217 currency from list-three.xml.
 *
 * Exposed via the `@financica/iso4217/historic` subpath import to keep the
 * main bundle small when historic data is not needed.
 *
 * Historic records intentionally omit country associations: the issuing
 * states have often been renamed, split, or dissolved, so a stable ISO 3166
 * mapping isn't available. Use {@link alphabeticCode} and {@link name} to
 * identify the currency.
 */
export interface HistoricCurrency {
	/** Three-letter uppercase alphabetic code (may collide with current codes). */
	readonly alphabeticCode: string;
	/**
	 * Three-digit zero-padded numeric code, or `null` when the spec omits it
	 * (a small number of very old historic entries have no numeric code).
	 */
	readonly numericCode: string | null;
	/** Human-readable currency name at the time of withdrawal. */
	readonly name: string;
	/**
	 * Withdrawal date in `YYYY-MM` (occasionally `YYYY`) format, as reported
	 * by the spec.
	 */
	readonly withdrawalDate: string;
}
