import { parseXbrl, type XbrlItem } from "@financica/xbrl";
import { describe, expect, it } from "vitest";
import {
	buildBiztaxReturn,
	renderBiztaxReturn,
	validateBiztaxReturn,
	type BiztaxReturnInput,
} from "../src/index.js";
import ay2026 from "../src/taxonomies/ay2026-rle.js";

// A nil legal entities tax return: an ASBL with nothing to declare. It passes
// every formula assertion of the release in Arelle (scripts/arelle-check.sh).
const nil: BiztaxReturnInput = {
	taxonomy: ay2026,
	language: "fr",
	entity: {
		enterpriseNumber: "0766.280.697",
		name: "EXEMPLE ASBL",
		legalForm: "017",
		address: { street: "Rue Haute", houseNumber: "16", postalCode: "1000" },
	},
	period: { startDate: "2025-01-01", endDate: "2025-12-31" },
	facts: [],
};

describe("legal entities tax (rle)", () => {
	it("is valid with no line stated", () => {
		const filing = buildBiztaxReturn(nil);
		expect(validateBiztaxReturn(filing)).toMatchObject({ valid: true });
	});

	it.each([
		["fr", "IPM"],
		["nl", "RPB"],
		["de", "StjP"],
	] as const)(
		"names itself %s as %s, which rule f-rle-2011 demands",
		(language, name) => {
			const rendered = renderBiztaxReturn(
				buildBiztaxReturn({ ...nil, language }),
			);
			const instance = parseXbrl(rendered);
			if (!instance) throw new Error("rendered return is not an XBRL instance");
			const type = instance.facts.find(
				(fact): fact is XbrlItem =>
					fact.type === "item" && fact.name.localName === "TaxReturnType",
			);
			expect(type?.value).toBe(name);
		},
	);

	it("takes the lines of the form, in the cubes the form gives them", () => {
		const filing = buildBiztaxReturn({
			...nil,
			facts: [
				{
					concept: "IndexedCadastralIncomeBuiltImmovablePropertyBelgium",
					value: 1200,
				},
			],
		});
		expect(validateBiztaxReturn(filing).valid).toBe(true);
	});
});
