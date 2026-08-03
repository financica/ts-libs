import { describe, expect, it } from "vitest";
import {
	fromStripeMinorUnits,
	isStripeZeroDecimalCurrency,
	stripeMinorUnitDivisor,
	toStripeMinorUnits,
} from "../src/minor-units.js";

/** What `Intl` (and therefore ISO 4217) reports, for the divergence tests. */
const isoDigits = (currency: string): number =>
	new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
		.maximumFractionDigits ?? 2;

describe("stripeMinorUnitDivisor", () => {
	it.each([
		["JPY", 1],
		["KRW", 1],
		["XOF", 1],
		["EUR", 100],
		["USD", 100],
		["GBP", 100],
	])("classifies %s with divisor %i", (currency, divisor) => {
		expect(stripeMinorUnitDivisor(currency)).toBe(divisor);
	});

	it("is case-insensitive", () => {
		expect(stripeMinorUnitDivisor("jpy")).toBe(1);
		expect(stripeMinorUnitDivisor("eur")).toBe(100);
	});

	// The whole reason this table is hand-maintained instead of read from
	// ISO 4217. Each of these reads as zero-decimal via Intl, and following
	// Intl here is a 100x error on real money.
	it.each(["UGX", "ISK", "HUF"])(
		"treats %s as two-decimal even though ISO/Intl calls it zero-decimal",
		(currency) => {
			expect(isoDigits(currency)).toBe(0);
			expect(stripeMinorUnitDivisor(currency)).toBe(100);
			expect(isStripeZeroDecimalCurrency(currency)).toBe(false);
		},
	);
});

describe("fromStripeMinorUnits", () => {
	it("divides two-decimal currencies", () => {
		expect(fromStripeMinorUnits(1234, "EUR")).toBe(12.34);
	});

	it("passes zero-decimal currencies through", () => {
		expect(fromStripeMinorUnits(500, "JPY")).toBe(500);
	});

	it("reads UGX in its two-decimal form", () => {
		// Stripe sends 500 to mean 5 UGX, not 500 UGX.
		expect(fromStripeMinorUnits(500, "UGX")).toBe(5);
	});

	it("absorbs float error from the division", () => {
		expect(fromStripeMinorUnits(1015, "EUR")).toBe(10.15);
		expect(Object.is(fromStripeMinorUnits(-0, "EUR"), -0)).toBe(false);
	});
});

describe("toStripeMinorUnits", () => {
	it.each([
		[12.34, "EUR"],
		[500, "JPY"],
		[5, "UGX"],
	])("round-trips %s %s", (amount, currency) => {
		expect(
			fromStripeMinorUnits(toStripeMinorUnits(amount, currency), currency),
		).toBe(amount);
	});

	it("always yields an integer", () => {
		expect(toStripeMinorUnits(10.005, "EUR")).toBe(1001);
		expect(Number.isInteger(toStripeMinorUnits(0.1 + 0.2, "EUR"))).toBe(true);
	});
});
