import { ZERO_TAX_CATEGORY_CODES } from "./codes.js";
import type { FacturXInvoice, InvoiceLine, TaxBreakdownEntry } from "./model.js";
import { PROFILE_URNS } from "./profiles.js";
import { roundAmount } from "./numeric.js";

/**
 * EN 16931 totals calculation (BR-CO-10..17): derives per-line net amounts,
 * the VAT breakdown (BG-23) and the document totals (BG-22) from the invoice
 * lines and document-level allowances/charges.
 */

/** Exemption reason attached to a zero-tax category row of the breakdown. */
export interface ExemptionReasonInput {
	categoryCode: string;
	reason?: string;
	/** VATEX code; defaulted per category when omitted (AE, K, G, O). */
	reasonCode?: string;
}

export interface ComputeTotalsOptions {
	/** BT-114 — rounding of the amount due (absorbs cent drift). */
	roundingAmount?: number;
	/** BT-113 — amount already paid. */
	prepaidAmount?: number;
	/** BT-120/BT-121 sources for exempt categories in the breakdown. */
	exemptionReasons?: ExemptionReasonInput[];
	/** ECB-style rate used to express BT-111 when `taxCurrency` is set. */
	taxCurrencyExchangeRate?: number;
}

/** Generation input: an invoice whose computed parts are not yet filled in. */
export type FacturXInvoiceInput = Omit<FacturXInvoice, "taxBreakdown" | "totals">;

const DEFAULT_VATEX_BY_CATEGORY: Record<string, string> = {
	AE: "VATEX-EU-AE",
	K: "VATEX-EU-IC",
	G: "VATEX-EU-G",
	O: "VATEX-EU-O",
};

const isZeroCategory = (categoryCode: string): boolean =>
	ZERO_TAX_CATEGORY_CODES.includes(categoryCode);

/** Rate categories (S, L, M) break down per rate; others group by category. */
const groupKey = (categoryCode: string, rate: number | undefined): string =>
	isZeroCategory(categoryCode) ? categoryCode : `${categoryCode}:${rate ?? 0}`;

const sum = (values: readonly number[]): number =>
	values.reduce((total, value) => total + value, 0);

/** BT-146 from BT-148: gross unit price minus its price discounts. */
const netPriceOf = (line: InvoiceLine): { amount: number; basisQuantity?: number } => {
	if (line.netPrice) return line.netPrice;
	if (!line.grossPrice) {
		throw new Error(
			`Line ${line.id}: either netPrice or grossPrice must be provided.`,
		);
	}
	const allowances = sum(
		(line.grossPrice.allowances ?? []).map((entry) => entry.actualAmount),
	);
	return {
		amount: line.grossPrice.amount - allowances,
		...(line.grossPrice.basisQuantity !== undefined
			? { basisQuantity: line.grossPrice.basisQuantity }
			: {}),
	};
};

/** BT-131 — line net amount, rounded to 2 decimals. */
export const computeLineNetTotal = (line: InvoiceLine): number => {
	const price = netPriceOf(line);
	const basisQuantity = price.basisQuantity ?? 1;
	if (basisQuantity === 0) {
		throw new Error(`Line ${line.id}: price basis quantity must not be zero.`);
	}
	const charges = sum((line.charges ?? []).map((entry) => entry.actualAmount));
	const allowances = sum((line.allowances ?? []).map((entry) => entry.actualAmount));
	return roundAmount(
		(price.amount * line.quantity) / basisQuantity + charges - allowances,
	);
};

/**
 * Compute the VAT breakdown and totals for an invoice. Returns a complete
 * `FacturXInvoice` ready for `buildFacturXXml`: lines carry their `netTotal`
 * and `netPrice`, and `taxBreakdown` / `totals` are filled in. The input is
 * not mutated. `profile` defaults to EN 16931.
 */
export const computeTotals = (
	input: FacturXInvoiceInput,
	options: ComputeTotalsOptions = {},
): FacturXInvoice => {
	const lines = (input.lines ?? []).map((line): InvoiceLine => {
		const netPrice = netPriceOf(line);
		const categoryCode = line.tax.categoryCode;
		const rate = isZeroCategory(categoryCode)
			? 0
			: (line.tax.rateApplicablePercent ?? 0);
		return {
			...line,
			netPrice,
			tax: {
				typeCode: "VAT",
				...line.tax,
				categoryCode,
				rateApplicablePercent: rate,
			},
			netTotal: line.netTotal ?? computeLineNetTotal(line),
		};
	});

	// Group taxable bases by VAT category (and rate for rated categories).
	const groups = new Map<
		string,
		{ categoryCode: string; rate: number; basis: number }
	>();
	const addToGroup = (categoryCode: string, rate: number, amount: number) => {
		const key = groupKey(categoryCode, rate);
		const existing = groups.get(key);
		if (existing) {
			existing.basis += amount;
		} else {
			groups.set(key, { categoryCode, rate, basis: amount });
		}
	};
	for (const line of lines) {
		addToGroup(
			line.tax.categoryCode,
			line.tax.rateApplicablePercent ?? 0,
			line.netTotal ?? 0,
		);
	}
	for (const allowance of input.allowances ?? []) {
		addToGroup(
			allowance.tax.categoryCode,
			isZeroCategory(allowance.tax.categoryCode)
				? 0
				: (allowance.tax.rateApplicablePercent ?? 0),
			-allowance.actualAmount,
		);
	}
	for (const charge of input.charges ?? []) {
		addToGroup(
			charge.tax.categoryCode,
			isZeroCategory(charge.tax.categoryCode)
				? 0
				: (charge.tax.rateApplicablePercent ?? 0),
			charge.actualAmount,
		);
	}

	const taxBreakdown: TaxBreakdownEntry[] = [...groups.values()].map((group) => {
		const basisAmount = roundAmount(group.basis);
		const calculatedAmount =
			group.rate > 0 ? roundAmount((basisAmount * group.rate) / 100) : 0;
		const entry: TaxBreakdownEntry = {
			calculatedAmount,
			typeCode: "VAT",
			basisAmount,
			categoryCode: group.categoryCode,
			rateApplicablePercent: group.rate,
		};
		if (isZeroCategory(group.categoryCode) && group.categoryCode !== "Z") {
			const provided = options.exemptionReasons?.find(
				(reason) => reason.categoryCode === group.categoryCode,
			);
			const reasonCode =
				provided?.reasonCode ?? DEFAULT_VATEX_BY_CATEGORY[group.categoryCode];
			if (provided?.reason !== undefined) entry.exemptionReason = provided.reason;
			if (reasonCode !== undefined) entry.exemptionReasonCode = reasonCode;
		}
		return entry;
	});

	const lineTotal = roundAmount(sum(lines.map((line) => line.netTotal ?? 0)));
	const allowanceTotal = roundAmount(
		sum((input.allowances ?? []).map((entry) => entry.actualAmount)),
	);
	const chargeTotal = roundAmount(
		sum((input.charges ?? []).map((entry) => entry.actualAmount)),
	);
	const taxBasisTotal = roundAmount(lineTotal - allowanceTotal + chargeTotal);
	const taxTotal = roundAmount(
		sum(taxBreakdown.map((entry) => entry.calculatedAmount)),
	);
	const grandTotal = roundAmount(taxBasisTotal + taxTotal);
	const roundingAmount = options.roundingAmount;
	const prepaidAmount = options.prepaidAmount;
	// BR-CO-16: BT-115 = BT-112 − BT-113 + BT-114.
	const duePayable = roundAmount(
		grandTotal - (prepaidAmount ?? 0) + (roundingAmount ?? 0),
	);

	return {
		...input,
		profile: input.profile ?? PROFILE_URNS.en16931,
		lines,
		taxBreakdown,
		totals: {
			lineTotal,
			...(input.charges?.length ? { chargeTotal } : {}),
			...(input.allowances?.length ? { allowanceTotal } : {}),
			taxBasisTotal,
			taxTotal,
			...(input.taxCurrency && options.taxCurrencyExchangeRate !== undefined
				? {
						taxTotalInTaxCurrency: roundAmount(
							taxTotal * options.taxCurrencyExchangeRate,
						),
					}
				: {}),
			...(roundingAmount !== undefined ? { roundingAmount } : {}),
			grandTotal,
			...(prepaidAmount !== undefined ? { prepaidAmount } : {}),
			duePayable,
		},
	};
};
