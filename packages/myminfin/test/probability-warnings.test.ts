import { describe, expect, it } from "vitest";
import {
	buildBelgianVatReturn,
	evaluateProbabilityWarnings,
	findUnjustifiedWarnings,
	serializeVatReturn,
	type VatReturnGrid,
} from "../src/index";

// Expected values are taken from the rule formulas in the annex of SPF's
// Intervat API documentation, with amounts chosen to sit either side of each
// published threshold.

const declarant = {
	vatNumber: "0806153934",
	name: "Test BV",
	street: "Teststraat 1",
	postCode: "1000",
	city: "Brussel",
	countryCode: "BE",
};
const period = { year: 2026, quarter: 1 as const };

describe("evaluateProbabilityWarnings", () => {
	it("finds nothing in a grid whose VAT follows its bases", () => {
		const grid: VatReturnGrid = { 3: 1000, 54: 210, 59: 100, 82: 500, 71: 110 };
		expect(evaluateProbabilityWarnings(grid)).toEqual([]);
	});

	it("flags grid 54 only once the shortfall passes 62", () => {
		// 21% of 1000 = 210. A 54 of 150 is 60 short, which is inside tolerance.
		expect(evaluateProbabilityWarnings({ 3: 1000, 54: 150 })).toEqual([]);
		// 145 is 65 short.
		const tripped = evaluateProbabilityWarnings({ 3: 1000, 54: 145 });
		expect(tripped.map((w) => w.code)).toEqual(["W_TVA_GRID_54O_INCORRECT_VALUE"]);
		expect(tripped[0]?.grids).toEqual([1, 2, 3, 54]);
	});

	it("leaves grid 54 alone when the box is absent entirely", () => {
		// The rule is conditioned on 54 carrying a value; an absent box is a
		// different situation and Intervat does not ask about it here.
		expect(evaluateProbabilityWarnings({ 3: 1000 })).toEqual([]);
	});

	it("flags an amount in 87 with no VAT in 56 or 57", () => {
		expect(evaluateProbabilityWarnings({ 87: 251 }).map((w) => w.code)).toContain(
			"W_TVA_GRID_5657_INCORRECT_VALUE",
		);
		// Under the 250 threshold, and once 56 carries VAT, the rule is quiet.
		expect(
			evaluateProbabilityWarnings({ 87: 250 }).map((w) => w.code),
		).not.toContain("W_TVA_GRID_5657_INCORRECT_VALUE");
		expect(
			evaluateProbabilityWarnings({ 87: 1000, 56: 210 }).map((w) => w.code),
		).not.toContain("W_TVA_GRID_5657_INCORRECT_VALUE");
	});

	it("distinguishes an absent grid 55 from a zero one", () => {
		// Absent 55 with bases over 250 trips rule 4.
		expect(evaluateProbabilityWarnings({ 86: 300 }).map((w) => w.code)).toContain(
			"W_TVA_GRID_55_INCORRECT_VALUE",
		);
		// A present 55, even at 0, does not — it trips the 6% floor instead.
		const withZero = evaluateProbabilityWarnings({ 86: 3000, 55: 0 }).map(
			(w) => w.code,
		);
		expect(withZero).not.toContain("W_TVA_GRID_55_INCORRECT_VALUE");
		expect(withZero).toContain("W_TVA_GRID_55_INCORRECT_VALUE_3");
	});

	it("flags grid 55 above 21% and below 6% of its bases", () => {
		// 21% of 1000 = 210; 55 of 400 exceeds it by 190 (> 150).
		expect(
			evaluateProbabilityWarnings({ 86: 1000, 55: 400 }).map((w) => w.code),
		).toContain("W_TVA_GRID_55_INCORRECT_VALUE_2");
		// 6% of 5000 = 300; a 55 of 100 falls 200 short (> 150).
		expect(
			evaluateProbabilityWarnings({ 86: 5000, 55: 100 }).map((w) => w.code),
		).toContain("W_TVA_GRID_55_INCORRECT_VALUE_3");
	});

	it("flags deduction in 59 far above 21% of the purchase bases", () => {
		// 21% of 100000 = 21000; a deduction of 130000 exceeds it by 109000.
		expect(
			evaluateProbabilityWarnings({ 82: 100000, 59: 130000 }).map((w) => w.code),
		).toContain("W_TVA_GRID_59_INCORRECT_VALUE");
		expect(
			evaluateProbabilityWarnings({ 82: 100000, 59: 25000 }).map((w) => w.code),
		).not.toContain("W_TVA_GRID_59_INCORRECT_VALUE");
	});

	it("flags grid 64 above 21% of grid 49", () => {
		// 21% of 1000 = 210; 64 of 280 exceeds it by 70 (> 62).
		expect(
			evaluateProbabilityWarnings({ 49: 1000, 64: 280 }).map((w) => w.code),
		).toContain("W_TVA_GRID_64_INCORRECT_VALUE");
	});

	it("names the declarant in the authority's own wording", () => {
		const [warning] = evaluateProbabilityWarnings(
			{ 3: 1000, 54: 100 },
			{ vatNumber: "0806153934" },
		);
		expect(warning?.descriptions.en).toContain("0806153934");
		expect(warning?.descriptions.fr).toContain("grille 54");
		// Every language SPF publishes is present.
		expect(Object.keys(warning?.descriptions ?? {})).toEqual([
			"fr",
			"nl",
			"de",
			"en",
		]);
	});

	it("drops the declarant parenthetical rather than showing a placeholder", () => {
		const [warning] = evaluateProbabilityWarnings({ 3: 1000, 54: 100 });
		expect(warning?.descriptions.en).not.toContain("{0}");
		expect(warning?.descriptions.en.endsWith("calculation.")).toBe(true);
	});
});

describe("findUnjustifiedWarnings", () => {
	const grid: VatReturnGrid = { 3: 1000, 54: 100 };

	it("clears a warning once it carries a comment", () => {
		expect(findUnjustifiedWarnings(grid)).toHaveLength(1);
		expect(
			findUnjustifiedWarnings(grid, [
				{ code: "W_TVA_GRID_54O_INCORRECT_VALUE", comment: "Mixed rates." },
			]),
		).toEqual([]);
	});

	it("treats a blank comment as no justification", () => {
		expect(
			findUnjustifiedWarnings(grid, [
				{ code: "W_TVA_GRID_54O_INCORRECT_VALUE", comment: "   " },
			]),
		).toHaveLength(1);
	});
});

describe("justifications in the XML", () => {
	it("renders each justification after Ask, with its comment escaped", () => {
		const xml = serializeVatReturn({
			declarant,
			period,
			grid: { 3: 1000, 54: 100 },
			justifications: [
				{
					code: "W_TVA_GRID_54O_INCORRECT_VALUE",
					comment: "Ventes à 6% & 21% <mélangées>",
				},
			],
		});
		expect(xml).toContain(
			'<ns2:Justification Code="W_TVA_GRID_54O_INCORRECT_VALUE">',
		);
		expect(xml).toContain(
			"<Comment>Ventes à 6% &amp; 21% &lt;mélangées&gt;</Comment>",
		);
		expect(xml.indexOf("<ns2:Ask")).toBeLessThan(xml.indexOf("<ns2:Justification"));
	});

	it("emits no Justification element when there is nothing to justify", () => {
		const xml = serializeVatReturn({
			declarant,
			period,
			grid: { 3: 1000, 54: 210 },
		});
		expect(xml).not.toContain("Justification");
	});

	it("reports what still needs justifying from the build step", () => {
		// 21% of 1000 is 210, so a declared 100 in grid 54 is well outside tolerance.
		const figures = {
			standardRatedSales: [{ rate: 21, base: 1000, vat: 100 }],
			purchaseBase: 0,
			deductibleVat: 0,
		};
		const unjustified = buildBelgianVatReturn({ declarant, period, figures });
		expect(unjustified.unjustifiedWarnings.map((w) => w.code)).toEqual([
			"W_TVA_GRID_54O_INCORRECT_VALUE",
		]);

		const justified = buildBelgianVatReturn({
			declarant,
			period,
			figures,
			justifications: [
				{ code: "W_TVA_GRID_54O_INCORRECT_VALUE", comment: "Corrected below." },
			],
		});
		expect(justified.unjustifiedWarnings).toEqual([]);
		expect(justified.xml).toContain("<ns2:Justification");
	});
});
