/** Reading Stripe's tax-inclusivity flags off an invoice payload, and backing
 * the tax out of the amounts when they turn out to be inclusive. */

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

/**
 * Round to four decimal places, normalising `-0` to `0`.
 *
 * Four rather than two: the division by quantity can leave sub-cent precision
 * a caller still wants, and rounding to cents here would silently drop it.
 * `-0` is normalised because it compares equal to `0` but serialises as `-0`,
 * which then shows up in stored JSON and in test diffs.
 */
const round = (value: number): number => {
	const rounded = Math.round(value * 10000) / 10000;
	return Object.is(rounded, -0) ? 0 : rounded;
};

/** The line-item shape {@link adjustForInclusiveTax} needs to reprice a line. */
export type StripeTaxAdjustableLine = {
	amount: number;
	quantity: number;
	unit_amount: number;
	tax_amount: number | null;
};

/**
 * Back inclusive tax out of an invoice's subtotal and line amounts, yielding
 * tax-exclusive (net) figures.
 *
 * When Stripe prices tax-inclusively the `amount` on the invoice and on every
 * line already contains the VAT. Ledgers almost always want the net, so this
 * subtracts each line's own `tax_amount` from its `amount` and re-derives
 * `unit_amount` from the net.
 *
 * `taxInclusive` takes the tri-state {@link detectStripeTaxInclusive} returns:
 * only an explicit `true` adjusts. `false` and `null` (unknown) both pass the
 * values through untouched, because guessing on `null` would book a
 * VAT-inclusive invoice at a net that is not the net.
 *
 * Lines are returned as copies; the input array and its objects are not
 * mutated, and any extra properties on a line survive.
 */
export const adjustForInclusiveTax = <T extends StripeTaxAdjustableLine>(params: {
	taxInclusive: boolean | null;
	subtotal: number;
	taxTotal: number;
	lineItems: T[];
}): { subtotal: number; lineItems: T[] } => {
	if (params.taxInclusive !== true) {
		return { subtotal: params.subtotal, lineItems: params.lineItems };
	}

	return {
		subtotal: round(params.subtotal - params.taxTotal),
		lineItems: params.lineItems.map((item) => {
			const netAmount = round(item.amount - (item.tax_amount ?? 0));
			// Stripe sends quantity 0 for flat-fee tier components; dividing by it
			// would yield Infinity, so read it as the single unit it describes.
			const quantity = item.quantity || 1;
			return {
				...item,
				quantity,
				amount: netAmount,
				unit_amount: round(netAmount / quantity),
			};
		}),
	};
};
