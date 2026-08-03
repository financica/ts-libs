/** Reading Stripe's tax-inclusivity flags off an invoice payload. */

import type { StripeHostedInvoice, StripeLineItem, StripeTaxAmount } from "./types.js";

const nonZero = (entries: StripeTaxAmount[] | null | undefined): StripeTaxAmount[] =>
	(entries ?? []).filter(
		(entry) => typeof entry.amount === "number" && entry.amount !== 0,
	);

/**
 * Whether an invoice prices tax-inclusively (VAT already inside the line
 * amounts), or `null` when the payload carries no tax entries to judge from.
 *
 * Stripe marks each entry in `total_tax_amounts` — and each per-line
 * `tax_amounts` entry — with an `inclusive` boolean. The invoice-level
 * breakdown is checked first as the more reliable of the two, falling back to
 * the lines. Zero-amount entries are ignored: they carry no signal and are
 * emitted for exempt and reverse-charge lines.
 *
 * `null` genuinely means unknown. Treating it as `false` would silently book a
 * VAT-inclusive invoice at its gross amount.
 */
export const detectStripeTaxInclusive = (
	invoice: Pick<StripeHostedInvoice, "total_tax_amounts" | "lines">,
): boolean | null => {
	const invoiceLevel = nonZero(invoice.total_tax_amounts);
	if (invoiceLevel.length > 0) {
		return invoiceLevel.every((entry) => entry.inclusive === true);
	}

	const lineLevel = (invoice.lines?.data ?? []).flatMap((line: StripeLineItem) =>
		nonZero(line.tax_amounts),
	);
	if (lineLevel.length > 0) {
		return lineLevel.every((entry) => entry.inclusive === true);
	}

	return null;
};
