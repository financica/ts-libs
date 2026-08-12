/**
 * The invoice is issued in English only, with US date formatting: `Sep 1, 2025`
 * for the issue date, `Aug 2025` for the service month.
 */
import type { IsoDate, IsoMonth } from "./types.js";

/** English month names, full and three-letter, to a month number. */
const MONTHS: Readonly<Record<string, number>> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	sept: 9,
	oct: 10,
	nov: 11,
	dec: 12,
};

const monthNumber = (name: string): number | null => MONTHS[name.toLowerCase()] ?? null;

const LONG_DATE_RE = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})$/;
const MONTH_YEAR_RE = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/;

/** `Sep 1, 2025` to `2025-09-01`. */
export const longDateToIso = (value: string): IsoDate | null => {
	const match = value.trim().match(LONG_DATE_RE);
	if (!match) return null;
	const month = monthNumber(match[1] ?? "");
	if (!month) return null;
	return `${match[3]}-${String(month).padStart(2, "0")}-${(match[2] ?? "").padStart(2, "0")}`;
};

/** `Aug 2025` to `2025-08`. */
export const monthYearToIso = (value: string): IsoMonth | null => {
	const match = value.trim().match(MONTH_YEAR_RE);
	if (!match) return null;
	const month = monthNumber(match[1] ?? "");
	if (!month) return null;
	return `${match[2]}-${String(month).padStart(2, "0")}`;
};
