import type { IsoDate } from "./types.js";

/** Month name to number, for both languages the statement is issued in. */
export const MONTH_NAMES: Readonly<Record<string, number>> = {
	// French
	janvier: 1,
	février: 2,
	mars: 3,
	avril: 4,
	mai: 5,
	juin: 6,
	juillet: 7,
	août: 8,
	septembre: 9,
	octobre: 10,
	novembre: 11,
	décembre: 12,
	// Dutch
	januari: 1,
	februari: 2,
	maart: 3,
	april: 4,
	mei: 5,
	juni: 6,
	juli: 7,
	augustus: 8,
	september: 9,
	oktober: 10,
	november: 11,
	december: 12,
	// Unaccented French, for extractions that drop diacritics.
	fevrier: 2,
	aout: 8,
	decembre: 12,
};

const DOT_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const SLASH_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** `DD.MM.YYYY` to `YYYY-MM-DD`. */
export const dotDateToIso = (value: string): IsoDate | null => {
	const match = value.match(DOT_DATE_RE);
	if (!match) return null;
	return `${match[3]}-${match[2]}-${match[1]}`;
};

/** `DD/MM/YYYY` to `YYYY-MM-DD`. */
export const slashDateToIso = (value: string): IsoDate | null => {
	const match = value.match(SLASH_DATE_RE);
	if (!match) return null;
	return `${match[3]}-${match[2]}-${match[1]}`;
};

/**
 * Either separator to `YYYY-MM-DD`. The two layouts differ on which they use,
 * and a legacy statement occasionally mixes them, so most callers want this.
 */
export const anyDateToIso = (value: string): IsoDate | null =>
	dotDateToIso(value) ?? slashDateToIso(value);

/** `7 février 2025` / `7 februari 2025` to `YYYY-MM-DD`. */
export const longDateToIso = (value: string): IsoDate | null => {
	const parts = value.trim().split(/\s+/);
	if (parts.length !== 3) return null;
	const [dayStr, monthName, yearStr] = parts;
	if (!dayStr || !monthName || !yearStr) return null;
	const month = MONTH_NAMES[monthName.toLowerCase()];
	if (!month) return null;
	return `${yearStr}-${String(month).padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
};
