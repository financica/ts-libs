/** Trim a string; `null` when missing or blank. */
export const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
};
