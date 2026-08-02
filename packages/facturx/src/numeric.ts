/**
 * Currency/amount helpers shared by the totals calculator, the XML builder,
 * and the PDF renderer. EN 16931 amounts are decimals with two fraction
 * digits; unit prices may carry more precision.
 */

/** Round half away from zero at `decimals` fraction digits. */
export const roundAmount = (value: number, decimals = 2): number => {
	const factor = 10 ** decimals;
	// Nudge the magnitude by a couple of float ULPs so values like 1.005
	// (stored as 1.00499999…) round the way decimal arithmetic would.
	const scaled = Math.abs(value) * factor * (1 + Number.EPSILON * 2);
	return (Math.sign(value) * Math.round(scaled)) / factor;
};

/** Format an amount with exactly two fraction digits ("1234.50"). */
export const formatAmount = (value: number): string => roundAmount(value).toFixed(2);

/**
 * Format a value with up to `maxDecimals` fraction digits, trimming trailing
 * zeros but keeping at least `minDecimals`. Used for unit prices, quantities
 * and percentages, where EN 16931 allows more precision than amounts.
 */
export const formatDecimal = (
	value: number,
	{
		maxDecimals = 4,
		minDecimals = 0,
	}: { maxDecimals?: number; minDecimals?: number } = {},
): string => {
	const fixed = roundAmount(value, maxDecimals).toFixed(maxDecimals);
	if (maxDecimals === minDecimals) return fixed;
	const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
	const dot = trimmed.indexOf(".");
	const decimals = dot === -1 ? 0 : trimmed.length - dot - 1;
	if (decimals >= minDecimals) return trimmed;
	return roundAmount(value, maxDecimals).toFixed(minDecimals);
};

/** Parse an XML decimal string to a finite number, or undefined. */
export const parseDecimal = (value: unknown): number | undefined => {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : undefined;
};
