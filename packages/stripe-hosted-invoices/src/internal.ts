/** Shared primitives. Not part of the public API unless re-exported by index. */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Trimmed non-empty string, or null. */
export const normalizeString = (value: unknown): string | null => {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
};

/**
 * Coerce a Stripe amount to a number, or null when absent/unreadable.
 *
 * Stripe's JSON is not consistent about the type of its documented-integer
 * fields: some arrive as decimal strings (`unit_amount_excluding_tax`, every
 * `*_decimal`, and — observed in the wild — `subtotal` and `total` on credit
 * notes). Reading those with a `typeof === "number"` guard silently yields
 * nothing, which on a tax amount understates the VAT. Both forms are accepted.
 */
export const optionalAmount = (value: unknown): number | null => {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "string") {
		// `Number("")` and `Number("  ")` are 0. An absent value must stay null:
		// a fabricated 0 on a tax field reads as "no VAT due".
		if (value.trim().length === 0) return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

/** Convert a Unix timestamp (seconds) to an ISO date string, `YYYY-MM-DD`. */
export const unixToIsoDate = (ts: number | null | undefined): string | null => {
	if (!ts || !Number.isFinite(ts)) return null;
	return new Date(ts * 1000).toISOString().slice(0, 10);
};

/**
 * Depth cap for {@link findDeep}. Stripe payloads nest a handful of levels; 16
 * is far past anything real and stops a hostile or cyclic body from recursing
 * without bound.
 */
const FIND_DEEP_MAX_DEPTH = 16;

/**
 * Recursively search a nested object for the first value under `key`.
 *
 * The hosted page payload has no published schema and Stripe moves fields
 * between nesting levels, so the values this package needs (the ephemeral key,
 * the invoice id) are located by search rather than by path. Visited references
 * are tracked so a cyclic body cannot loop.
 */
export const findDeep = (obj: unknown, key: string): unknown => {
	const seen = new WeakSet<object>();
	const walk = (value: unknown, depth: number): unknown => {
		if (depth > FIND_DEEP_MAX_DEPTH) return undefined;
		if (!value || typeof value !== "object") return undefined;
		if (seen.has(value)) return undefined;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) {
				const found = walk(item, depth + 1);
				if (found !== undefined) return found;
			}
			return undefined;
		}
		const record = value as Record<string, unknown>;
		if (key in record) return record[key];
		for (const val of Object.values(record)) {
			const found = walk(val, depth + 1);
			if (found !== undefined) return found;
		}
		return undefined;
	};
	return walk(obj, 0);
};

/** First non-empty string found under any of `keys`, searched in order. */
export const findDeepString = (obj: unknown, ...keys: string[]): string | null => {
	for (const key of keys) {
		const found = normalizeString(findDeep(obj, key));
		if (found !== null) return found;
	}
	return null;
};

/**
 * Locate a Stripe invoice id (`in_…`) anywhere in a payload.
 *
 * Tries the keys the hosted page has used, then falls back to scanning the
 * serialized body — the id is distinctive enough that a match is reliable, and
 * a missed id means the import cannot proceed at all.
 */
export const findStripeInvoiceId = (data: unknown): string | null => {
	for (const key of ["invoice_id", "invoiceId", "invoice"]) {
		const value = findDeep(data, key);
		if (typeof value === "string" && value.startsWith("in_")) return value;
	}
	const match = /"(in_[A-Za-z0-9]{10,})"/.exec(JSON.stringify(data) ?? "");
	return match?.[1] ?? null;
};

/**
 * Round to four decimal places, normalising `-0` to `0`.
 *
 * Four rather than two: dividing by a quantity or a minor-unit divisor can
 * leave sub-cent precision a caller still wants, and rounding to cents here
 * would silently drop it. `-0` is normalised because it compares equal to `0`
 * but serialises as `-0`, which then shows up in stored JSON and in test diffs.
 */
export const roundToFourDecimals = (value: number): number => {
	const rounded = Math.round(value * 10000) / 10000;
	return Object.is(rounded, -0) ? 0 : rounded;
};
