import { describe, expect, it } from "vitest";
import { buildVatTotals } from "../vat-totals";

describe("buildVatTotals", () => {
	it("groups lines by (vatType, vatPercentage)", () => {
		const result = buildVatTotals([
			{
				lineNumber: "1",
				itemName: "A",
				quantity: 1,
				unitType: 1,
				itemExclVat: 100,
				vatType: 1,
				vatPercentage: 21,
				totalDiscountExclVat: 0,
				totalExclVat: 100,
			},
			{
				lineNumber: "2",
				itemName: "B",
				quantity: 1,
				unitType: 1,
				itemExclVat: 50,
				vatType: 1,
				vatPercentage: 21,
				totalDiscountExclVat: 0,
				totalExclVat: 50,
			},
			{
				lineNumber: "3",
				itemName: "C",
				quantity: 1,
				unitType: 1,
				itemExclVat: 200,
				vatType: 2,
				vatPercentage: 0,
				totalDiscountExclVat: 0,
				totalExclVat: 200,
			},
		]);

		expect(result.vatTotals).toHaveLength(2);
		expect(result.vatTotals[0]).toEqual({
			vatType: 1,
			vatPercentage: 21,
			totalExclVat: 150,
			totalVat: 31.5,
			totalInclVat: 181.5,
		});
		expect(result.vatTotals[1]).toEqual({
			vatType: 2,
			vatPercentage: 0,
			totalExclVat: 200,
			totalVat: 0,
			totalInclVat: 200,
		});
	});

	it("reconciles to the authoritative excl-VAT total", () => {
		// Line totals 100 + 50 = 150, but the Stripe header says 149.99 (e.g. due to a
		// distributed coupon). Reconcile pushes the diff to the largest VAT group.
		const result = buildVatTotals(
			[
				{
					lineNumber: "1",
					itemName: "A",
					quantity: 1,
					unitType: 1,
					itemExclVat: 100,
					vatType: 1,
					vatPercentage: 21,
					totalDiscountExclVat: 0,
					totalExclVat: 100,
				},
				{
					lineNumber: "2",
					itemName: "B",
					quantity: 1,
					unitType: 1,
					itemExclVat: 50,
					vatType: 1,
					vatPercentage: 21,
					totalDiscountExclVat: 0,
					totalExclVat: 50,
				},
			],
			149.99,
		);

		expect(result.totalExclVat).toBe(149.99);
		// Both lines share the same VAT group, which absorbs the -0.01 diff.
		expect(result.vatTotals[0]?.totalExclVat).toBe(149.99);
	});

	it("reconciles to the authoritative VAT total", () => {
		const result = buildVatTotals(
			[
				{
					lineNumber: "1",
					itemName: "A",
					quantity: 1,
					unitType: 1,
					itemExclVat: 100,
					vatType: 1,
					vatPercentage: 21,
					totalDiscountExclVat: 0,
					totalExclVat: 100,
				},
			],
			null,
			21.05,
		);

		expect(result.totalVat).toBe(21.05);
		expect(result.vatTotals[0]?.totalVat).toBe(21.05);
		expect(result.vatTotals[0]?.totalInclVat).toBe(121.05);
	});
});
