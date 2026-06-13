/** Round a number to 2 decimal places (cents). */
export const roundCurrency = (value: number) =>
	Math.round((value + Number.EPSILON) * 100) / 100;

/** Convert an integer cent amount into a 2-decimal currency value. */
export const centsToDecimal = (cents: number) => roundCurrency(cents / 100);
