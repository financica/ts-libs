import { roundCurrency } from "./numeric";
import type {
	UblLine,
	UblMonetaryTotal,
	UblTaxCategory,
	UblTaxSubtotal,
	UblTaxTotal,
} from "./ubl/types";

/**
 * Adjust the largest line's net amount so the line nets sum to the
 * authoritative document total (e.g. Stripe's `invoice.total_excluding_tax`).
 *
 * Reconciling at the *line* level — rather than directly on the VAT breakdown —
 * keeps the document consistent bottom-up: the VAT category taxable amounts
 * (BR-S-08) and the line-extension total (BR-CO-13) both still derive from the
 * lines. Discrepancies here are sub-cent rounding or a distributed invoice-level
 * coupon; larger ones indicate a real upstream data problem.
 */
export const reconcileLinesToExclTotal = (
	lines: UblLine[],
	authoritativeTotalExclVat: number,
): UblLine[] => {
	if (lines.length === 0) return lines;
	const computed = roundCurrency(
		lines.reduce((sum, line) => sum + line.lineExtensionAmount, 0),
	);
	const diff = roundCurrency(authoritativeTotalExclVat - computed);
	if (diff === 0) return lines;

	const largestIdx = lines.reduce(
		(maxIdx, line, idx, arr) =>
			line.lineExtensionAmount > (arr[maxIdx]?.lineExtensionAmount ?? 0)
				? idx
				: maxIdx,
		0,
	);

	return lines.map((line, idx) => {
		if (idx !== largestIdx) return line;
		const adjusted = roundCurrency(line.lineExtensionAmount + diff);
		return {
			...line,
			lineExtensionAmount: adjusted,
			priceAmount: roundCurrency(adjusted / Math.max(line.quantity, 1)),
		};
	});
};

const categoryKey = (category: UblTaxCategory): string =>
	`${category.id}:${category.percent}`;

export interface BuildTaxTotalsResult {
	taxTotal: UblTaxTotal;
	monetaryTotal: UblMonetaryTotal;
}

/**
 * Group lines by `(category, percent)` into a VAT breakdown and compute the
 * document monetary totals.
 *
 * Each VAT category's tax amount is **derived** as `taxable × percent / 100`,
 * rounded to two decimals (EN 16931 BR-CO-17), rather than summed from the
 * upstream per-line tax cents. This guarantees the breakdown is internally
 * consistent and passes validation; it can differ by a cent from the figure a
 * payment processor reported, which is an unavoidable artifact of representing
 * a cents-rounded system as a rate-based VAT breakdown.
 */
export const buildTaxTotals = (lines: UblLine[]): BuildTaxTotalsResult => {
	const groups = new Map<
		string,
		{ category: UblTaxCategory; taxableAmount: number }
	>();

	for (const line of lines) {
		const key = categoryKey(line.taxCategory);
		const current = groups.get(key) ?? {
			category: line.taxCategory,
			taxableAmount: 0,
		};
		current.taxableAmount = roundCurrency(
			current.taxableAmount + line.lineExtensionAmount,
		);
		groups.set(key, current);
	}

	const subtotals: UblTaxSubtotal[] = Array.from(groups.values()).map((group) => ({
		taxableAmount: group.taxableAmount,
		taxAmount: roundCurrency((group.taxableAmount * group.category.percent) / 100),
		category: group.category,
	}));

	const lineExtensionAmount = roundCurrency(
		lines.reduce((sum, line) => sum + line.lineExtensionAmount, 0),
	);
	const taxAmount = roundCurrency(
		subtotals.reduce((sum, subtotal) => sum + subtotal.taxAmount, 0),
	);
	const taxInclusiveAmount = roundCurrency(lineExtensionAmount + taxAmount);

	return {
		taxTotal: { taxAmount, subtotals },
		monetaryTotal: {
			lineExtensionAmount,
			taxExclusiveAmount: lineExtensionAmount,
			taxInclusiveAmount,
			payableAmount: taxInclusiveAmount,
		},
	};
};
