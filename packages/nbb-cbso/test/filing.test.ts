import { describe, expect, it } from "vitest";
import { parseXbrl } from "@financica/xbrl";
import {
	buildNbbFiling,
	filingValue,
	renderNbbFiling,
	validateNbbFiling,
	ENTERPRISE_NUMBER_SCHEME,
} from "../src/index.js";
import type { NbbFilingInput } from "../src/index.js";
import { MICRO_FILING, withBalanceSheet } from "./filing.js";

const built = () => buildNbbFiling(MICRO_FILING);

describe("buildNbbFiling", () => {
	it("resolves rubric codes to dimensional datapoints", () => {
		const total = built().facts.find((fact) => fact.code === "20/58");
		expect(total?.datapoint.metric).toBe("am1");
		expect(total?.datapoint.dimensions).toMatchObject({ "dim:bas": "bas:m25" });
	});

	it("reports the current and preceding columns as separate facts", () => {
		const totals = built().facts.filter((fact) => fact.code === "20/58");
		expect(totals.map((fact) => fact.period).sort()).toEqual([
			"current",
			"previous",
		]);
	});

	it("carries identification without a rubric code", () => {
		const name = built().facts.find((fact) => fact.value === "CALYX WORKS");
		expect(name).toBeDefined();
		expect(name?.code).toBeUndefined();
	});

	it("keeps the software producer out of the annual accounts", () => {
		// Its section belongs to the m101-r module, filed as its own instance.
		expect(built().facts.some((fact) => fact.value === "Financica")).toBe(false);
	});

	it("rejects a rubric code the model does not have", () => {
		expect(() =>
			buildNbbFiling(withBalanceSheet({ "99/99": { current: 1 } })),
		).toThrow(/unknown rubric code "99\/99"/);
	});

	it("rejects a taxonomy release that is not generated", () => {
		expect(() => buildNbbFiling({ ...MICRO_FILING, taxonomy: "1.0.0" })).toThrow(
			/no generated taxonomy/,
		);
	});

	it("writes amounts to two decimal places", () => {
		const fact = buildNbbFiling(
			withBalanceSheet({ "20/58": { current: 100000 } }),
		).facts.find((candidate) => candidate.code === "20/58");
		expect(fact?.value).toBe("100000.00");
	});

	it("distinguishes a nil figure from an absent one", () => {
		const filing = buildNbbFiling(
			withBalanceSheet({ "16": { current: null, previous: 0 } }),
		);
		expect(filingValue(filing, "16", "current")).toBeUndefined();
		expect(filingValue(filing, "16", "previous")).toBe(0);
	});
});

describe("validateNbbFiling", () => {
	it("passes a filing whose statutory arithmetic holds", () => {
		const result = validateNbbFiling(built());
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("says which checks it could not evaluate", () => {
		expect(validateNbbFiling(built()).skipped.length).toBeGreaterThan(0);
	});
});

/**
 * One passing and one failing case per statutory check the generator resolves
 * unambiguously. The failing figures break the identity by a round amount, so
 * a finding that names the wrong rubric is obvious.
 */
describe("statutory checks", () => {
	const cases: {
		check: string;
		rule: string;
		break: Parameters<typeof withBalanceSheet>[0];
	}[] = [
		{
			check: "va_03.01.0_0014",
			rule: "20/58 = 20 + 21/28 + 29/58",
			break: { "21/28": { current: 41000, previous: 30000 } },
		},
		{
			check: "va_03.01.0_0008",
			rule: "29/58 = 29 + 3 + 40/41 + 50/53 + 54/58 + 490/1",
			break: { "54/58": { current: 41000, previous: 34000 } },
		},
		{
			check: "va_03.01.0_0010",
			rule: "3 = 30/36 + 37",
			break: { "30/36": { current: 6000, previous: 4000 } },
		},
		{
			check: "va_03.01.0_0011",
			rule: "40/41 = 40 + 41",
			break: { "40": { current: 16000, previous: 12000 } },
		},
		{
			check: "va_03.02.0_0006",
			rule: "10/15 = 10/11 + 12 + 13 + (14) + 15 - 19",
			break: { "13": { current: 6000, previous: 5000 } },
		},
		{
			check: "va_03.01.0_0015",
			rule: "20/58 = 10/49",
			break: { "10/49": { current: 100001, previous: 80000 } },
		},
	];

	for (const testCase of cases) {
		it(`${testCase.check} passes when ${testCase.rule} holds`, () => {
			const result = validateNbbFiling(built());
			expect(result.errors.map((finding) => finding.check)).not.toContain(
				testCase.check,
			);
		});

		it(`${testCase.check} fails when ${testCase.rule} does not`, () => {
			const result = validateNbbFiling(
				buildNbbFiling(withBalanceSheet(testCase.break)),
			);
			const finding = result.errors.find(
				(candidate) => candidate.check === testCase.check,
			);
			expect(finding, `expected ${testCase.check} to fail`).toBeDefined();
			expect(finding?.severity).toBe("error");
			expect(finding?.codes.length).toBeGreaterThan(0);
		});
	}

	it("reports a statutory failure as an error, never a warning", () => {
		const result = validateNbbFiling(
			buildNbbFiling(withBalanceSheet({ "21/28": { current: 41000 } })),
		);
		expect(result.errors.every((finding) => finding.severity === "error")).toBe(
			true,
		);
		expect(result.warnings.some((finding) => finding.check.startsWith("va_"))).toBe(
			false,
		);
	});
});

describe("structural checks", () => {
	const withIdentification = (
		overrides: Partial<NbbFilingInput["identification"]>,
	): NbbFilingInput => ({
		...MICRO_FILING,
		identification: { ...MICRO_FILING.identification, ...overrides },
	});

	it("DAT 26 rejects an exercise that ends before it starts", () => {
		const result = validateNbbFiling(
			buildNbbFiling(
				withIdentification({
					exercise: { startDate: "2025-12-31", endDate: "2025-01-01" },
				}),
			),
		);
		expect(result.errors.some((finding) => finding.check === "DAT 26")).toBe(true);
	});

	it("DAT 26 rejects overlapping exercises", () => {
		const result = validateNbbFiling(
			buildNbbFiling(
				withIdentification({
					previousExercise: {
						startDate: "2024-01-01",
						endDate: "2025-06-30",
					},
				}),
			),
		);
		expect(result.errors.some((finding) => finding.check === "DAT 26")).toBe(true);
	});

	it("DAT 26 rejects a general meeting held before the year end", () => {
		const result = validateNbbFiling(
			buildNbbFiling(withIdentification({ generalMeetingDate: "2025-06-15" })),
		);
		expect(result.errors.some((finding) => finding.check === "DAT 26")).toBe(true);
	});

	it("rejects an enterprise number with wrong check digits", () => {
		const result = validateNbbFiling(
			buildNbbFiling({
				...MICRO_FILING,
				entity: { ...MICRO_FILING.entity, enterpriseNumber: "0925590629" },
			}),
		);
		expect(
			result.errors.some((finding) => finding.check === "enterprise-number"),
		).toBe(true);
	});

	it("rejects an enterprise number in the VAT format", () => {
		const result = validateNbbFiling(
			buildNbbFiling({
				...MICRO_FILING,
				entity: { ...MICRO_FILING.entity, enterpriseNumber: "BE0925590628" },
			}),
		);
		expect(
			result.errors.some((finding) => finding.check === "enterprise-number"),
		).toBe(true);
	});

	it("rejects empty valuation rules, which the model makes mandatory", () => {
		const result = validateNbbFiling(
			buildNbbFiling({ ...MICRO_FILING, valuationRules: "   " }),
		);
		expect(
			result.errors.some((finding) => finding.check === "valuation-rules"),
		).toBe(true);
	});

	it("rejects a filing with no balance sheet figure for the exercise", () => {
		const result = validateNbbFiling(
			buildNbbFiling({ ...MICRO_FILING, balanceSheet: {} }),
		);
		expect(
			result.errors.some((finding) => finding.check === "balance-sheet-present"),
		).toBe(true);
	});
});

describe("renderNbbFiling", () => {
	const render = () => renderNbbFiling(built());

	it("points at the entry point for the model and part", () => {
		const parsed = parseXbrl(render())!;
		expect(parsed.schemaRefs[0]?.href).toBe(
			"http://www.nbb.be/be/fr/cbso/fws/26.0/mod/m87/m87-f.xsd",
		);
	});

	it("identifies the entity by enterprise number under the NBB scheme", () => {
		const parsed = parseXbrl(render())!;
		const entity = Object.values(parsed.contexts)[0]!.entity;
		expect(entity.scheme).toBe(ENTERPRISE_NUMBER_SCHEME);
		expect(entity.value).toBe("0925590628");
	});

	it("dates every context at the closing date, as an instant", () => {
		const parsed = parseXbrl(render())!;
		const periods = new Set(
			Object.values(parsed.contexts).map((context) =>
				context.period.type === "instant"
					? context.period.instant
					: context.period.type,
			),
		);
		expect([...periods]).toEqual(["2025-12-31"]);
	});

	it("carries the preceding exercise as a dimension, not as a period", () => {
		const parsed = parseXbrl(render())!;
		const members = Object.values(parsed.contexts).flatMap((context) =>
			(context.scenario ?? []).map((member) => member.member?.localName),
		);
		expect(members).toContain("m2");
		expect(
			Object.values(parsed.contexts).every(
				(context) => context.period.type === "instant",
			),
		).toBe(true);
	});

	it("reports monetary facts in EUR with decimals INF", () => {
		const parsed = parseXbrl(render())!;
		const monetary = parsed.facts.filter(
			(fact) => fact.type === "item" && fact.unitRef !== undefined,
		);
		expect(monetary.length).toBeGreaterThan(0);
		for (const fact of monetary) {
			if (fact.type !== "item") continue;
			expect(fact.unitRef).toBe("EUR");
			expect(fact.decimals).toBe("INF");
		}
		expect(Object.keys(parsed.units)).toEqual(["EUR"]);
	});

	it("uses no segments, which the NBB does not accept", () => {
		const parsed = parseXbrl(render())!;
		expect(
			Object.values(parsed.contexts).every(
				(context) => context.entity.segment === undefined,
			),
		).toBe(true);
	});

	it("omits linkbase, role and arcrole references, which are prohibited", () => {
		const parsed = parseXbrl(render())!;
		expect(parsed.linkbaseRefs).toEqual([]);
		expect(parsed.roleRefs).toEqual([]);
		expect(parsed.arcroleRefs).toEqual([]);
		expect(parsed.footnoteLinks).toEqual([]);
	});

	it("gives every reported figure a context of its own", () => {
		const parsed = parseXbrl(render())!;
		expect(Object.keys(parsed.contexts)).toHaveLength(parsed.facts.length);
	});

	it("round-trips every figure through the parser", () => {
		const parsed = parseXbrl(render())!;
		const total = parsed.facts.find(
			(fact) =>
				fact.type === "item" &&
				parsed.contexts[fact.contextRef]?.scenario?.some(
					(member) => member.member?.localName === "m25",
				) &&
				parsed.contexts[fact.contextRef]?.scenario?.some(
					(member) => member.member?.localName === "m1",
				),
		);
		expect(total?.type === "item" ? total.value : undefined).toBe("100000.00");
	});

	it("is byte-identical across runs", () => {
		expect(render()).toBe(render());
	});

	it("writes the filing language on the root element", () => {
		expect(render()).toContain('xml:lang="fr"');
	});
});
