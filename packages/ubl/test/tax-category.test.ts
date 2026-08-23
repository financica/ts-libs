import { describe, expect, it } from "vitest";
import {
	coerceLinesForSupplierVatStatus,
	taxCategoryFromReasonOrRate,
	type UblLine,
} from "../src/build/index.js";

describe("taxCategoryFromReasonOrRate", () => {
	it("maps reverse charge to AE with the standard reason", () => {
		expect(
			taxCategoryFromReasonOrRate({
				taxabilityReason: "reverse_charge",
				rate: 21,
			}),
		).toEqual({ id: "AE", percent: 0, exemptionReason: "Reverse charge" });
	});

	it("maps a K hint or intra_community reason to K", () => {
		expect(
			taxCategoryFromReasonOrRate({
				taxCategoryId: "K",
				taxabilityReason: null,
				rate: 21,
			}),
		).toEqual({ id: "K", percent: 0, exemptionReason: "Intra-community supply" });
		expect(
			taxCategoryFromReasonOrRate({
				taxabilityReason: "intra_community",
				rate: 0,
			}).id,
		).toBe("K");
	});

	it("maps a G hint or export reason to G", () => {
		expect(
			taxCategoryFromReasonOrRate({
				taxCategoryId: "g",
				taxabilityReason: null,
				rate: 0,
			}),
		).toEqual({ id: "G", percent: 0, exemptionReason: "Export outside the EU" });
		expect(
			taxCategoryFromReasonOrRate({ taxabilityReason: "export", rate: 0 }).id,
		).toBe("G");
	});

	it("keeps the S/Z/E fallbacks", () => {
		expect(
			taxCategoryFromReasonOrRate({ taxabilityReason: null, rate: 21 }),
		).toEqual({
			id: "S",
			percent: 21,
		});
		expect(
			taxCategoryFromReasonOrRate({ taxabilityReason: null, rate: 0 }).id,
		).toBe("Z");
		expect(
			taxCategoryFromReasonOrRate({
				taxabilityReason: "product_exempt",
				rate: 21,
			}).id,
		).toBe("E");
	});
});

describe("coerceLinesForSupplierVatStatus", () => {
	const line: UblLine = {
		id: "1",
		name: "Item",
		quantity: 1,
		unitCode: "C62",
		lineExtensionAmount: 10,
		priceAmount: 10,
		taxCategory: { id: "S", percent: 21 },
	};

	it("leaves lines untouched for a VAT-subject supplier", () => {
		expect(coerceLinesForSupplierVatStatus([line], "subject")).toEqual([line]);
	});

	it("coerces to E/0% with a generic reason for a non-subject supplier", () => {
		const [out] = coerceLinesForSupplierVatStatus([line], "not_subject", "BE");
		expect(out?.taxCategory).toEqual({
			id: "E",
			percent: 0,
			exemptionReason: "Seller not subject to VAT",
		});
	});

	it("uses the country-specific legal reference for a Belgian small business", () => {
		const [out] = coerceLinesForSupplierVatStatus([line], "small_business", "be");
		expect(out?.taxCategory.exemptionReason).toMatch(/56bis/);
	});

	it("falls back to the generic small-business text elsewhere", () => {
		const [out] = coerceLinesForSupplierVatStatus([line], "small_business", "NL");
		expect(out?.taxCategory.exemptionReason).toBe("Exempt — small business scheme");
	});
});
