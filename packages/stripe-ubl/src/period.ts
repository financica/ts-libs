import type { UblPeriod } from "@financica/ubl/build";
import type Stripe from "stripe";

const isoDateFromUnixSeconds = (seconds: number | null | undefined): string | null =>
	seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;

const addDays = (isoDate: string, days: number): string => {
	const parsed = Date.parse(`${isoDate}T00:00:00Z`);
	if (!Number.isFinite(parsed)) return isoDate;
	const shifted = new Date(parsed);
	shifted.setUTCDate(shifted.getUTCDate() + days);
	return shifted.toISOString().slice(0, 10);
};

/**
 * A Stripe billing period (`invoice.period_start/end`, `line.period`) as an
 * EN 16931 service period.
 *
 * Two conversions, both of which are wrong if skipped:
 *
 * - **Stripe's end is exclusive**, the next cycle's boundary: a January month
 *   bills `01-01 → 02-01`. BT-74 is the inclusive last day of service, so the
 *   end moves back one day. Passing Stripe's value straight through puts every
 *   monthly invoice one day into the following period.
 * - **A degenerate period is not a period.** Stripe stamps `start === end` (the
 *   creation instant) on one-off invoice items, which state no service period
 *   at all. That is reported as absent rather than as a zero-length range.
 */
export const toUblPeriod = (
	start: number | null | undefined,
	end: number | null | undefined,
): UblPeriod | null => {
	const startDate = isoDateFromUnixSeconds(start);
	const endDate = isoDateFromUnixSeconds(end);
	if (!startDate || !endDate || endDate <= startDate) return null;
	return { startDate, endDate: addDays(endDate, -1) };
};

/**
 * The service period the whole invoice covers (BT-73/BT-74).
 *
 * Taken from the span of the line periods rather than `invoice.period_start/end`:
 * the invoice-level pair is the *billing* window Stripe stamps at finalization,
 * which a proration or a mid-cycle add-on line legitimately falls outside of.
 * The invoice-level pair is the fallback for an invoice whose lines state no
 * period at all.
 */
export const resolveInvoicePeriod = (invoice: Stripe.Invoice): UblPeriod | null => {
	const linePeriods = (invoice.lines?.data ?? [])
		.map((line) => toUblPeriod(line.period?.start, line.period?.end))
		.filter((period): period is UblPeriod => period !== null);

	if (linePeriods.length === 0) {
		return toUblPeriod(invoice.period_start, invoice.period_end);
	}

	const startDates = linePeriods
		.map((period) => period.startDate)
		.filter((date): date is string => date !== null);
	const endDates = linePeriods
		.map((period) => period.endDate)
		.filter((date): date is string => date !== null);

	return {
		startDate: startDates.reduce((a, b) => (b < a ? b : a)),
		endDate: endDates.reduce((a, b) => (b > a ? b : a)),
	};
};
