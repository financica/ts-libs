import { describe, expect, it } from "vitest";
import {
	findDeep,
	findDeepString,
	findStripeInvoiceId,
	optionalAmount,
	unixToIsoDate,
} from "../src/internal.js";

describe("unixToIsoDate", () => {
	it("converts a Unix timestamp to ISO date", () => {
		// 2025-12-12 roughly
		expect(unixToIsoDate(1765546546)).toBe("2025-12-12");
	});

	it("returns null for null/undefined/zero", () => {
		expect(unixToIsoDate(null)).toBeNull();
		expect(unixToIsoDate(undefined)).toBeNull();
		expect(unixToIsoDate(0)).toBeNull();
	});

	it("returns null for NaN", () => {
		expect(unixToIsoDate(Number.NaN)).toBeNull();
	});
});

describe("findDeep", () => {
	it("finds a top-level key", () => {
		expect(findDeep({ ephemeral_key: "ek_123" }, "ephemeral_key")).toBe("ek_123");
	});

	it("finds a nested key", () => {
		const data = { outer: { inner: { ephemeral_key: "ek_456" } } };
		expect(findDeep(data, "ephemeral_key")).toBe("ek_456");
	});

	it("finds a key inside an array", () => {
		const data = { items: [{ id: "a" }, { id: "b", target: "found" }] };
		expect(findDeep(data, "target")).toBe("found");
	});

	it("returns undefined for missing keys", () => {
		expect(findDeep({ a: 1 }, "b")).toBeUndefined();
	});

	it("returns undefined for null/primitives", () => {
		expect(findDeep(null, "key")).toBeUndefined();
		expect(findDeep("string", "key")).toBeUndefined();
		expect(findDeep(42, "key")).toBeUndefined();
	});

	// The cycle guard and the depth cap are the only things standing between a
	// pathological payload and a blown stack, so both are asserted directly.
	it("terminates on a self-referential payload instead of recursing forever", () => {
		const cyclic: Record<string, unknown> = { id: "in_1" };
		cyclic.self = cyclic;
		cyclic.child = { parent: cyclic };
		expect(findDeep(cyclic, "ephemeral_key")).toBeUndefined();
	});

	it("stops descending past the depth cap", () => {
		const nest = (levels: number): unknown => {
			let node: unknown = { target: "found" };
			for (let i = 0; i < levels; i += 1) node = { level: node };
			return node;
		};
		// FIND_DEEP_MAX_DEPTH is 16: inside the cap the key is still found.
		expect(findDeep(nest(15), "target")).toBe("found");
		expect(findDeep(nest(20), "target")).toBeUndefined();
	});
});

describe("findDeepString", () => {
	it("finds the first matching string key", () => {
		const data = { business_name: "Folk" };
		expect(findDeepString(data, "account_name", "business_name")).toBe("Folk");
	});

	it("skips empty/whitespace strings", () => {
		const data = { name: "  ", fallback: "Real Name" };
		expect(findDeepString(data, "name", "fallback")).toBe("Real Name");
	});

	it("returns null when no keys match", () => {
		expect(findDeepString({ a: 1 }, "b", "c")).toBeNull();
	});
});

describe("findStripeInvoiceId", () => {
	it("finds invoice_id at top level", () => {
		expect(findStripeInvoiceId({ invoice_id: "in_1SdVYzIA795jFTKSKcW5UOuj" })).toBe(
			"in_1SdVYzIA795jFTKSKcW5UOuj",
		);
	});

	it("finds invoice ID nested in data", () => {
		const data = {
			config: { invoice: "in_ABC123DEF456" },
		};
		expect(findStripeInvoiceId(data)).toBe("in_ABC123DEF456");
	});

	it("finds invoice ID via JSON text fallback", () => {
		// Key name doesn't match known names, but value matches pattern
		const data = { stripe_inv: "in_1234567890ab" };
		expect(findStripeInvoiceId(data)).toBe("in_1234567890ab");
	});

	it("ignores non-invoice strings starting with in_", () => {
		// Too short to match the 10+ char regex
		const data = { ref: "in_short" };
		expect(findStripeInvoiceId(data)).toBeNull();
	});

	it("returns null for empty objects", () => {
		expect(findStripeInvoiceId({})).toBeNull();
	});
});

describe("optionalAmount", () => {
	it("accepts the decimal strings Stripe sends for documented-integer fields", () => {
		// Observed in the wild on credit notes; treating these as absent
		// silently understates a total.
		expect(optionalAmount("1234")).toBe(1234);
		expect(optionalAmount("12.34")).toBe(12.34);
	});

	it("returns null rather than 0 for anything unreadable", () => {
		for (const value of [
			null,
			undefined,
			"",
			"abc",
			{},
			[],
			Number.NaN,
			Infinity,
		]) {
			expect(optionalAmount(value)).toBeNull();
		}
	});
});
