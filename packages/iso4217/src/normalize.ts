/**
 * Input normalisers shared by the main and historic entry points.
 *
 * This module deliberately imports no data modules so that both bundles can
 * depend on it without pulling the other's dataset in.
 */

/**
 * Normalise user input to the canonical alphabetic-code form (uppercase,
 * trimmed). Returns `undefined` for any string that isn't exactly 3 letters
 * after normalisation.
 */
export function normalizeAlphabetic(input: string): string | undefined {
	const trimmed = input.trim();
	const upper = trimmed.toUpperCase();
	return /^[A-Z]{3}$/.test(upper) ? upper : undefined;
}

/**
 * Normalise user input to the canonical numeric-code form (zero-padded
 * three-character string). Accepts numbers and numeric strings; returns
 * `undefined` if the value isn't a non-negative integer ≤ 999.
 */
export function normalizeNumeric(input: string | number): string | undefined {
	if (typeof input === "number") {
		if (!Number.isInteger(input) || input < 0 || input > 999) return undefined;
		return input.toString().padStart(3, "0");
	}
	const trimmed = input.trim();
	if (!/^\d{1,3}$/.test(trimmed)) return undefined;
	return trimmed.padStart(3, "0");
}
