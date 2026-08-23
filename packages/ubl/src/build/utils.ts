/** Trim a string; `null` when missing or blank. */
export const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
};

/**
 * Coerce a numeric field to a number. Accepts decimal strings because some
 * upstream JSON (notably Stripe's `*_decimal` fields) serialises integers as
 * strings; anything unparseable yields 0.
 */
export const toNumber = (value: number | string | null | undefined): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
};
