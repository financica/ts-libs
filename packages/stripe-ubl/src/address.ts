import type { ScradaAddress } from "@financica/scrada-client";
import { isRecord, normalizeString } from "./utils";

const normalizeCountryCode = (value: string | null | undefined): string | null => {
	const trimmed = normalizeString(value);
	if (!trimmed) return null;
	return trimmed.length >= 2 ? trimmed.toUpperCase().slice(0, 2) : null;
};

/**
 * Normalize a free-form address (Stripe shape, custom shape, or our internal
 * shape) into the Scrada ScradaAddress structure.
 *
 * Accepts both `line1`/`postal_code`/`country` (Stripe) and `street`/`zip_code`
 * (legacy/internal) keys. Falls back to `fallbackCountryCode` when the address
 * has no country, but never silently substitutes the supplier's country (the
 * caller should pass `null` if "no country" is the right thing).
 */
export const normalizeAddress = (
	address: unknown,
	fallbackCountryCode: string | null,
	fallbackLine?: string | null,
): ScradaAddress => {
	const record = isRecord(address) ? address : {};
	const countryCode =
		normalizeCountryCode(normalizeString(record.country)) ??
		normalizeCountryCode(normalizeString(record.country_code)) ??
		normalizeCountryCode(fallbackCountryCode);
	return {
		street:
			normalizeString(record.line1) ??
			normalizeString(record.street) ??
			fallbackLine ??
			null,
		streetNumber: null,
		streetBox: normalizeString(record.line2),
		city: normalizeString(record.city),
		zipCode:
			normalizeString(record.postal_code) ?? normalizeString(record.zip_code),
		countrySubentity:
			normalizeString(record.state) ?? normalizeString(record.country_subentity),
		countryCode,
	};
};
