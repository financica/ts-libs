/**
 * Stripe's decimal classification for money amounts.
 *
 * Deliberately NOT derived from ISO 4217 (`@financica/iso4217`) or `Intl`.
 * Stripe's classification diverges from ISO for backward-compatibility reasons,
 * and the divergence is a factor of 100 on real money:
 *
 * - **UGX** — ISO says zero-decimal. Stripe: "UGX transitioned to a zero-decimal
 *   currency, but backwards compatibility requires you to represent it as a
 *   two-decimal value, where the decimal amount is always `00`."
 * - **ISK** — same story as UGX.
 * - **HUF**, **TWD** — ISO/`Intl` reports HUF as zero-decimal. Stripe charges
 *   two-decimal amounts for both; the zero-decimal rule applies only to manual
 *   payouts, which this package never creates.
 *
 * Use an ISO-backed minor-unit table for ledger rounding, and this one for
 * anything crossing the Stripe API boundary. They are not interchangeable.
 *
 * Not handled: Stripe's three-decimal currencies (BHD, JOD, KWD, OMR, TND) are
 * treated as two-decimal, which is what the code this was extracted from did.
 * The classification could not be confirmed against Stripe's published table.
 *
 * @see https://docs.stripe.com/currencies#special-cases
 */

/**
 * Currencies where Stripe's `amount` is already in major units, so `500` means
 * 500 JPY rather than 5.00. Every other currency is two-decimal.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
	"BIF",
	"CLP",
	"DJF",
	"GNF",
	"JPY",
	"KMF",
	"KRW",
	"MGA",
	"PYG",
	"RWF",
	"VND",
	"VUV",
	"XAF",
	"XOF",
	"XPF",
]);

/** How many minor units make one major unit of `currency`, per Stripe. */
export const stripeMinorUnitDivisor = (currency: string): 1 | 100 =>
	ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;

/** Whether Stripe treats `currency` as zero-decimal. */
export const isStripeZeroDecimalCurrency = (currency: string): boolean =>
	stripeMinorUnitDivisor(currency) === 1;

/**
 * Convert a Stripe amount to major units: `1234` EUR → `12.34`, `500` JPY →
 * `500`, `500` UGX → `5`.
 *
 * Rounded to four decimal places, which absorbs binary-float error from the
 * division without discarding sub-cent precision a caller may still need.
 */
export const fromStripeMinorUnits = (minorAmount: number, currency: string): number => {
	const value = minorAmount / stripeMinorUnitDivisor(currency);
	const rounded = Math.round(value * 10000) / 10000;
	return Object.is(rounded, -0) ? 0 : rounded;
};

/** Convert a major-unit amount to the integer minor-unit value Stripe expects. */
export const toStripeMinorUnits = (amount: number, currency: string): number =>
	Math.round(amount * stripeMinorUnitDivisor(currency));
