import type {
	PeppolOnlyInvoiceLine,
	SalesInvoiceVatTotal,
} from "@financica/scrada-client";
import { roundCurrency } from "./numeric";

/**
 * Adjust per-group excl-VAT totals so they sum to the authoritative document
 * total (e.g. Stripe's `invoice.total_excluding_tax`). Distributes any
 * rounding difference to the largest VAT group.
 */
const reconcileExclVatTotals = (
	vatTotals: SalesInvoiceVatTotal[],
	authoritativeTotalExclVat: number,
): SalesInvoiceVatTotal[] => {
	const computed = roundCurrency(
		vatTotals.reduce((sum, vt) => sum + vt.totalExclVat, 0),
	);
	const diff = roundCurrency(authoritativeTotalExclVat - computed);
	if (diff === 0 || vatTotals.length === 0) return vatTotals;

	const largestIdx = vatTotals.reduce(
		(maxIdx, vt, idx, arr) =>
			vt.totalExclVat > (arr[maxIdx]?.totalExclVat ?? 0) ? idx : maxIdx,
		0,
	);
	return vatTotals.map((vt, idx) => {
		if (idx !== largestIdx) return vt;
		const adjustedTotalExclVat = roundCurrency(vt.totalExclVat + diff);
		return {
			...vt,
			totalExclVat: adjustedTotalExclVat,
			totalInclVat: roundCurrency(adjustedTotalExclVat + vt.totalVat),
		};
	});
};

/**
 * Adjust per-group VAT totals so they sum to the authoritative document
 * VAT total. Distributes any rounding difference to the largest VAT group.
 */
const reconcileVatTotals = (
	vatTotals: SalesInvoiceVatTotal[],
	authoritativeTotalVat: number,
): SalesInvoiceVatTotal[] => {
	const computed = roundCurrency(vatTotals.reduce((sum, vt) => sum + vt.totalVat, 0));
	const diff = roundCurrency(authoritativeTotalVat - computed);
	if (diff === 0 || vatTotals.length === 0) return vatTotals;

	const largestIdx = vatTotals.reduce(
		(maxIdx, vt, idx, arr) =>
			vt.totalExclVat > (arr[maxIdx]?.totalExclVat ?? 0) ? idx : maxIdx,
		0,
	);
	return vatTotals.map((vt, idx) => {
		if (idx !== largestIdx) return vt;
		const adjustedTotalVat = roundCurrency(vt.totalVat + diff);
		return {
			...vt,
			totalVat: adjustedTotalVat,
			totalInclVat: roundCurrency(vt.totalExclVat + adjustedTotalVat),
		};
	});
};

export interface BuildVatTotalsResult {
	totalExclVat: number;
	totalInclVat: number;
	totalVat: number;
	vatTotals: SalesInvoiceVatTotal[];
}

/**
 * Group lines by `(vatType, vatPercentage)`, compute per-group totals, and
 * reconcile them against the authoritative document totals (`invoice.total`
 * and `invoice.total_excluding_tax` from Stripe).
 *
 * Reconciliation distributes any rounding difference to the largest VAT
 * group, which is the right behaviour when discrepancies are pennies.
 * Larger discrepancies indicate a real data problem in the upstream
 * invoice — see {@link tax-amounts.ts} for the `tax_amounts` vs `taxes`
 * field handling that prevents one common source of large discrepancies.
 */
export const buildVatTotals = (
	lines: PeppolOnlyInvoiceLine[],
	authoritativeTotalExclVat?: number | null,
	authoritativeTotalVat?: number | null,
): BuildVatTotalsResult => {
	const groups = new Map<
		string,
		{
			vatType: number;
			vatPercentage: number;
			totalExclVat: number;
			totalVat: number;
		}
	>();

	for (const line of lines) {
		const key = `${line.vatType}:${line.vatPercentage}`;
		const lineTotalExclVat = line.totalExclVat ?? 0;
		const current = groups.get(key) ?? {
			vatType: line.vatType,
			vatPercentage: line.vatPercentage,
			totalExclVat: 0,
			totalVat: 0,
		};
		current.totalExclVat = roundCurrency(current.totalExclVat + lineTotalExclVat);
		const lineVat = roundCurrency((lineTotalExclVat * line.vatPercentage) / 100);
		current.totalVat = roundCurrency(current.totalVat + lineVat);
		groups.set(key, current);
	}

	let vatTotals: SalesInvoiceVatTotal[] = Array.from(groups.values()).map(
		(entry) => ({
			vatType: entry.vatType,
			vatPercentage: entry.vatPercentage,
			totalExclVat: entry.totalExclVat,
			totalVat: entry.totalVat,
			totalInclVat: roundCurrency(entry.totalExclVat + entry.totalVat),
		}),
	);

	let totalExclVat = roundCurrency(
		lines.reduce((sum, line) => sum + (line.totalExclVat ?? 0), 0),
	);
	let totalVat = roundCurrency(vatTotals.reduce((sum, vt) => sum + vt.totalVat, 0));

	if (authoritativeTotalExclVat != null) {
		vatTotals = reconcileExclVatTotals(vatTotals, authoritativeTotalExclVat);
		totalExclVat = authoritativeTotalExclVat;
	}

	if (authoritativeTotalVat != null) {
		vatTotals = reconcileVatTotals(vatTotals, authoritativeTotalVat);
		totalVat = authoritativeTotalVat;
	}

	return {
		totalExclVat,
		totalInclVat: roundCurrency(totalExclVat + totalVat),
		totalVat,
		vatTotals,
	};
};
