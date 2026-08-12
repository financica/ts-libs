/** Fixed strings and shapes the invoice is recognised by. */

/** The document title, printed top right. */
export const TITLE = "Tax Invoice";

/** A Stripe account id, which every tax invoice carries. */
export const ACCOUNT_ID_RE = /\bacct_[A-Za-z0-9]+/;

/** `Transfer Currency: EUR` — the heading that opens a fee table. */
export const CURRENCY_HEADING_RE = /^Transfer Currency:\s*([A-Z]{3})$/;

/** `in USD` — one of the two headings over a converted totals block. */
export const CONVERSION_HEADING_RE = /^in ([A-Z]{3})$/;

/** The note that makes the supply the customer's to account for. */
export const REVERSE_CHARGE_RE = /reverse charge/i;

/** `Total fees in EUR` / `Total VAT in EUR` — the totals across every section. */
export const INVOICE_TOTAL_RE = /^Total (fees|VAT) in ([A-Z]{3})$/;

/** `Exchange Rates (derived from average rate for period)`. */
export const EXCHANGE_RATES_HEADING_RE = /^Exchange Rates\s*\((.+)\)$/;

/** `USD / EUR` — one row of the exchange-rate table. */
export const EXCHANGE_RATE_PAIR_RE = /^([A-Z]{3})\s*\/\s*([A-Z]{3})$/;

/** A footnote under the table, keyed to a marker in a fee description. */
export const FOOTNOTE_RE = /^[†‡*]\s*\S/;

/**
 * `17 card payments totaling €1,882.76` — the volume behind a fee line.
 *
 * The count and the amount are what matter; the middle is whatever Stripe calls
 * that group (`card payments`, `other refund`, `adjustment`), kept verbatim.
 */
export const VOLUME_RE = /^([\d,]+)\s+(.+?)\s+totaling\s+(\S+)$/;

/**
 * The totals printed under a fee table.
 *
 * `Total VAT` has to be tested before `Total`, which is why this is a list and
 * not a map. A label is matched exactly, or as a prefix — a narrow column wraps
 * `Debited from your Balance` onto two rows, with the amount on the first.
 */
export const TOTAL_LABELS = [
	{ label: "Stripe Fees", key: "stripeFees" },
	{ label: "Total VAT", key: "totalVat" },
	{ label: "Debited from your Balance", key: "debitedFromBalance" },
	{ label: "Amount Due", key: "amountDue" },
	{ label: "Total", key: "total" },
] as const;

/** Which total a row states. */
export type TotalKey = (typeof TOTAL_LABELS)[number]["key"];

/**
 * Resolve a printed label to the total it states, or `null`.
 *
 * An exact match wins. Otherwise the label must be the start of exactly one
 * known label, which picks up a wrapped `Debited from` without letting
 * `Total VAT in EUR` — an invoice-level total — pass as a section total.
 */
export const resolveTotalKey = (label: string): TotalKey | null => {
	const exact = TOTAL_LABELS.find((total) => total.label === label);
	if (exact) return exact.key;
	if (!label) return null;
	const prefixed = TOTAL_LABELS.filter((total) => total.label.startsWith(label));
	return prefixed.length === 1 ? (prefixed[0]?.key ?? null) : null;
};
