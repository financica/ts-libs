import { describe, expect, it } from "vitest";
import { adjustForInclusiveTax } from "../src/tax.js";

// Lives apart from tax.test.ts (which covers detectStripeTaxInclusive) because
// this is arithmetic on amounts rather than flag reading.
describe("adjustForInclusiveTax", () => {
	it("backs the tax out of the subtotal and of every line", () => {
		// 1200 EUR gross at 21% inclusive: tax = 1200 × 21/121 = 208.26,
		// net = 991.74, over 6 units = 165.29 each.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 1200,
			taxTotal: 208.26,
			lineItems: [
				{ amount: 1200, quantity: 6, unit_amount: 200, tax_amount: 208.26 },
			],
		});

		expect(result).toEqual({
			subtotal: 991.74,
			lineItems: [
				{
					amount: 991.74,
					quantity: 6,
					unit_amount: 165.29,
					tax_amount: 208.26,
				},
			],
		});
	});

	it("uses each line's own tax, not a share of the total", () => {
		// Two lines carrying the same 210 tax but different quantities: the net
		// per line is identical, the unit price is not.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 2420,
			taxTotal: 420,
			lineItems: [
				{ amount: 1210, quantity: 1, unit_amount: 1210, tax_amount: 210 },
				{ amount: 1210, quantity: 2, unit_amount: 605, tax_amount: 210 },
			],
		});

		expect(result.subtotal).toBe(2000);
		expect(result.lineItems).toEqual([
			{ amount: 1000, quantity: 1, unit_amount: 1000, tax_amount: 210 },
			{ amount: 1000, quantity: 2, unit_amount: 500, tax_amount: 210 },
		]);
	});

	it.each([
		["exclusive", false as const],
		["unknown", null],
	])("passes the values through untouched when tax is %s", (_label, taxInclusive) => {
		// `null` is the tri-state detectStripeTaxInclusive returns when the payload
		// carries no tax entries. Treating it as inclusive would subtract a tax
		// total nobody confirmed.
		const lineItems = [
			{ amount: 1000, quantity: 2, unit_amount: 500, tax_amount: 210 },
		];
		const result = adjustForInclusiveTax({
			taxInclusive,
			subtotal: 1000,
			taxTotal: 210,
			lineItems,
		});

		expect(result.subtotal).toBe(1000);
		// Not merely equal: the untouched path hands back the very same array.
		expect(result.lineItems).toBe(lineItems);
	});

	it("treats a null tax_amount as no tax on that line", () => {
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 100,
			taxTotal: 0,
			lineItems: [
				{ amount: 100, quantity: 1, unit_amount: 100, tax_amount: null },
			],
		});

		expect(result.subtotal).toBe(100);
		expect(result.lineItems[0]).toEqual({
			amount: 100,
			quantity: 1,
			unit_amount: 100,
			tax_amount: null,
		});
	});

	it("reads quantity 0 as one unit", () => {
		// Stripe sends quantity 0 for flat-fee tier components. Dividing the net by
		// it would give Infinity for unit_amount.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 4200,
			taxTotal: 0,
			lineItems: [
				{ amount: 4200, quantity: 0, unit_amount: 4200, tax_amount: null },
			],
		});

		expect(result.lineItems[0]).toMatchObject({
			amount: 4200,
			quantity: 1,
			unit_amount: 4200,
		});
		expect(Number.isFinite(result.lineItems[0]?.unit_amount)).toBe(true);
	});

	it("keeps credit-note lines negative", () => {
		// A credit note's amounts are negative on both sides; backing out the tax
		// must not flip a sign or leave a -0 behind.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: -121,
			taxTotal: -21,
			lineItems: [
				{ amount: -121, quantity: 1, unit_amount: -121, tax_amount: -21 },
			],
		});

		expect(result.subtotal).toBe(-100);
		expect(result.lineItems[0]).toMatchObject({ amount: -100, unit_amount: -100 });
	});

	it("normalises -0 to 0", () => {
		// `amount - tax_amount` on a fully-taxed zero line yields -0, which equals 0
		// but serialises as "-0" into stored JSON.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: -0,
			taxTotal: 0,
			lineItems: [{ amount: -0, quantity: 1, unit_amount: 0, tax_amount: 0 }],
		});

		expect(Object.is(result.subtotal, -0)).toBe(false);
		expect(Object.is(result.lineItems[0]?.amount, -0)).toBe(false);
		expect(Object.is(result.lineItems[0]?.unit_amount, -0)).toBe(false);
	});

	it("absorbs binary-float error from the subtraction and division", () => {
		// 100.3 - 17.4 is 82.89999999999999 in IEEE 754.
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 100.3,
			taxTotal: 17.4,
			lineItems: [
				{ amount: 100.3, quantity: 3, unit_amount: 33.4333, tax_amount: 17.4 },
			],
		});

		expect(result.subtotal).toBe(82.9);
		expect(result.lineItems[0]).toMatchObject({
			amount: 82.9,
			unit_amount: 27.6333,
		});
	});

	it("preserves fields it does not own and does not mutate the input", () => {
		const lineItems = [
			{
				amount: 121,
				quantity: 1,
				unit_amount: 121,
				tax_amount: 21,
				description: "Consulting",
			},
		];
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 121,
			taxTotal: 21,
			lineItems,
		});

		expect(result.lineItems[0]?.description).toBe("Consulting");
		expect(lineItems[0]).toMatchObject({ amount: 121, unit_amount: 121 });
	});

	it("returns an empty line list unchanged while still netting the subtotal", () => {
		const result = adjustForInclusiveTax({
			taxInclusive: true,
			subtotal: 121,
			taxTotal: 21,
			lineItems: [],
		});

		expect(result).toEqual({ subtotal: 100, lineItems: [] });
	});
});
