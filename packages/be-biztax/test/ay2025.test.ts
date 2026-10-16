import { parseXbrl } from "@financica/xbrl";
import { describe, expect, it } from "vitest";
import {
	buildBiztaxReturn,
	renderBiztaxReturn,
	validateBiztaxReturn,
	type TaxonomyModule,
} from "../src/index.js";
import rcorp from "../src/taxonomies/ay2025-rcorp.js";
import rle from "../src/taxonomies/ay2025-rle.js";

import { srl2025Return } from "./fixtures/srl-2025-return.js";

// The year 2024, filed under be-tax 2025-04-30. The same mandatory chain as
// the 2025 sample passes every formula assertion of this release in Arelle.
const fy2024 = (taxonomy: TaxonomyModule = rcorp) =>
	srl2025Return({
		taxonomy,
		period: { startDate: "2024-01-01", endDate: "2024-12-31" },
	});

describe.each([
	["ay2025-rcorp", rcorp],
	["ay2025-rle", rle],
] as const)("generated %s module", (_, module) => {
	it("resolves every tuple slot, cube dimension and datatype it names", () => {
		const concepts = Object.values(module.concepts);
		const dangling = concepts.flatMap((concept) =>
			concept.kind === "tuple"
				? concept.children
						.map((slot) => slot.name)
						.filter(
							(name) => !module.concepts[name] && !module.codeLists[name],
						)
				: (concept.cubes ?? [])
						.filter((index) => !module.cubes[index])
						.map(String),
		);
		const untyped = concepts.filter(
			(concept) => concept.kind === "item" && !module.dataTypes[concept.dataType],
		);
		expect(untyped).toEqual([]);
		expect(dangling).toEqual([]);
		expect(
			module.cubes
				.flatMap((cube) => cube.dimensions)
				.filter((name) => !module.dimensions[name]),
		).toEqual([]);
	});

	it("takes periods ending in 2024", () => {
		expect(module.assessmentYear).toBe(2025);
		expect(module.parameters["AssessmentYearEndFirst"]).toBe("2024-12-31");
		expect(module.parameters["AssessmentYearEndLast"]).toBe("2025-12-30");
	});
});

describe("a 2024 return under ay2025-rcorp", () => {
	it("points at the 2025 release and is valid", () => {
		const filing = buildBiztaxReturn(fy2024());
		const instance = parseXbrl(renderBiztaxReturn(filing));
		expect(instance?.schemaRefs.map((ref) => ref.href)).toEqual([
			"be-tax-inc-rcorp-2025-04-30.xsd",
		]);
		expect(validateBiztaxReturn(filing)).toEqual({ valid: true, findings: [] });
	});

	it("is refused for a period of assessment year 2026", () => {
		const filing = buildBiztaxReturn(srl2025Return({ taxonomy: rcorp }));
		expect(validateBiztaxReturn(filing).findings.map((f) => f.rule)).toContain(
			"period-assessment-year",
		);
	});
});
