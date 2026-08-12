/** Fixed strings and shapes the invoice is recognised by. */

/** The document title, printed top right. */
export const TITLE = "Tax Invoice";

/** A Stripe account id, which every tax invoice carries. */
export const ACCOUNT_ID_RE = /\bacct_[A-Za-z0-9]+/;

/** `Transfer Currency: EUR` — the heading that opens a fee table. */
export const CURRENCY_HEADING_RE = /^Transfer Currency:\s*([A-Z]{3})$/;

/** The note that makes the supply the customer's to account for. */
export const REVERSE_CHARGE_NOTE = "Reverse Charge";

/**
 * `17 card payments totaling €1,882.76` — the volume behind a fee line.
 *
 * The count and the amount are what matter; the middle is whatever Stripe calls
 * that group of payments, and is kept verbatim.
 */
export const VOLUME_RE = /^([\d,]+)\s+(.+?)\s+totaling\s+(\S+)$/;

/**
 * The totals printed under a fee table, in the order they appear. `Total VAT`
 * has to be tested before `Total`, which is why this is a list and not a map.
 */
export const TOTAL_LABELS = [
	{ label: "Stripe Fees", key: "stripeFees" },
	{ label: "Total VAT", key: "totalVat" },
	{ label: "Debited from your Balance", key: "debitedFromBalance" },
	{ label: "Amount Due", key: "amountDue" },
	{ label: "Total", key: "total" },
] as const;

/** Which total a row states, or `null` if it is not a totals row. */
export type TotalKey = (typeof TOTAL_LABELS)[number]["key"];
