/**
 * Optional subpath export for historic (withdrawn) ISO 4217 currencies.
 *
 *   import { HISTORIC_CURRENCIES, getHistoricByCode } from "@financica/iso4217/historic";
 *
 * Kept separate from the main bundle so the active-currency index (~12 KB
 * tree-shaken) stays lean for users who don't need historic data.
 */

import { HISTORIC_CURRENCIES, HISTORIC_PUBLISHED_AT } from "./historic-data.js";
import { normalizeAlphabetic, normalizeNumeric } from "./normalize.js";
import type { HistoricCurrency } from "./types.js";

const BY_ALPHABETIC = new Map<string, HistoricCurrency[]>();
const BY_NUMERIC = new Map<string, HistoricCurrency[]>();

for (const currency of HISTORIC_CURRENCIES) {
	const alphaBucket = BY_ALPHABETIC.get(currency.alphabeticCode);
	if (alphaBucket) alphaBucket.push(currency);
	else BY_ALPHABETIC.set(currency.alphabeticCode, [currency]);

	if (currency.numericCode !== null) {
		const numericBucket = BY_NUMERIC.get(currency.numericCode);
		if (numericBucket) numericBucket.push(currency);
		else BY_NUMERIC.set(currency.numericCode, [currency]);
	}
}

for (const [key, bucket] of BY_ALPHABETIC) {
	BY_ALPHABETIC.set(key, Object.freeze(bucket) as HistoricCurrency[]);
}
for (const [key, bucket] of BY_NUMERIC) {
	BY_NUMERIC.set(key, Object.freeze(bucket) as HistoricCurrency[]);
}

const EMPTY: readonly HistoricCurrency[] = Object.freeze([]);

/**
 * Every historic record matching a withdrawn alphabetic code. A single code
 * can have multiple records across different withdrawal dates (e.g. `ANG`
 * was withdrawn twice).
 *
 * Matching is case-insensitive; whitespace is trimmed.
 */
export function getHistoricByCode(code: string): readonly HistoricCurrency[] {
	const normalized = normalizeAlphabetic(code);
	if (normalized === undefined) return EMPTY;
	return BY_ALPHABETIC.get(normalized) ?? EMPTY;
}

/**
 * Every historic record matching a withdrawn numeric code. Accepts strings
 * or numbers; leading zeros are normalised.
 */
export function getHistoricByNumericCode(
	code: string | number,
): readonly HistoricCurrency[] {
	const normalized = normalizeNumeric(code);
	if (normalized === undefined) return EMPTY;
	return BY_NUMERIC.get(normalized) ?? EMPTY;
}

export { HISTORIC_CURRENCIES, HISTORIC_PUBLISHED_AT };
export type { HistoricCurrency } from "./types.js";
