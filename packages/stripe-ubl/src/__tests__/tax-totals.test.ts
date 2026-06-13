import { describe, expect, it } from "vitest";
import { buildTaxTotals, reconcileLinesToExclTotal } from "../tax-totals";
import type { UblLine } from "../ubl/types";

const line = (overrides: Partial<UblLine> = {}): UblLine => ({
	id: "1",
	name: "Item",
	quantity: 1,
	unitCode: "C62",
	lineExtensionAmount: 100,
	priceAmount: 100,
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
			line({ lineExtensionAmount: 500.5, priceAmount: 500.5 }),
		]);
		expect(taxTotal.taxAmount).toBe(105.11);
		expect(monetaryTotal.taxInclusiveAmount).toBe(605.61);
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
