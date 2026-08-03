import { describe, expect, it } from "vitest";
import { detectStripeTaxInclusive } from "../src/tax.js";

describe("detectStripeTaxInclusive", () => {
	it("returns true when all invoice-level tax amounts are inclusive", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [
					{ amount: 2100, inclusive: true },
					{ amount: 600, inclusive: true },
				],
			}),
		).toBe(true);
	});

	it("returns false when invoice-level tax amounts are exclusive", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [{ amount: 2100, inclusive: false }],
			}),
		).toBe(false);
	});

	it("returns false when mix of inclusive and exclusive tax amounts", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [
					{ amount: 2100, inclusive: true },
					{ amount: 600, inclusive: false },
				],
			}),
		).toBe(false);
	});

	it("ignores zero-amount tax entries and falls back to line items", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [{ amount: 0, inclusive: false }],
				lines: {
					data: [
						{
							tax_amounts: [{ amount: 2100, inclusive: true }],
						},
					],
				},
			}),
		).toBe(true);
	});

	it("falls back to line-item tax amounts when no invoice-level entries", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [],
				lines: {
					data: [
						{
							tax_amounts: [{ amount: 1050, inclusive: true }],
						},
						{
							tax_amounts: [{ amount: 525, inclusive: true }],
						},
					],
				},
			}),
		).toBe(true);
	});

	it("returns false from line items when any are exclusive", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [],
				lines: {
					data: [
						{
							tax_amounts: [{ amount: 1050, inclusive: true }],
						},
						{
							tax_amounts: [{ amount: 525, inclusive: false }],
						},
					],
				},
			}),
		).toBe(false);
	});

	it("returns null when no tax amounts exist at all", () => {
		expect(detectStripeTaxInclusive({})).toBeNull();
		expect(
			detectStripeTaxInclusive({ total_tax_amounts: [], lines: { data: [] } }),
		).toBeNull();
	});

	it("returns null when tax amounts are all zero", () => {
		expect(
			detectStripeTaxInclusive({
				total_tax_amounts: [{ amount: 0, inclusive: false }],
				lines: { data: [] },
			}),
		).toBeNull();
	});
});
