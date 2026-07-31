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

	it("writes the valuation rules, which the model makes mandatory", () => {
		// Section 6.5 carries the text on met:str1 under bas:m107/part:m6.
		// Validating the field but not reporting it would file it away empty.
		const fact = built().facts.find(
			(candidate) => candidate.value === MICRO_FILING.valuationRules,
		);
		expect(fact?.datapoint.metric).toBe("str1");
		expect(fact?.datapoint.dimensions).toMatchObject({
			"dim:bas": "bas:m107",
			"dim:part": "part:m6",
		});
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

	it("accepts a first exercise, which has no preceding one", () => {
		const identification = { ...MICRO_FILING.identification };
		delete identification.previousExercise;
		const result = validateNbbFiling(
			buildNbbFiling({ ...MICRO_FILING, identification }),
		);
		expect(result.errors.filter((f) => f.check === "DAT 26")).toEqual([]);
	});

	it("reports no preceding-exercise dates when there is no preceding exercise", () => {
		const identification = { ...MICRO_FILING.identification };
		delete identification.previousExercise;
		const facts = buildNbbFiling({ ...MICRO_FILING, identification }).facts;
		expect(facts.some((f) => f.value === "2024-01-01")).toBe(false);
		expect(facts.some((f) => f.value === "2024-12-31")).toBe(false);
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

/**
 * The identification section is checked against a real filing the NBB
 * accepted, anonymised and kept as a fixture. Four of these fields are
 * reported not as text but as a member of a closed list, in an element of that
 * list's own namespace, and getting either half wrong produces an instance the
 * NBB refuses without saying which fact was at fault.
 */
describe("identification", () => {
	const withCourt: NbbFilingInput = {
		...MICRO_FILING,
		entity: {
			...MICRO_FILING.entity,
			businessCourt: "10",
			statutesDate: "2019-03-22",
		},
	};

	const factFor = (dimensions: Record<string, string>) => {
		const filing = buildNbbFiling(withCourt);
		return filing.facts.find(
			(fact) =>
				Object.entries(dimensions).every(
					([dimension, member]) =>
						fact.datapoint.dimensions[dimension] === member,
				) &&
				Object.keys(fact.datapoint.dimensions).length ===
					Object.keys(dimensions).length,
		);
	};

	const cases: {
		what: string;
		dimensions: Record<string, string>;
		element: string;
		value: string;
	}[] = [
		{
			what: "legal form",
			dimensions: {
				"dim:bas": "bas:m30",
				"dim:part": "part:m2",
				"dim:psn": "psn:m1",
			},
			element: "lgf-enum:list2",
			value: "lgf:m610",
		},
		{
			what: "postal code",
			dimensions: {
				"dim:bas": "bas:m31",
				"dim:ctc": "ctc:m4",
				"dim:part": "part:m2",
				"dim:psn": "psn:m1",
			},
			element: "pcd-enum:list1",
			value: "pcd:m5000",
		},
		{
			what: "country",
			dimensions: {
				"dim:bas": "bas:m31",
				"dim:ctc": "ctc:m6",
				"dim:part": "part:m2",
				"dim:psn": "psn:m1",
			},
			element: "cty-enum:list1",
			value: "cty:mBE",
		},
		{
			what: "business court",
			dimensions: { "dim:bas": "bas:m32", "dim:part": "part:m2" },
			element: "cct-enum:list1",
			value: "cct:m10",
		},
		{
			what: "date of the articles of association",
			dimensions: {
				"dim:bas": "bas:m27",
				"dim:evt": "evt:m2",
				"dim:part": "part:m2",
			},
			element: "met:dte1",
			value: "2019-03-22",
		},
	];

	it.each(cases)(
		"reports the $what as $element",
		({ dimensions, element, value }) => {
			const fact = factFor(dimensions);
			expect(fact?.value).toBe(value);
			const [prefix, localName] = element.split(":");
			expect(fact?.datapoint.metricPrefix ?? "met").toBe(prefix);
			expect(fact?.datapoint.metric).toBe(localName);
			expect(renderNbbFiling(buildNbbFiling(withCourt))).toContain(
				`<${element} contextRef=`,
			);
		},
	);

	it("leaves out the business court when there is none to report", () => {
		const filing = buildNbbFiling(MICRO_FILING);
		expect(
			filing.facts.some(
				(fact) => fact.datapoint.dimensions["dim:bas"] === "bas:m32",
			),
		).toBe(false);
	});
});

/**
 * What the validator could and could not do, stated as a number.
 *
 * A validator that quietly runs four rules out of a hundred and seventy looks
 * exactly like one that runs them all. These assertions are the tripwire: they
 * fail when a taxonomy release, or a change here, stops a rule being enforced.
 */
describe("check coverage", () => {
	const result = validateNbbFiling(built());

	it("leaves no check unresolved but the one known to be prose", () => {
		// cx_11.00.0_0001 is stated as prose over a rubric this model does not
		// carry, so there is nothing to pin it to.
		expect(result.unresolved).toEqual(["cx_11.00.0_0001"]);
	});

	it("evaluates the arithmetic of every section the filing reports", () => {
		expect(result.evaluated.length).toBeGreaterThanOrEqual(69);
	});

	it("accounts for every published check exactly once", () => {
		const seen = [
			...result.evaluated,
			...result.skipped,
			...result.notApplicable,
			...result.unresolved,
		];
		expect(new Set(seen).size).toBe(seen.length);
		expect(seen.length).toBe(MICRO_FILING_CHECK_COUNT);
	});
});

const MICRO_FILING_CHECK_COUNT = built().module.checks.length;
