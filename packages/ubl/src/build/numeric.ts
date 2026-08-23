/** Round a number to 2 decimal places (cents). */
export const roundCurrency = (value: number) =>
	Math.round((value + Number.EPSILON) * 100) / 100;

/** Convert an integer cent amount into a 2-decimal currency value. */
export const centsToDecimal = (cents: number) => roundCurrency(cents / 100);

/** The `cac:Price` pair for a line: the per-unit price and the optional BT-149. */
export interface UnitPrice {
	/** Net price of one unit (`UblLine.unitPrice`). */
	unitPrice: number;
	/**
	 * `cbc:BaseQuantity` (BT-149) — set when the per-unit price is not exact in
	 * cents; the serializer then emits `PriceAmount = unitPrice × baseQuantity`
	 * (the line net). Omitted = 1.
	 */
	baseQuantity?: number | undefined;
}

/**
 * Derive the `cac:Price` for a line whose net total is authoritative.
 *
 * Peppol rule PEPPOL-EN16931-R120 checks
 * `quantity × (PriceAmount ÷ BaseQuantity)` against the line net amount within
 * a 0.02 tolerance. Naively rounding `net ÷ quantity` to cents breaks that
 * whenever the division doesn't land on a cent: 940.00 over 14 units gives
 * 67.142857…, which rounds to 67.14, and 14 × 67.14 = 939.96 — off by 0.04 and
 * rejected as a fatal validation error.
 *
 * So the cent-rounded unit price is only used when it reproduces the net
 * exactly. Otherwise the line is priced as a whole via BT-149: `unitPrice` is
 * the exact (unrounded) `net ÷ quantity` and `baseQuantity` = the quantity, so
 * the serializer writes `PriceAmount` = the net and `BaseQuantity` = the
 * quantity, which is exact at any magnitude instead of merely within tolerance
 * — the residual of a rounded unit price grows with quantity and would
 * eventually breach 0.02 at any fixed precision.
 */
export const deriveUnitPrice = (netTotal: number, quantity: number): UnitPrice => {
	// A zero or fractional-to-zero quantity still has to price something; BT-149
	// must be a positive number (PEPPOL-EN16931-R121), so floor the divisor at 1.
	const units = quantity > 0 ? quantity : 1;
	const perUnit = roundCurrency(netTotal / units);
	if (roundCurrency(perUnit * units) === roundCurrency(netTotal)) {
		return { unitPrice: perUnit };
	}
	return { unitPrice: roundCurrency(netTotal) / units, baseQuantity: units };
};
