/** Type guard for plain objects (not arrays, not null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

/** Safely extract an error message from an unknown caught value. */
export const toErrorMessage = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	if (isRecord(error) && typeof error.message === "string") return error.message;
	return String(error);
};
