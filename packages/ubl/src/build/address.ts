import type { UblAddress } from "./ubl/types";
import { isRecord, normalizeString } from "./utils";

const normalizeCountryCode = (value: string | null | undefined): string | null => {
	const trimmed = normalizeString(value);
	if (!trimmed) return null;
	return trimmed.length >= 2 ? trimmed.toUpperCase().slice(0, 2) : null;
};

/**
 * Normalize a free-form address (Stripe shape, custom shape, or an internal
 * shape) into a {@link UblAddress}.
 *
 * Accepts both `line1`/`postal_code`/`country` (Stripe) and `street`/`zip_code`
 * (legacy/internal) keys. Falls back to `fallbackCountryCode` when the address
 * has no country, but never silently substitutes a caller's country — pass
 * `null` when "no country" is the right answer.
 */
export const normalizeAddress = (
	address: unknown,
	fallbackCountryCode: string | null,
	fallbackLine?: string | null,
): UblAddress => {
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
		additionalStreet: normalizeString(record.line2),
		city: normalizeString(record.city),
		postalZone:
			normalizeString(record.postal_code) ?? normalizeString(record.zip_code),
		countrySubentity:
			normalizeString(record.state) ?? normalizeString(record.country_subentity),
		countryCode,
	};
};
