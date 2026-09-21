import {
	parseXbrl,
	type XbrlFact,
	type XbrlItem,
	type XbrlTuple,
} from "@financica/xbrl";
import { describe, expect, it } from "vitest";
import {
	BiztaxBuildError,
	BiztaxEnvelopeError,
	biztaxFileName,
	buildBiztaxReturn,
	renderBiztaxReturn,
	validateBiztaxReturn,
	wrapBiztax,
	type BiztaxReturnInput,
	type FactInput,
} from "../src/index.js";
import ay2026 from "../src/taxonomies/ay2026-rcorp.js";

const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

/** A small SRL: reserves that grew, two disallowed lines, a dividend, prepayments. */
const FACTS: readonly FactInput[] = [
	{ concept: "LegalReserve", at: "start", value: 1860 },
	{ concept: "LegalReserve", at: "end", value: 1860 },
	{ concept: "AccumulatedProfitsLosses", at: "start", value: 12_400.5 },
	{ concept: "AccumulatedProfitsLosses", at: "end", value: 31_900.75 },
	{
		concept: "OtherReserves",
		at: "end",
		value: 5000,
		dimensions: { "d-ty:DescriptionTypedDimension": "Réserve de liquidation" },
	},
	{ concept: "NonDeductibleRestaurantExpenses", value: 418.5 },
	{ concept: "NonDeductibleFinesConfiscationsPenaltiesAllKind", value: 116 },
	{ concept: "OrdinaryDividends", value: 10_000 },
	{ concept: "FirstBracketReducedRate2000", value: true },
	{ concept: "Prepayments", value: 4000 },
	{ concept: "StatutoryAccounts", value: PDF },
];

const input = (overrides: Partial<BiztaxReturnInput> = {}): BiztaxReturnInput => ({
	taxonomy: ay2026,
	language: "fr",
	entity: {
		enterpriseNumber: "0766.280.697",
		name: "EXEMPLE SRL",
		legalForm: "610",
		address: { street: "Rue Haute", houseNumber: "16", postalCode: "1000" },
	},
	period: { startDate: "2025-01-01", endDate: "2025-12-31" },
	contact: { name: "Dupont", firstName: "Anne", email: "anne@example.be" },
	facts: FACTS,
	...overrides,
});

const items = (facts: readonly XbrlFact[], localName: string): XbrlItem[] =>
	facts.filter(
		(fact): fact is XbrlItem =>
			fact.type === "item" && fact.name.localName === localName,
	);

const tupleNamed = (facts: readonly XbrlFact[], localName: string): XbrlTuple => {
	const found = facts.find(
		(fact): fact is XbrlTuple =>
			fact.type === "tuple" && fact.name.localName === localName,
	);
	if (!found) throw new Error(`no tuple ${localName}`);
	return found;
};

describe("generated ay2026-rcorp module", () => {
	it("resolves every tuple slot and every cube dimension it names", () => {
		const concepts = Object.values(ay2026.concepts);
		expect(concepts.length).toBeGreaterThan(500);
		const dangling = concepts.flatMap((concept) =>
			concept.kind === "tuple"
				? concept.children
						.map((slot) => slot.name)
						.filter(
							(name) => !ay2026.concepts[name] && !ay2026.codeLists[name],
						)
				: (concept.cubes ?? [])
						.filter((index) => !ay2026.cubes[index])
						.map(String),
		);
		expect(dangling).toEqual([]);
		const undefinedDimensions = ay2026.cubes
			.flatMap((cube) => cube.dimensions)
			.filter((name) => !ay2026.dimensions[name]);
		expect(undefinedDimensions).toEqual([]);
	});

	it("types every item with a datatype it carries", () => {
		const untyped = Object.values(ay2026.concepts).filter(
			(concept) => concept.kind === "item" && !ay2026.dataTypes[concept.dataType],
		);
		expect(untyped).toEqual([]);
	});
});

describe("renderBiztaxReturn", () => {
	const xml = renderBiztaxReturn(buildBiztaxReturn(input()));
	const instance = parseXbrl(xml);
	if (!instance) throw new Error("rendered return is not an XBRL instance");

	it("points at the rcorp entry point of the release", () => {
		expect(instance.schemaRefs.map((ref) => ref.href)).toEqual([
			"be-tax-2026-04-30/DTS/be-tax-inc-rcorp-2026-04-30.xsd",
		]);
	});

	it("puts the opening balance the day before the period starts", () => {
		expect(instance.contexts["D"]?.period).toEqual({
			type: "duration",
			startDate: "2025-01-01",
			endDate: "2025-12-31",
		});
		expect(instance.contexts["I-Start"]?.period).toEqual({
			type: "instant",
			instant: "2024-12-31",
		});
		expect(instance.contexts["I-End"]?.period).toEqual({
			type: "instant",
			instant: "2025-12-31",
		});
		for (const context of Object.values(instance.contexts)) {
			expect(context.entity).toMatchObject({
				scheme: "http://www.fgov.be",
				value: "BE0766280697",
			});
		}
	});

	it("reports amounts in EUR with exact decimals, one fact per moment", () => {
		const profits = items(instance.facts, "AccumulatedProfitsLosses");
		expect(profits.map((fact) => [fact.contextRef, fact.value])).toEqual([
			["I-Start", "12400.50"],
			["I-End", "31900.75"],
		]);
		expect(
			profits.every((fact) => fact.unitRef === "EUR" && fact.decimals === "INF"),
		).toBe(true);
		expect(instance.units["EUR"]?.measures?.[0]).toMatchObject({
			localName: "EUR",
		});
		const flag = items(instance.facts, "FirstBracketReducedRate2000")[0];
		expect(flag).toMatchObject({ contextRef: "D", value: "true" });
		expect(flag?.unitRef).toBeUndefined();
	});

	it("carries a typed member in the scenario of its own context", () => {
		const [reserve] = items(instance.facts, "OtherReserves");
		const context = instance.contexts[reserve?.contextRef ?? ""];
		expect(context?.period).toEqual({ type: "instant", instant: "2025-12-31" });
		expect(context?.scenario).toHaveLength(1);
		expect(context?.scenario?.[0]).toMatchObject({
			dimension: { localName: "DescriptionTypedDimension" },
			typedElement: { localName: "DescriptionTypedID" },
			typedValue: "Réserve de liquidation",
		});
	});

	it("orders the identification tuples as their content models do", () => {
		const entity = tupleNamed(instance.facts, "EntityInformation");
		expect(entity.children.map((child) => child.name.localName)).toEqual([
			"EntityName",
			"EntityIdentifier",
			"EntityForm",
			"EntityAddress",
		]);
		const form = tupleNamed(entity.children, "EntityForm");
		expect(form.children[0]).toMatchObject({
			name: { localName: "XCode_LegalFormCode_610" },
			value: "610",
		});
		const address = tupleNamed(entity.children, "EntityAddress");
		expect(address.children.map((child) => child.name.localName)).toEqual([
			"AddressType",
			"Street",
			"Number",
			"PostalCodeCity",
			"CountryCode",
		]);
		expect(items(instance.facts, "TaxReturnType")[0]?.value).toBe("ISoc");
		expect(items(instance.facts, "AssessmentYear")[0]?.value).toBe("2026");
	});

	it("embeds an annex as base64", () => {
		expect(items(instance.facts, "StatutoryAccounts")[0]?.value).toBe(
			btoa("%PDF-1.7\n%%EOF\n"),
		);
	});
});

describe("buildBiztaxReturn", () => {
	it.each([
		[
			"a concept the entry point lacks",
			{ concept: "NoSuchLine", value: 1 },
			/not a concept/,
		],
		[
			"a dimension on a non-dimensional line",
			{
				concept: "Prepayments",
				value: 1,
				dimensions: { "d-ty:DescriptionTypedDimension": "abc" },
			},
			/takes none/,
		],
		[
			"a dimensional line without its dimension",
			{ concept: "OtherReserves", value: 1 },
			/takes d-ty:DescriptionTypedDimension/,
		],
		[
			"a member the dimension does not define",
			{
				concept: "GrossPEExemptIncomeMovableAssets",
				value: 1,
				dimensions: { "d-br:BranchDimension": "d-br:MoonBranchMember" },
			},
			/not a member/,
		],
		[
			"text where an amount belongs",
			{ concept: "Prepayments", value: "4000" },
			/takes a number/,
		],
	] satisfies [string, FactInput, RegExp][])("rejects %s", (_, fact, reason) => {
		const build = (): unknown => buildBiztaxReturn(input({ facts: [fact] }));
		expect(build).toThrow(BiztaxBuildError);
		expect(build).toThrow(reason);
	});

	it("rejects one fact given twice", () => {
		const twice = [FACTS[0]!, FACTS[0]!];
		expect(() => buildBiztaxReturn(input({ facts: twice }))).toThrow(
			/more than once/,
		);
	});

	it("rejects a code outside its list", () => {
		const entity = { ...input().entity, legalForm: "999999" };
		expect(() => buildBiztaxReturn(input({ entity }))).toThrow(/not a code of/);
	});
});

describe("validateBiztaxReturn", () => {
	const rules = (overrides: Partial<BiztaxReturnInput>): string[] =>
		validateBiztaxReturn(buildBiztaxReturn(input(overrides))).findings.map(
			(f) => f.rule,
		);

	it("accepts the sample return", () => {
		expect(validateBiztaxReturn(buildBiztaxReturn(input()))).toEqual({
			valid: true,
			findings: [],
		});
	});

	it.each([
		[
			"a negative amount on a non-negative line",
			{ facts: [{ concept: "Prepayments", value: -1 }] },
			"datatype",
		],
		[
			"a period of another assessment year",
			{ period: { startDate: "2024-01-01", endDate: "2024-12-31" } },
			"period-assessment-year",
		],
		[
			"an inverted period",
			{ period: { startDate: "2026-01-01", endDate: "2025-12-31" } },
			"period-order",
		],
		[
			"a failed check digit",
			{ entity: { enterpriseNumber: "0766280698", name: "X SRL" } },
			"enterprise-number",
		],
		[
			"an annex that is not a PDF",
			{
				facts: [
					{
						concept: "StatutoryAccounts",
						value: new Uint8Array([80, 75, 3, 4]),
					},
				],
			},
			"annex-pdf",
		],
		[
			"a typed member shorter than three characters",
			{
				facts: [
					{
						concept: "OtherReserves",
						value: 1,
						dimensions: { "d-ty:DescriptionTypedDimension": "ab" },
					},
				],
			},
			"typed-member",
		],
	] satisfies [string, Partial<BiztaxReturnInput>, string][])(
		"flags %s",
		(_, overrides, rule) => {
			expect(rules(overrides)).toContain(rule);
		},
	);
});

describe("wrapBiztax", () => {
	const xml = renderBiztaxReturn(buildBiztaxReturn(input()));

	it("holds each return whole, under one declaration", () => {
		const file = wrapBiztax([xml, xml]);
		expect(file.match(/<\?xml/g)).toHaveLength(1);
		const inner = file
			.replace(/^<\?xml[^>]*\?>\s*<biztax>\s*/, "")
			.replace(/\s*<\/biztax>\s*$/, "");
		const returns = inner.split(/(?<=<\/(?:\w+:)?xbrl>)\s*/).filter(Boolean);
		expect(returns).toHaveLength(2);
		for (const one of returns) {
			expect(parseXbrl(one)?.contexts["D"]).toBeDefined();
		}
	});

	it("refuses none, more than 25, and what is not an instance", () => {
		expect(() => wrapBiztax([])).toThrow(BiztaxEnvelopeError);
		expect(() => wrapBiztax(Array.from({ length: 26 }, () => xml))).toThrow(
			BiztaxEnvelopeError,
		);
		expect(() => wrapBiztax(["<html/>"])).toThrow(BiztaxEnvelopeError);
	});

	it("names the file with the characters Biztax allows", () => {
		expect(biztaxFileName("Société Éxemple & Fils 2026")).toBe(
			"Societe Exemple  Fils 2026.biztax",
		);
	});
});
