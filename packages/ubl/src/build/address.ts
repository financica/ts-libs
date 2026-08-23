import type { UblAddress } from "../types";
import { compact, normalizeString } from "./utils";

const normalizeCountryCode = (value: string | null | undefined): string | undefined => {
	const trimmed = normalizeString(value);
	if (!trimmed) return undefined;
	return trimmed.length >= 2 ? trimmed.toUpperCase().slice(0, 2) : undefined;
};

/**
 * A free-form postal address as accepted by {@link normalizeAddress}.
 *
 * Both the Stripe shape (`line1`, `postal_code`, `country`, `state`) and the
 * legacy/internal shape (`street`, `zip_code`, `country_code`,
 * `country_subentity`) are accepted; when both keys are present the Stripe
 * one wins.
 */
export interface AddressInput {
	line1?: string | null;
	line2?: string | null;
	street?: string | null;
	city?: string | null;
	postal_code?: string | null;
	zip_code?: string | null;
	state?: string | null;
	country_subentity?: string | null;
	country?: string | null;
	country_code?: string | null;
}

/**
 * Normalize a free-form address (Stripe shape, custom shape, or an internal
 * shape) into a {@link UblAddress}. An absent part is an absent key.
 *
 * Accepts both `line1`/`postal_code`/`country` (Stripe) and `street`/`zip_code`
 * (legacy/internal) keys. Falls back to `fallbackCountryCode` when the address
 * has no country, but never silently substitutes a caller's country — pass
 * `null` when "no country" is the right answer.
 */
export const normalizeAddress = (
	address: AddressInput | null | undefined,
	fallbackCountryCode: string | null,
	fallbackLine?: string | null,
): UblAddress => {
	const record: AddressInput = address ?? {};
	const countryCode =
		normalizeCountryCode(normalizeString(record.country)) ??
		normalizeCountryCode(normalizeString(record.country_code)) ??
		normalizeCountryCode(fallbackCountryCode);
	return compact({
		street:
			normalizeString(record.line1) ??
			normalizeString(record.street) ??
			normalizeString(fallbackLine),
		additionalStreet: normalizeString(record.line2),
		city: normalizeString(record.city),
		postalZone:
			normalizeString(record.postal_code) ?? normalizeString(record.zip_code),
		countrySubentity:
			normalizeString(record.state) ?? normalizeString(record.country_subentity),
		countryCode,
	});
};
