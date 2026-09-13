import { UblBuildError } from "../errors";
import type {
	UblAllowanceCharge,
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
	/**
	 * Document-level allowances and charges (BG-20/BG-21). Each one joins the
	 * VAT breakdown of its own category (BR-S-08: taxable = line nets −
	 * allowances + charges) and feeds BT-107/BT-108, so BT-109 is
	 * BT-106 − BT-107 + BT-108 (BR-CO-13). Put the same array on the document.
	 */
	allowanceCharges?: UblAllowanceCharge[];
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
 * @throws {UblBuildError} for a line, allowance or charge without a
 * `taxCategory` — there is no VAT breakdown to put it in.
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
	const allowanceCharges = options?.allowanceCharges ?? [];
	for (const [index, item] of allowanceCharges.entries()) {
		if (!item.taxCategory) {
			throw new UblBuildError(
				`allowanceCharges[${index}] has no taxCategory (BT-95/BT-102); cannot build the VAT breakdown`,
			);
		}
		const key = categoryKey(item.taxCategory);
		const current = groups.get(key) ?? {
			category: item.taxCategory,
			taxableAmount: 0,
		};
		const signed = item.chargeIndicator ? (item.amount ?? 0) : -(item.amount ?? 0);
		current.taxableAmount = roundCurrency(current.taxableAmount + signed);
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
	const allowanceTotalAmount = roundCurrency(
		allowanceCharges
			.filter((item) => !item.chargeIndicator)
			.reduce((sum, item) => sum + (item.amount ?? 0), 0),
	);
	const chargeTotalAmount = roundCurrency(
		allowanceCharges
			.filter((item) => item.chargeIndicator)
			.reduce((sum, item) => sum + (item.amount ?? 0), 0),
	);
	const taxExclusiveAmount = roundCurrency(
		lineExtensionAmount - allowanceTotalAmount + chargeTotalAmount,
	);
	const taxInclusiveAmount = roundCurrency(taxExclusiveAmount + taxAmount);

	const prepaidAmount = roundCurrency(options?.prepaidAmount ?? 0);
	const payableRoundingAmount = roundCurrency(options?.payableRoundingAmount ?? 0);
	const payableAmount = roundCurrency(
		taxInclusiveAmount - prepaidAmount + payableRoundingAmount,
	);

	return {
		taxTotal: { taxAmount, subtotals },
		monetaryTotal: {
			lineExtensionAmount,
			taxExclusiveAmount,
			taxInclusiveAmount,
			...(allowanceTotalAmount ? { allowanceTotalAmount } : {}),
			...(chargeTotalAmount ? { chargeTotalAmount } : {}),
			...(prepaidAmount ? { prepaidAmount } : {}),
			...(payableRoundingAmount ? { payableRoundingAmount } : {}),
			payableAmount,
		},
	};
};

/**
 * Split one document-level amount into an allowance or charge per VAT
 * category the lines use, pro rata by each category's line nets, so a
 * shipping charge or an invoice-wide discount on a mixed-rate invoice lands in
 * the right VAT subtotals (an ancillary cost follows the supply it belongs to).
 * Cent remainders go to the largest shares so the parts sum to `amount`
 * exactly; categories that receive nothing are omitted. With no positive
 * line net at all the whole amount goes to the first line's category.
 *
 * @throws {UblBuildError} for a line without a `taxCategory`.
 */
export const allocateAcrossTaxCategories = (
	amount: number,
	lines: UblLine[],
	template: Pick<UblAllowanceCharge, "chargeIndicator" | "reason" | "reasonCode">,
): UblAllowanceCharge[] => {
	const groups = new Map<string, { category: UblTaxCategory; net: number }>();
	for (const line of lines) {
		if (!line.taxCategory) {
			throw new UblBuildError(
				`Line ${line.id} has no taxCategory (BT-151); cannot allocate across categories`,
			);
		}
		const key = categoryKey(line.taxCategory);
		const current = groups.get(key) ?? { category: line.taxCategory, net: 0 };
		current.net = roundCurrency(current.net + Math.max(0, lineNet(line)));
		groups.set(key, current);
	}
	const entries = Array.from(groups.values());
	const total = roundCurrency(amount);
	if (entries.length === 0 || total === 0) return [];
	const netSum = entries.reduce((sum, entry) => sum + entry.net, 0);
	const shares =
		netSum > 0
			? entries.map((entry) => (total * entry.net) / netSum)
			: entries.map((_entry, index) => (index === 0 ? total : 0));
	const cents = shares.map((share) => Math.floor(share * 100 + 1e-9));
	let remainder =
		Math.round(total * 100) - cents.reduce((sum, value) => sum + value, 0);
	const order = shares
		.map((share, index) => ({
			index,
			fraction: share * 100 - Math.floor(share * 100 + 1e-9),
		}))
		.sort((a, b) => b.fraction - a.fraction);
	for (const { index } of order) {
		if (remainder <= 0) break;
		cents[index] = (cents[index] ?? 0) + 1;
		remainder -= 1;
	}
	return entries.flatMap((entry, index) => {
		const value = (cents[index] ?? 0) / 100;
		if (value === 0) return [];
		return [compact({ ...template, amount: value, taxCategory: entry.category })];
	});
};
