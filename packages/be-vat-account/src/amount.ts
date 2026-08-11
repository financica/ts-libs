/**
 * Amounts on the statement are printed European style: `2.561,66`, `16,89`,
 * `0,00`. Parsing is deliberately tolerant of the surrounding decoration
 * (currency signs, non-breaking spaces used as thousands separators) that PDF
 * text extraction sometimes leaves attached.
 */

/** Matches an amount exactly as the statement prints it, with nothing around it. */
export const EUROPEAN_AMOUNT_RE = /^[\d.]+,\d{2}$/;

/**
 * Parse a decimal written with either separator convention. Returns `null` when
 * the input is not a number.
 *
 * When both separators appear the last one is the decimal separator, which
 * resolves `1.234,56` and `1,234.56` correctly. A lone comma followed by
 * exactly three digits is read as a thousands group (`1,234`), because that is
 * the only reading that keeps `1,234` and `1,23` both correct.
 */
export const parseLocalizedAmount = (value?: string | null): number | null => {
	if (!value) return null;
	const raw = value.trim();
	if (!raw) return null;

	let normalized = raw.replace(/[^0-9,.-]+/g, "");
	if (!normalized) return null;

	// Trailing minus -> leading minus.
	if (normalized.endsWith("-")) {
		normalized = `-${normalized.slice(0, -1)}`;
	}
	// Any minus sign left beyond a single leading one means garbage input.
	if (normalized.indexOf("-", 1) !== -1) return null;

	const lastComma = normalized.lastIndexOf(",");
	const lastDot = normalized.lastIndexOf(".");
	if (lastComma !== -1 && lastDot !== -1) {
		if (lastComma > lastDot) {
			normalized = normalized.replace(/\./g, "").replace(",", ".");
		} else {
			normalized = normalized.replace(/,/g, "");
		}
	} else if (lastComma !== -1) {
		const parts = normalized.split(",");
		if (parts.length === 2 && parts[1]?.length !== 3) {
			// Single comma whose tail can't be a thousands group: decimal comma.
			normalized = `${parts[0] ?? ""}.${parts[1] ?? ""}`;
		} else {
			// "1,234" / "1,234,567": commas are thousands separators.
			normalized = normalized.replace(/,/g, "");
		}
	} else if (lastDot !== -1 && normalized.indexOf(".") !== lastDot) {
		// Multiple dots with no comma ("1.234.567"): thousands separators.
		normalized = normalized.replace(/\./g, "");
	}

	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
};
