import { UblBuildError } from "../errors";
import type {
	UblLine,
	UblMonetaryTotal,
	UblTaxCategory,
	UblTaxSubtotal,
	UblTaxTotal,
} from "../types";
import { deriveUnitPrice, roundCurrency } from "./numeric";
import { compact } from "./utils";

const lineNet = (line: UblLine): number => line.lineExtensionAmount ?? 0;

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
	const computed = roundCurrency(lines.reduce((sum, line) => sum + lineNet(line), 0));
	const diff = roundCurrency(authoritativeTotalExclVat - computed);
	if (diff === 0) return lines;

	const largestIdx = lines.reduce(
		(maxIdx, line, idx, arr) =>
			lineNet(line) > lineNet(arr[maxIdx] ?? line) ? idx : maxIdx,
		0,
	);

	return lines.map((line, idx) => {
		if (idx !== largestIdx) return line;
		const adjusted = roundCurrency(lineNet(line) + diff);
		// Re-derive the price from the adjusted net through the shared helper —
		// nudging the net without re-deriving BT-146/BT-149 to match is exactly
		// what PEPPOL-EN16931-R120 rejects. Assign `baseQuantity` unconditionally
		// so a line that no longer needs one doesn't keep a stale value.
		const { unitPrice, baseQuantity } = deriveUnitPrice(
			adjusted,
			line.quantity ?? 0,
		);
		return compact({
			...line,
			lineExtensionAmount: adjusted,
			unitPrice,
			baseQuantity,
		});
	});
};

const categoryKey = (category: UblTaxCategory): string =>
	`${category.id ?? ""}:${category.percent ?? ""}`;

export interface BuildTaxTotalsResult {
	taxTotal: UblTaxTotal;
	monetaryTotal: UblMonetaryTotal;
}

export interface BuildTaxTotalsOptions {
	/**
	 * BT-113 — amount already paid, **gross (VAT-inclusive)**. Subtracted from
	 * BT-112 to derive the outstanding `payableAmount` (BR-CO-16). Pass the full
	 * gross total for a settled document so it reports a payable amount of 0.
	 */
	prepaidAmount?: number;
	/** BT-114 — rounding applied to the payable amount. */
	payableRoundingAmount?: number;
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
 *
 * `payableAmount` is derived per BR-CO-16 (`BT-112 − BT-113 + BT-114`) so the
 * invariant holds by construction. The result is *not* clamped: a prepayment
 * exceeding the total yields a negative payable amount, surfacing the upstream
 * overpayment rather than hiding it.
 *
 * @throws {UblBuildError} for a line without a `taxCategory` — there is no
 * VAT breakdown to put it in.
 */
export const buildTaxTotals = (
	lines: UblLine[],
	options?: BuildTaxTotalsOptions,
): BuildTaxTotalsResult => {
	const groups = new Map<
		string,
		{ category: UblTaxCategory; taxableAmount: number }
	>();

	for (const line of lines) {
		if (!line.taxCategory) {
			throw new UblBuildError(
				`Line ${line.id} has no taxCategory (BT-151); cannot build the VAT breakdown`,
			);
		}
		const key = categoryKey(line.taxCategory);
		const current = groups.get(key) ?? {
			category: line.taxCategory,
			taxableAmount: 0,
		};
		current.taxableAmount = roundCurrency(current.taxableAmount + lineNet(line));
		groups.set(key, current);
	}

	const subtotals: UblTaxSubtotal[] = Array.from(groups.values()).map((group) => ({
		taxableAmount: group.taxableAmount,
		taxAmount: roundCurrency(
			(group.taxableAmount * (group.category.percent ?? 0)) / 100,
		),
		category: group.category,
	}));

	const lineExtensionAmount = roundCurrency(
		lines.reduce((sum, line) => sum + lineNet(line), 0),
	);
	const taxAmount = roundCurrency(
		subtotals.reduce((sum, subtotal) => sum + (subtotal.taxAmount ?? 0), 0),
	);
	const taxInclusiveAmount = roundCurrency(lineExtensionAmount + taxAmount);

	const prepaidAmount = roundCurrency(options?.prepaidAmount ?? 0);
	const payableRoundingAmount = roundCurrency(options?.payableRoundingAmount ?? 0);
	const payableAmount = roundCurrency(
		taxInclusiveAmount - prepaidAmount + payableRoundingAmount,
	);

	return {
		taxTotal: { taxAmount, subtotals },
		monetaryTotal: {
			lineExtensionAmount,
			taxExclusiveAmount: lineExtensionAmount,
			taxInclusiveAmount,
			...(prepaidAmount ? { prepaidAmount } : {}),
			...(payableRoundingAmount ? { payableRoundingAmount } : {}),
			payableAmount,
		},
	};
};
