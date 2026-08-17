import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { parseXbrl } from "@financica/xbrl";
import {
	buildNbbFiling,
	describeExpression,
	evaluateExpression,
	ExpressionError,
	filingValue,
	renderNbbFiling,
	validateNbbFiling,
	ENTERPRISE_NUMBER_SCHEME,
	ENUMERATIONS,
} from "../src/index.js";
import type { NbbFiling, NbbFilingInput, RubricAmounts } from "../src/index.js";
import { ASSOCIATION_FILING, MICRO_FILING, withBalanceSheet } from "./filing.js";

const built = () => buildNbbFiling(MICRO_FILING);
/** Attributes of the root `xbrl` element, which the XBRL parser does not keep. */
function rootAttributes(xml: string): Record<string, string> {
	const parsed = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "",
		removeNSPrefix: false,
	}).parse(xml) as Record<string, Record<string, string>>;
	// The root is `xbrli:xbrl`; match on the local name so the assertion does
	// not depend on which prefix the serializer binds to the xbrli namespace.
	const root = Object.keys(parsed).find(
		(key) => key === "xbrl" || key.endsWith(":xbrl"),
	);
	return root ? (parsed[root] ?? {}) : {};
}

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

	it("takes the taxonomy module from the input, unchanged", () => {
		expect(built().module).toBe(MICRO_FILING.taxonomy);
	});

	it("writes amounts to two decimal places", () => {
		const fact = buildNbbFiling(
			withBalanceSheet({ "20/58": { current: 100000 } }),
		).facts.find((candidate) => candidate.code === "20/58");
		expect(fact?.value).toBe("100000.00");
	});

	it("writes a negative amount with a plain minus sign and padded cents", () => {
		// DAT 31 accepts a leading minus and exactly two decimals; a caller's
		// -1234.5 has to go out as -1234.50, not -1234.5 or (1234.50). On `16`
		// rather than `14`, which the appropriation section also reports as
		// `(14)`: changing one side of an alias pair is the contradiction the
		// builder is supposed to refuse, and it has its own test.
		const fact = buildNbbFiling(
			withBalanceSheet({ "16": { current: -1234.5 } }),
		).facts.find((candidate) => candidate.code === "16");
		expect(fact?.value).toBe("-1234.50");
	});

	it("rounds a fractional cent rather than writing a third decimal", () => {
		// The builder rounds; it does not refuse. Pinned so that a change to
		// refusing (or truncating) is a decision, not an accident.
		const filing = buildNbbFiling(withBalanceSheet({ "16": { current: 100.555 } }));
		expect(filingValue(filing, "16", "current")).toBe(100.56);
		expect(
			validateNbbFiling(filing).errors.filter((f) => f.check === "DAT 31"),
		).toEqual([]);
	});

	it("distinguishes a nil figure from an absent one", () => {
		const filing = buildNbbFiling(
			withBalanceSheet({ "16": { current: null, previous: 0 } }),
		);
		expect(filingValue(filing, "16", "current")).toBeUndefined();
		expect(filingValue(filing, "16", "previous")).toBe(0);
	});

	// The model prints one figure under two names: `14` under equity and
	// `(14)` in the appropriation account; `22/27` on the face and `(22/27)`
	// in the statement of fixed assets. One fact, however it is named.
	it("reports a figure given under two of its names once", () => {
		const filing = buildNbbFiling(
			withBalanceSheet({
				"14": { current: 32000, previous: 20000 },
				"(14)": { current: 32000, previous: 20000 },
			}),
		);
		const facts = filing.facts.filter(
			(fact) => fact.code === "14" || fact.code === "(14)",
		);
		expect(facts.map((fact) => fact.period).sort()).toEqual([
			"current",
			"previous",
		]);
		expect(filingValue(filing, "14", "current")).toBe(32000);
		expect(filingValue(filing, "(14)", "current")).toBe(32000);
	});

	it.each([
		{ a: "14", b: "(14)" },
		{ a: "22/27", b: "(22/27)" },
	])("refuses $a and $b given as different figures", ({ a, b }) => {
		expect(() =>
			buildNbbFiling(
				withBalanceSheet({ [a]: { current: 1000 }, [b]: { current: 1001 } }),
			),
		).toThrow(/are the same figure but were given as/);
	});

	it("files an opening balance in the preceding column whichever is asked", () => {
		// `8199P` exists only in the preceding exercise's column, being last
		// year's close; the fixture reports it as `current: 30000`.
		const filing = built();
		const fact = filing.facts.find((candidate) => candidate.code === "8199P");
		expect(fact?.period).toBe("previous");
		expect(filingValue(filing, "8199P", "current")).toBe(30000);
		expect(filingValue(filing, "8199P", "previous")).toBe(30000);
	});
});

describe("validateNbbFiling", () => {
	it("passes a filing whose statutory arithmetic holds", () => {
		const result = validateNbbFiling(built());
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
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
		/** Which statement the broken rubrics belong to; the balance sheet by default. */
		statement?: "incomeStatement";
		break: RubricAmounts;
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
			rule: "10/15 = 10/11 + 12 + 13 + 14 + 15 - 19",
			break: { "13": { current: 6000, previous: 5000 } },
		},
		{
			check: "va_03.01.0_0015",
			rule: "20/58 = 10/49",
			break: { "10/49": { current: 100001, previous: 80000 } },
		},
		{
			// Section 04 is the income statement, whose checks are otherwise
			// unrepresented here. This one is what a filing came back on.
			check: "va_04.00.0_0006",
			rule: "75/76B = 75 + 76B",
			statement: "incomeStatement",
			break: {
				"75/76B": { current: 1000, previous: 0 },
				"75": { current: 0, previous: 0 },
				"76B": { current: 0, previous: 0 },
			},
		},
	];

	// The passing half is the fixture itself: `validateNbbFiling` reports no
	// errors on it, which is asserted once above.
	for (const testCase of cases) {
		it(`${testCase.check} fails when ${testCase.rule} does not`, () => {
			const result = validateNbbFiling(
				buildNbbFiling(
					testCase.statement === "incomeStatement"
						? {
								...MICRO_FILING,
								incomeStatement: {
									...MICRO_FILING.incomeStatement,
									...testCase.break,
								},
							}
						: withBalanceSheet(testCase.break),
				),
			);
			const finding = result.errors.find(
				(candidate) => candidate.check === testCase.check,
			);
			expect(finding, `expected ${testCase.check} to fail`).toBeDefined();
			expect(finding?.severity).toBe("error");
			// Names the broken rubric and the Appendix 2.1 equation it broke.
			const [broken] = Object.keys(testCase.break);
			expect(finding?.codes).toContain(broken);
			expect(finding?.rule).toBe(testCase.rule);
		});
	}
});

/**
 * The association models are not a subset of the company ones: the passif
 * spine and the appropriation account differ, and so do the checks. What the
 * fixture proves is that the association's own rubrics resolve, that a
 * company rubric fed into the association model is refused, and that the
 * association's own statutory identities are evaluated.
 */
describe("association filing (m04)", () => {
	const association = () => buildNbbFiling(ASSOCIATION_FILING);
	const withAssociationBalanceSheet = (overrides: RubricAmounts) =>
		buildNbbFiling({
			...ASSOCIATION_FILING,
			balanceSheet: { ...ASSOCIATION_FILING.balanceSheet, ...overrides },
		});

	it("resolves the association passif spine and class 73 income", () => {
		const filing = association();
		expect(filingValue(filing, "10", "current")).toBe(20000);
		expect(filingValue(filing, "13", "current")).toBe(5000);
		expect(filingValue(filing, "73", "current")).toBe(40000);
		// `10` is the association's funds, which m04-f files under bas:m123 —
		// a member no company model has, where `10` is capital.
		const funds = filing.facts.find((fact) => fact.code === "10");
		expect(funds?.datapoint.dimensions).toMatchObject({ "dim:bas": "bas:m123" });
		expect(
			MICRO_FILING.taxonomy.datapoints.some(
				(datapoint) => datapoint.dimensions["dim:bas"] === "bas:m123",
			),
		).toBe(false);
	});

	it("refuses a company rubric the association model does not have", () => {
		for (const code of ["10/11", "110", "19", "9902"]) {
			expect(
				() => withAssociationBalanceSheet({ [code]: { current: 1 } }),
				code,
			).toThrow(new RegExp(`unknown rubric code "${code}"`));
		}
	});

	it("passes when the association's own arithmetic holds", () => {
		const result = validateNbbFiling(association());
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.evaluated.length).toBeGreaterThan(0);
	});

	// The association's own checks: an equity identity with no capital in
	// it, and the appropriation identity, which has no company counterpart.
	const cases: { check: string; rule: string; break: RubricAmounts }[] = [
		{
			check: "va_03.02.0_0001",
			rule: "10/15 = 10 + 12 + 13 + 14 + 15",
			break: { "10": { current: 21000, previous: 20000 } },
		},
		{
			check: "va_03.02.0_0012",
			rule: "14 = 9906 + 791 - 691",
			break: { "14": { current: 33000, previous: 20000 } },
		},
		{
			check: "va_03.02.0_0011",
			rule: "10/49 = 10/15 + 16 + 17/49",
			break: { "16": { current: 1000, previous: 0 } },
		},
	];

	for (const testCase of cases) {
		it(`${testCase.check} fails when ${testCase.rule} does not hold`, () => {
			const result = validateNbbFiling(
				withAssociationBalanceSheet(testCase.break),
			);
			const finding = result.errors.find(
				(candidate) => candidate.check === testCase.check,
			);
			expect(finding, `expected ${testCase.check} to fail`).toBeDefined();
			expect(finding?.rule).toBe(testCase.rule);
		});
	}

	it("renders against the m04-f entry point", () => {
		const parsed = parseXbrl(renderNbbFiling(association()))!;
		expect(parsed.schemaRefs[0]?.href.endsWith("/m04/m04-f.xsd")).toBe(true);
		expect(parsed.facts.length).toBeGreaterThan(0);
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

	it("DAT 26 rejects a preceding exercise that ends before it starts", () => {
		const result = validateNbbFiling(
			buildNbbFiling(
				withIdentification({
					previousExercise: {
						startDate: "2024-12-31",
						endDate: "2024-01-01",
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

	it("rejects an enterprise number that does not start with 0 or 1", () => {
		// 2925590670 has valid modulo-97 check digits (97 - 29255906 mod 97 =
		// 70); only the leading digit is what makes it not an enterprise number.
		const result = validateNbbFiling(
			buildNbbFiling({
				...MICRO_FILING,
				entity: { ...MICRO_FILING.entity, enterpriseNumber: "2925590670" },
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

	it("rejects a balance sheet with figures for the preceding exercise only", () => {
		const result = validateNbbFiling(
			buildNbbFiling({
				...MICRO_FILING,
				balanceSheet: {
					"20/58": { previous: 80000 },
					"10/49": { previous: 80000 },
				},
			}),
		);
		expect(
			result.errors.some((finding) => finding.check === "balance-sheet-present"),
		).toBe(true);
	});

	it("DAT 31 rejects an amount carrying a third decimal", () => {
		// The builder never writes one, so the check is exercised on a filing
		// whose fact was altered after building — the case DAT 31 exists for.
		const filing = built();
		const facts = filing.facts.map((fact) =>
			fact.code === "20/58" && fact.period === "current"
				? { ...fact, value: "100000.005" }
				: fact,
		);
		const altered: NbbFiling = { ...filing, facts };
		const finding = validateNbbFiling(altered).errors.find(
			(candidate) => candidate.check === "DAT 31",
		);
		expect(finding?.codes).toEqual(["20/58"]);
	});

	it("reports an absent business court as a mandatory mention", () => {
		const { businessCourt: _businessCourt, ...entity } = MICRO_FILING.entity;
		const result = validateNbbFiling(buildNbbFiling({ ...MICRO_FILING, entity }));
		expect(
			result.errors.some((finding) => finding.check === "mandatory-mention"),
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
		expect(rootAttributes(render())["xml:lang"]).toBe(MICRO_FILING.language);
	});
});

/**
 * An accepted micro filing, anonymised, is the oracle for the conventions
 * that are not written down anywhere the taxonomy can enforce them. What
 * the fixture does, our render of the same model has to do too. The fixture
 * predates this release (23.0), so the schema and enum namespaces differ in
 * version and are compared by shape rather than value.
 */
describe("conformance with an accepted filing", () => {
	const example = parseXbrl(
		readFileSync(
			new URL("./fixtures/m87-micro-example.xbrl", import.meta.url),
			"utf8",
		),
	)!;
	const ours = parseXbrl(renderNbbFiling(built()))!;

	it("uses the same entity identifier scheme", () => {
		const schemes = (doc: typeof ours) =>
			new Set(Object.values(doc.contexts).map((c) => c.entity.scheme));
		expect(schemes(example)).toEqual(new Set([ENTERPRISE_NUMBER_SCHEME]));
		expect(schemes(ours)).toEqual(schemes(example));
	});

	it("points at the same entry point of the framework, this release's", () => {
		const path = (href: string) => href.replace(/\/fws\/[\d.]+\//, "/fws/<v>/");
		expect(path(ours.schemaRefs[0]!.href)).toBe(path(example.schemaRefs[0]!.href));
	});

	it("declares every namespace the accepted filing does", () => {
		// By URI, not by prefix: the accepted filing binds the xbrli namespace
		// as the default namespace where we bind it to `xbrli:`, and either is
		// valid. Release-versioned enum namespaces are normalised, the fixture
		// being 23.0 against this release's 26.0.
		const uris = (doc: typeof ours) =>
			new Set(
				Object.values(doc.namespaces).map((uri) =>
					uri.replace(/\/cbso\/[\d.]+\//, "/cbso/<v>/"),
				),
			);
		expect(uris(ours)).toEqual(new Set([...uris(ours), ...uris(example)]));
	});

	it("dates every context as an instant, both exercises alike", () => {
		for (const doc of [example, ours]) {
			const instants = new Set(
				Object.values(doc.contexts).map((c) =>
					c.period.type === "instant" ? c.period.instant : c.period.type,
				),
			);
			expect(instants.size).toBe(1);
			expect([...instants][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("carries both columns as prd:m1 and prd:m2 members", () => {
		const prdMembers = (doc: typeof ours) =>
			new Set(
				Object.values(doc.contexts).flatMap((c) =>
					(c.scenario ?? [])
						.filter((m) => m.dimension.localName === "prd")
						.map((m) => m.member?.localName),
				),
			);
		expect(prdMembers(example)).toEqual(new Set(["m1", "m2"]));
		expect(prdMembers(ours)).toEqual(prdMembers(example));
	});

	it("reports money as the accepted filing does: one EUR unit, decimals INF", () => {
		for (const doc of [example, ours]) {
			expect(Object.keys(doc.units)).toEqual(["EUR"]);
			expect(doc.units["EUR"]?.measures.map((m) => m.localName)).toEqual(["EUR"]);
			const monetary = doc.facts.filter(
				(fact) => fact.type === "item" && fact.unitRef !== undefined,
			);
			expect(monetary.length).toBeGreaterThan(0);
			for (const fact of monetary) {
				if (fact.type !== "item") continue;
				expect(fact.decimals).toBe("INF");
			}
		}
	});
});

/**
 * The evaluator's own rules, hand-picked from its docblock: a subset of
 * XPath with `and`/`or` binding looser than the comparisons, a unary minus,
 * equality to within half a cent, and refusal of anything outside that.
 */
describe("evaluateExpression", () => {
	it("binds and/or looser than the comparisons", () => {
		// (1 = 1) and (2 = 3), not 1 = (1 and 2 ...).
		expect(evaluateExpression("$a eq 1 and $b eq 3", { a: 1, b: 2 })).toBe(false);
		expect(evaluateExpression("$a eq 1 or $b eq 3", { a: 1, b: 2 })).toBe(true);
	});

	it("takes a unary minus", () => {
		expect(evaluateExpression("-$a + 5", { a: 2 })).toBe(3);
		expect(evaluateExpression("$a eq -2", { a: -2 })).toBe(true);
	});

	it("treats amounts as equal to within half a cent", () => {
		// EPSILON is 0.005: a sub-cent rounding difference is equal, a couple
		// of cents is not, and `lt` needs the gap to exceed the tolerance.
		// The values sit clear of the tolerance rather than on it — a
		// difference written 0.005 is 0.005000000000000426 in binary floating
		// point, so asserting the exact boundary would pin IEEE 754 rather
		// than the rule.
		expect(evaluateExpression("$a eq $b", { a: 10, b: 10.004 })).toBe(true);
		expect(evaluateExpression("$a eq $b", { a: 10, b: 10.02 })).toBe(false);
		expect(evaluateExpression("$a lt $b", { a: 10, b: 10.004 })).toBe(false);
		expect(evaluateExpression("$a lt $b", { a: 10, b: 10.02 })).toBe(true);
	});

	it.each([
		{ what: "syntax outside the subset", source: "$a * 2", vars: { a: 1 } },
		{ what: "a variable with no value", source: "$a eq $b", vars: { a: 1 } },
		{ what: "trailing input", source: "$a eq 1 )", vars: { a: 1 } },
	])("throws ExpressionError on $what", ({ source, vars }) => {
		expect(() => evaluateExpression(source, vars)).toThrow(ExpressionError);
	});
});

describe("describeExpression", () => {
	it("rewrites variables to their rubric codes and operators to symbols", () => {
		// The docblock's own example.
		expect(
			describeExpression("$am1 eq $am12 + $am13", {
				am1: ["20/58"],
				am12: ["20"],
				am13: ["21/28"],
			}),
		).toBe("20/58 = 20 + 21/28");
	});

	it("renders a variable that stands for several rubrics as an alternation", () => {
		expect(describeExpression("$a le $b", { a: ["14", "(14)"], b: [] })).toBe(
			"(14 or (14)) ≤ $b",
		);
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
			const parsed = parseXbrl(renderNbbFiling(buildNbbFiling(withCourt)))!;
			expect(
				parsed.facts.some(
					(rendered) =>
						rendered.type === "item" &&
						rendered.name.prefix === prefix &&
						rendered.name.localName === localName &&
						rendered.value === value,
				),
			).toBe(true);
		},
	);

	it("leaves out the business court when there is none to report", () => {
		// Absent is invalid for a deposit, which `validateNbbFiling` reports as
		// a mandatory mention (see structural checks); the builder still has to
		// omit the fact rather than write an empty one.
		const { businessCourt: _businessCourt, ...entity } = MICRO_FILING.entity;
		const filing = buildNbbFiling({ ...MICRO_FILING, entity });
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
		// Against the module's own list rather than a literal: the point is
		// that the four buckets partition every published check, which stays
		// true — and stays worth asserting — across a taxonomy release.
		expect(seen.length).toBe(MICRO_FILING.taxonomy.checks.length);
	});
});

describe("ENUMERATIONS", () => {
	it("carries the business courts a filer picks from, labelled per language", () => {
		const courts = ENUMERATIONS["cct"] ?? [];
		// The two Brussels courts are the reason the court is a declaration at
		// all: one address, two courts, and only the company knows which.
		expect(courts.map((court) => court.code)).toEqual(
			expect.arrayContaining(["m31", "m32"]),
		);
		const brussels = courts.find((court) => court.code === "m31")?.labels;
		expect(brussels?.fr).toMatch(/Bruxelles/);
		expect(brussels?.nl).toMatch(/Brussel/);
	});

	it("carries the post-CSA legal forms a filer reports itself as", () => {
		// The CSA kept the pre-2019 forms in the list beside the ones that
		// replaced them, so a member has to be picked by code: `m610` is the
		// SRL/BV, not the SPRL/BVBA it converted. `m017` is the ASBL and `m060`
		// the economic interest grouping — the three the fixtures file under.
		const lgf = ENUMERATIONS["lgf"] ?? [];
		const byCode = new Map(lgf.map((member) => [member.code, member]));
		const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
		for (const [code, label] of [
			["m610", "Private limited company"],
			["m017", "Non-profit organization"],
			["m060", "Economic interest grouping"],
		]) {
			expect(byCode.has(code ?? ""), `lgf:${code} is missing`).toBe(true);
			expect(collapse(byCode.get(code ?? "")?.labels.en ?? "")).toContain(label);
		}
	});

	it("labels every member in all four filing languages", () => {
		for (const [name, members] of Object.entries(ENUMERATIONS)) {
			for (const member of members) {
				expect(
					Object.keys(member.labels).sort(),
					`${name}:${member.code}`,
				).toEqual(["de", "en", "fr", "nl"]);
			}
		}
	});
});
