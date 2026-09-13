import { describe, expect, it } from "vitest";
import {
	allocateAcrossTaxCategories,
	buildTaxTotals,
	reconcileLinesToExclTotal,
	type UblLine,
} from "../src/build/index.js";

const line = (overrides: Partial<UblLine> = {}): UblLine => ({
	id: "1",
	description: "Item",
	quantity: 1,
	unitCode: "C62",
	lineExtensionAmount: 100,
	unitPrice: 100,
	taxCategory: { id: "S", percent: 21 },
	...overrides,
});

describe("buildTaxTotals", () => {
	it("groups lines by (category, percent) and derives the VAT per group", () => {
		const { taxTotal, monetaryTotal } = buildTaxTotals([
			line({
				id: "1",
				lineExtensionAmount: 100,
				taxCategory: { id: "S", percent: 21 },
			}),
			line({
				id: "2",
				lineExtensionAmount: 50,
				taxCategory: { id: "S", percent: 21 },
			}),
			line({
				id: "3",
				lineExtensionAmount: 200,
				taxCategory: { id: "Z", percent: 0 },
			}),
		]);

		expect(taxTotal.subtotals).toHaveLength(2);
		expect(taxTotal.subtotals[0]).toEqual({
			taxableAmount: 150,
			taxAmount: 31.5,
			category: { id: "S", percent: 21 },
		});
		expect(taxTotal.subtotals[1]).toEqual({
			taxableAmount: 200,
			taxAmount: 0,
			category: { id: "Z", percent: 0 },
		});
		expect(taxTotal.taxAmount).toBe(31.5);
		expect(monetaryTotal.lineExtensionAmount).toBe(350);
		expect(monetaryTotal.taxExclusiveAmount).toBe(350);
		expect(monetaryTotal.taxInclusiveAmount).toBe(381.5);
		expect(monetaryTotal.payableAmount).toBe(381.5);
	});

	it("derives the VAT amount from taxable × rate (BR-CO-17), not summed cents", () => {
		// 500.50 @ 21% = 105.105, which rounds up to 105.11. A cents-summed
		// figure of 105.10 would fail BR-CO-17; we emit the derived value.
		const { taxTotal, monetaryTotal } = buildTaxTotals([
			line({ lineExtensionAmount: 500.5, unitPrice: 500.5 }),
		]);
		expect(taxTotal.taxAmount).toBe(105.11);
		expect(monetaryTotal.taxInclusiveAmount).toBe(605.61);
	});

	it("omits BT-113/BT-114 and leaves BT-115 gross when no options are given", () => {
		const { monetaryTotal } = buildTaxTotals([line()]);
		expect(monetaryTotal.prepaidAmount).toBeUndefined();
		expect(monetaryTotal.payableRoundingAmount).toBeUndefined();
		expect(monetaryTotal.payableAmount).toBe(monetaryTotal.taxInclusiveAmount);
	});

	it("subtracts a gross prepayment from the payable amount (BR-CO-16)", () => {
		const { monetaryTotal } = buildTaxTotals([line()], { prepaidAmount: 50 });
		expect(monetaryTotal.taxInclusiveAmount).toBe(121);
		expect(monetaryTotal.prepaidAmount).toBe(50);
		expect(monetaryTotal.payableAmount).toBe(71);
	});

	it("reports nothing outstanding for a fully settled document", () => {
		const { monetaryTotal } = buildTaxTotals([line()], { prepaidAmount: 121 });
		expect(monetaryTotal.payableAmount).toBe(0);
	});

	it("adds the rounding amount (BT-114)", () => {
		const { monetaryTotal } = buildTaxTotals(
			[line({ lineExtensionAmount: 100.5 })],
			{
				payableRoundingAmount: 0.03,
			},
		);
		// 100.50 + 21.11 VAT = 121.61, + 0.03 rounding.
		expect(monetaryTotal.taxInclusiveAmount).toBe(121.61);
		expect(monetaryTotal.payableRoundingAmount).toBe(0.03);
		expect(monetaryTotal.payableAmount).toBe(121.64);
	});

	it("does not clamp an overpayment — a negative payable surfaces the error", () => {
		const { monetaryTotal } = buildTaxTotals([line()], { prepaidAmount: 200 });
		expect(monetaryTotal.payableAmount).toBe(-79);
	});

	it("treats a zero prepayment as absent", () => {
		const { monetaryTotal } = buildTaxTotals([line()], {
			prepaidAmount: 0,
			payableRoundingAmount: 0,
		});
		expect(monetaryTotal.prepaidAmount).toBeUndefined();
		expect(monetaryTotal.payableRoundingAmount).toBeUndefined();
		expect(monetaryTotal.payableAmount).toBe(121);
	});
});

describe("reconcileLinesToExclTotal", () => {
	it("pushes a sub-cent difference into the largest line", () => {
		const reconciled = reconcileLinesToExclTotal(
			[
				line({ id: "1", lineExtensionAmount: 100 }),
				line({ id: "2", lineExtensionAmount: 50 }),
			],
			149.99,
		);
		expect(reconciled[0]?.lineExtensionAmount).toBe(99.99);
		expect(reconciled[1]?.lineExtensionAmount).toBe(50);
		// The VAT breakdown then derives from the reconciled lines.
		const { monetaryTotal } = buildTaxTotals(reconciled);
		expect(monetaryTotal.taxExclusiveAmount).toBe(149.99);
	});

	it("is a no-op when the lines already sum to the total", () => {
		const lines = [line({ lineExtensionAmount: 100 })];
		expect(reconcileLinesToExclTotal(lines, 100)).toBe(lines);
	});
});

describe("buildTaxTotals with document allowances and charges", () => {
	const standard = { id: "S", percent: 21 };
	const reduced = { id: "S", percent: 6 };

	it("folds each item into its own category and derives BT-107/BT-108/BT-109", () => {
		const { taxTotal, monetaryTotal } = buildTaxTotals(
			[
				line({ id: "1", lineExtensionAmount: 100, taxCategory: standard }),
				line({ id: "2", lineExtensionAmount: 50, taxCategory: reduced }),
			],
			{
				allowanceCharges: [
					{
						chargeIndicator: false,
						amount: 10,
						reason: "Discount",
						taxCategory: standard,
					},
					{
						chargeIndicator: true,
						amount: 5,
						reason: "Shipping",
						taxCategory: reduced,
					},
				],
			},
		);
		expect(taxTotal.subtotals).toEqual([
			{ taxableAmount: 90, taxAmount: 18.9, category: standard },
			{ taxableAmount: 55, taxAmount: 3.3, category: reduced },
		]);
		expect(taxTotal.taxAmount).toBe(22.2);
		expect(monetaryTotal).toEqual({
			lineExtensionAmount: 150,
			taxExclusiveAmount: 145,
			taxInclusiveAmount: 167.2,
			allowanceTotalAmount: 10,
			chargeTotalAmount: 5,
			payableAmount: 167.2,
		});
	});

	it("opens a VAT category the lines do not use when a charge carries one", () => {
		const { taxTotal } = buildTaxTotals([line()], {
			allowanceCharges: [
				{
					chargeIndicator: true,
					amount: 5,
					reason: "Fee",
					taxCategory: reduced,
				},
			],
		});
		expect(taxTotal.subtotals.map((subtotal) => subtotal.taxableAmount)).toEqual([
			100, 5,
		]);
	});

	it("throws for an item without a VAT category", () => {
		expect(() =>
			buildTaxTotals([line()], {
				allowanceCharges: [{ chargeIndicator: true, amount: 5, reason: "Fee" }],
			}),
		).toThrow(/allowanceCharges\[0\]/);
	});
});

describe("allocateAcrossTaxCategories", () => {
	const lines = [
		line({
			id: "1",
			lineExtensionAmount: 100,
			taxCategory: { id: "S", percent: 21 },
		}),
		line({
			id: "2",
			lineExtensionAmount: 50,
			taxCategory: { id: "S", percent: 6 },
		}),
		line({
			id: "3",
			lineExtensionAmount: 50,
			taxCategory: { id: "S", percent: 21 },
		}),
	];

	it("splits pro rata by category and sums exactly to the amount", () => {
		const parts = allocateAcrossTaxCategories(10, lines, {
			chargeIndicator: true,
			reason: "Shipping",
			reasonCode: "FC",
		});
		expect(parts).toEqual([
			{
				chargeIndicator: true,
				reason: "Shipping",
				reasonCode: "FC",
				amount: 7.5,
				taxCategory: { id: "S", percent: 21 },
			},
			{
				chargeIndicator: true,
				reason: "Shipping",
				reasonCode: "FC",
				amount: 2.5,
				taxCategory: { id: "S", percent: 6 },
			},
		]);
	});

	it("gives the cent remainder to the largest fractional share", () => {
		const parts = allocateAcrossTaxCategories(0.11, lines, {
			chargeIndicator: true,
			reason: "x",
		});
		expect(parts.map((part) => part.amount)).toEqual([0.08, 0.03]);
		expect(parts.reduce((sum, part) => sum + (part.amount ?? 0), 0)).toBeCloseTo(
			0.11,
			10,
		);
	});

	it("omits categories that receive nothing and uses the first when no line has a positive net", () => {
		expect(
			allocateAcrossTaxCategories(0.01, lines, {
				chargeIndicator: false,
				reason: "x",
			}).map((part) => part.taxCategory?.percent),
		).toEqual([21]);
		const zero = [
			line({
				id: "1",
				lineExtensionAmount: 0,
				taxCategory: { id: "S", percent: 21 },
			}),
		];
		expect(
			allocateAcrossTaxCategories(5, zero, {
				chargeIndicator: true,
				reason: "x",
			}),
		).toEqual([
			{
				chargeIndicator: true,
				reason: "x",
				amount: 5,
				taxCategory: { id: "S", percent: 21 },
			},
		]);
		expect(
			allocateAcrossTaxCategories(0, lines, {
				chargeIndicator: true,
				reason: "x",
			}),
		).toEqual([]);
	});

	it("throws for a line without a VAT category", () => {
		expect(() =>
			allocateAcrossTaxCategories(1, [line({ taxCategory: undefined })], {
				chargeIndicator: true,
				reason: "x",
			}),
		).toThrow(/taxCategory/);
	});
});
