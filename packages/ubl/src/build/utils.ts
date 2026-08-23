/** Trim a string; `undefined` when missing or blank. */
export const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
};

/** Drop `undefined`-valued keys so an absent field is an absent key. */
export const compact = <T extends object>(value: T): T =>
	Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as T;
