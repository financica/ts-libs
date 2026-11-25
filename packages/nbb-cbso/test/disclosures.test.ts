import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseXbrl } from "@financica/xbrl";
import type { XbrlInstance } from "@financica/xbrl";
import {
	buildNbbFiling,
	disclosureCapabilities,
	ENUMERATIONS,
	MANDATE_FUNCTIONS,
	renderNbbFiling,
	validateNbbFiling,
} from "../src/index.js";
import type { NbbFilingInput } from "../src/index.js";
import m04f25 from "../src/taxonomies/25.0/m04-f.js";
import m05f25 from "../src/taxonomies/25.0/m05-f.js";
import m08f25 from "../src/taxonomies/25.0/m08-f.js";
import m87f25 from "../src/taxonomies/25.0/m87-f.js";
import m04f from "../src/taxonomies/26.0/m04-f.js";
import m05f from "../src/taxonomies/26.0/m05-f.js";
import m08f from "../src/taxonomies/26.0/m08-f.js";
import m87f from "../src/taxonomies/26.0/m87-f.js";
import {
	ASSOCIATION_FILING,
	FULL_MICRO_FILING,
	INCOMPLETE_MICRO_FILING,
	MICRO_FILING,
} from "./filing.js";

/**
 * One line per item fact: metric, scenario members (typed members as
 * `dim~value`, the period dimension included) and value. What a fact means,
 * independent of context ids, prefixes and order.
 */
function facts(doc: XbrlInstance, keep: (members: string[]) => boolean = () => true) {
	return doc.facts
		.flatMap((fact) => {
			if (fact.type !== "item") return [];
			const members = (doc.contexts[fact.contextRef]?.scenario ?? []).map((m) =>
				m.member
					? `${m.dimension?.localName}=${m.member.localName}`
					: `${m.dimension?.localName}~${m.typedValue}`,
			);
			if (!keep(members)) return [];
			const raw = fact.value ?? "";
			const value = raw.includes(":") ? raw.split(":")[1] : raw;
			return [`${fact.name.localName}|${members.sort().join(",")}|${value}`];
		})
		.sort();
}

/** A complete Belgian address, for rows whose address is not under test. */
const HOME = { street: "Rue Neuve", houseNumber: "1", postalCode: "1000" };

const render = (input: NbbFilingInput) =>
	parseXbrl(renderNbbFiling(buildNbbFiling(input)))!;

const findings = (input: NbbFilingInput) =>
	validateNbbFiling(buildNbbFiling(input)).errors.filter(
		(f) => f.field !== undefined,
	);

const warnings = (input: NbbFilingInput) =>
	validateNbbFiling(buildNbbFiling(input)).warnings.filter(
		(f) => f.field !== undefined,
	);

/** The director and accountant of the accepted filing, through our API. */
const ACCEPTED_PEOPLE: NbbFilingInput = {
	...MICRO_FILING,
	directors: [
		{
			holder: {
				kind: "natural",
				firstName: "CAMILLE",
				lastName: "PEETERS",
				address: {
					street: "CHAUSSEE DE TIRLEMONT",
					houseNumber: "22",
					postbox: "7",
					postalCode: "5000",
				},
			},
			mandates: [{ function: "m13" }],
		},
	],
	accountantDeclaration: {
		missionEntrusted: true,
		practitioners: [
			{
				holder: {
					kind: "legal",
					name: "AUDIT LYS SRL",
					enterpriseNumber: "0228121630",
					memberNumber: "80.304.372",
					address: {
						street: "RUE HAUTE",
						houseNumber: "16",
						postbox: "12",
						postalCode: "9000",
					},
				},
				missions: ["A", "B", "C", "D"],
			},
		],
	},
};

/**
 * The accepted filing is the independent source for the typed members: which
 * dimensions key a row, how `dim:open` numbers a list, and that names go out
 * as written.
 */
describe("sections 2.1 and 2.2 against an accepted filing", () => {
	const example = parseXbrl(
		readFileSync(
			new URL("./fixtures/m87-micro-example.xbrl", import.meta.url),
			"utf8",
		),
	)!;
	const people = (members: string[]) =>
		members.some(
			(m) => /^psn=m1[2-9]$/.test(m) || m === "psn=m10" || m === "psn=m11",
		);

	it("reports the same facts, with the same typed members, for the same people", () => {
		expect(facts(render(ACCEPTED_PEOPLE), people)).toEqual(facts(example, people));
	});

	it("passes validation", () => {
		expect(findings(ACCEPTED_PEOPLE)).toEqual([]);
	});
});

describe("section 2.1", () => {
	const filing: NbbFilingInput = {
		...MICRO_FILING,
		directors: [
			{
				holder: {
					kind: "natural",
					firstName: "Ana",
					lastName: "Silva",
					profession: "Engineer",
					address: HOME,
				},
				mandates: [
					{ function: "m30", start: "2021-03-01" },
					{ function: "13", start: "2023-01-01", end: "2027-06-30" },
				],
			},
			{
				holder: {
					kind: "legal",
					name: "Holding BV",
					enterpriseNumber: "0403170701",
					address: {
						street: "Kerkstraat",
						houseNumber: "5",
						postalCode: "2000",
					},
					representatives: [
						{
							firstName: "Jan",
							lastName: "Peeters",
							address: {
								street: "Kerkstraat",
								houseNumber: "7",
								postalCode: "2000",
							},
						},
					],
				},
				mandates: [{ function: "m13" }],
			},
			{
				role: "auditor",
				holder: {
					kind: "natural",
					firstName: "Marie",
					lastName: "Dubois",
					memberNumber: "A01234",
					address: {
						street: "Rue de Rivoli",
						houseNumber: "10",
						postalCode: "75001",
						city: "Paris",
						country: "FR",
					},
				},
				mandates: [{ function: "m61" }],
			},
		],
	};
	const ours = render(filing);

	it("numbers each holder's mandates from 1 under dim:open, keyed by name", () => {
		expect(facts(ours, (m) => m.includes("bas=m115"))).toEqual(
			[
				"list1|afnp~Ana,annp~Silva,bas=m115,dcl=m6,open~1,part=m2,psn=m12|m30",
				"list1|afnp~Ana,annp~Silva,bas=m115,dcl=m6,open~2,part=m2,psn=m12|m13",
				"dte1|afnp~Ana,annp~Silva,bas=m115,mmt=m1,open~1,part=m2,psn=m12|2021-03-01",
				"dte1|afnp~Ana,annp~Silva,bas=m115,mmt=m1,open~2,part=m2,psn=m12|2023-01-01",
				"dte1|afnp~Ana,annp~Silva,bas=m115,mmt=m2,open~2,part=m2,psn=m12|2027-06-30",
				"list1|anlp~Holding BV,bas=m115,dcl=m6,open~1,part=m2,psn=m10|m13",
				"list1|acfn~Marie,acnp~Dubois,bas=m115,dcl=m6,open~1,part=m2,psn=m15|m61",
			].sort(),
		);
	});

	it("files a legal person's representative under the firm's name and their own", () => {
		expect(facts(ours, (m) => m.includes("psn=m11"))).toEqual(
			[
				"list1|anlp~Holding BV,aprf~Jan,aprn~Peeters,bas=m31,dcl=m7,part=m2,psn=m11|m001",
				"str2|anlp~Holding BV,aprf~Jan,aprn~Peeters,bas=m31,ctc=m1,part=m2,psn=m11|Kerkstraat",
				"str2|anlp~Holding BV,aprf~Jan,aprn~Peeters,bas=m31,ctc=m2,part=m2,psn=m11|7",
				"list1|anlp~Holding BV,aprf~Jan,aprn~Peeters,bas=m31,ctc=m4,part=m2,psn=m11|m2000",
				"list1|anlp~Holding BV,aprf~Jan,aprn~Peeters,bas=m31,ctc=m6,part=m2,psn=m11|mBE",
			].sort(),
		);
	});

	it("reports a foreign postal code as text, a Belgian one from the list", () => {
		const postal = facts(
			ours,
			(m) =>
				m.includes("ctc=m4") &&
				!m.includes("psn=m11") &&
				m.some((x) => x.includes("~")),
		);
		expect(postal).toEqual(
			[
				"list1|afnp~Ana,annp~Silva,bas=m31,ctc=m4,part=m2,psn=m12|m1000",
				"list1|anlp~Holding BV,bas=m31,ctc=m4,part=m2,psn=m10|m2000",
				"str2|acfn~Marie,acnp~Dubois,bas=m31,ctc=m4,part=m2,psn=m15|75001",
			].sort(),
		);
	});

	it("passes validation", () => {
		expect(findings(filing)).toEqual([]);
	});

	it.each([
		{
			name: "a function the model does not list",
			directors: [
				{
					holder: {
						kind: "natural" as const,
						firstName: "A",
						lastName: "B",
						address: HOME,
					},
					mandates: [{ function: "m99" }],
				},
			],
			field: "directors[0].mandates[0].function",
		},
		{
			name: "a mandate ending before it starts",
			directors: [
				{
					holder: {
						kind: "natural" as const,
						firstName: "A",
						lastName: "B",
						address: HOME,
					},
					mandates: [
						{ function: "m13", start: "2024-01-01", end: "2023-01-01" },
					],
				},
			],
			field: "directors[0].mandates[0].end",
		},
		{
			name: "a membership number for a director",
			directors: [
				{
					holder: {
						kind: "natural" as const,
						firstName: "A",
						lastName: "B",
						memberNumber: "1",
						address: HOME,
					},
					mandates: [{ function: "m13" }],
				},
			],
			field: "directors[0].holder.memberNumber",
		},
		{
			name: "the same person twice",
			directors: [
				{
					holder: {
						kind: "natural" as const,
						firstName: "A",
						lastName: "B",
						address: HOME,
					},
					mandates: [{ function: "m13" }],
				},
				{
					holder: {
						kind: "natural" as const,
						firstName: "A",
						lastName: "B",
						address: HOME,
					},
					mandates: [{ function: "m30" }],
				},
			],
			field: "directors[1]",
		},
		{
			name: "an enterprise number with wrong check digits",
			directors: [
				{
					holder: {
						kind: "legal" as const,
						name: "X",
						enterpriseNumber: "0403170702",
						address: HOME,
					},
					mandates: [{ function: "m13" }],
				},
			],
			field: "directors[0].holder.enterpriseNumber",
		},
	])("refuses $name at its field", ({ directors, field }) => {
		expect(findings({ ...MICRO_FILING, directors }).map((f) => f.field)).toEqual([
			field,
		]);
	});
});

describe("section 2.2", () => {
	it("records a declaration that no mission was entrusted, with no practitioner", () => {
		const filing = {
			...MICRO_FILING,
			accountantDeclaration: { missionEntrusted: false },
		};
		expect(facts(render(filing), (m) => m.includes("psn=m16"))).toEqual([
			"bln1|bas=m28,dcl=m28,part=m2,psn=m16|false",
		]);
		expect(findings(filing)).toEqual([]);
	});

	it("lists several practitioners, each with their own missions", () => {
		const filing: NbbFilingInput = {
			...MICRO_FILING,
			accountantDeclaration: {
				missionEntrusted: true,
				practitioners: [
					{
						holder: {
							kind: "natural",
							firstName: "Eva",
							lastName: "Claes",
							memberNumber: "1",
							address: HOME,
						},
						missions: ["A", "B"],
					},
					{
						holder: {
							kind: "legal",
							name: "Fid SRL",
							enterpriseNumber: "0403170701",
							memberNumber: "2",
							address: HOME,
						},
						missions: ["C"],
					},
				],
			},
		};
		expect(facts(render(filing), (m) => m.includes("dcl=m29"))).toEqual(
			[
				"list1|bas=m28,dcl=m29,open~1,part=m2,psn=m19,safn~Eva,sann~Claes|mA",
				"list1|bas=m28,dcl=m29,open~2,part=m2,psn=m19,safn~Eva,sann~Claes|mB",
				"list1|bas=m28,dcl=m29,open~1,part=m2,psn=m17,sanl~Fid SRL|mC",
			].sort(),
		);
		expect(findings(filing)).toEqual([]);
	});

	it("refuses an entrusted mission that no practitioner lists as C or D", () => {
		const filing: NbbFilingInput = {
			...MICRO_FILING,
			accountantDeclaration: {
				missionEntrusted: true,
				practitioners: [
					{
						holder: {
							kind: "legal",
							name: "Fid SRL",
							enterpriseNumber: "0403170701",
							memberNumber: "2",
							address: HOME,
						},
						missions: ["A"],
					},
				],
			},
		};
		expect(findings(filing).map((f) => f.field)).toEqual([
			"accountantDeclaration.practitioners",
		]);
	});
});

describe("sections 6.3, 6.4 and 6.6", () => {
	const text = 'Ligne 1 & <deux>\n\nParagraphe "2"';
	const filing: NbbFilingInput = {
		...MICRO_FILING,
		notes: { "9500": { current: 2500 } },
		disclosures: {
			offBalanceSheet: {
				litigationAndCommitments: [
					{ description: "Litige commercial", amount: 12000 },
					{ description: "Garantie locative non chiffrable" },
				],
				pensionPlans: "Assurance groupe",
				other: [{ description: "Leasing", amount: -300.5 }],
			},
			directorReceivableTerms: "Taux 2 %, remboursable en 2027",
			otherInformation: text,
		},
	};
	const ours = render(filing);

	it("files each commitment line's text and amount under the same line number", () => {
		expect(facts(ours, (m) => m.includes("bas=m91"))).toEqual(
			[
				"str1|bas=m91,dcl=m16,open~1,part=m6,sts=m20|Litige commercial",
				"am1|bas=m91,open~1,part=m6,prd=m1,sts=m20|12000.00",
				"str1|bas=m91,dcl=m16,open~2,part=m6,sts=m20|Garantie locative non chiffrable",
			].sort(),
		);
	});

	it("keeps the sign of an other off-balance commitment", () => {
		expect(facts(ours, (m) => m.includes("bas=m99"))).toEqual(
			[
				"am2|bas=m99,dcl=m16,open~1,part=m6,prd=m1,typ=m2|-300.50",
				"str1|bas=m99,dcl=m16,open~1,part=m6,prd=m1,typ=m2|Leasing",
			].sort(),
		);
	});

	it("preserves line breaks and escapes markup in narrative text", () => {
		const other = ours.facts.find(
			(fact) =>
				fact.type === "item" &&
				(ours.contexts[fact.contextRef]?.scenario ?? []).some(
					(m) => m.member?.localName === "m108",
				),
		);
		expect(other?.type === "item" ? other.value : undefined).toBe(text);
	});

	it("files the 6.4 terms beside the 9500 rubric", () => {
		expect(facts(ours, (m) => m.includes("psn=m5"))).toEqual(
			[
				"am1|bas=m9,ntr=m3,part=m6,prd=m1,psn=m5,spec=m74|2500.00",
				"str1|bas=m9,dcl=m18,part=m6,psn=m5,spec=m74|Taux 2 %, remboursable en 2027",
			].sort(),
		);
	});

	it("passes validation", () => {
		expect(findings(filing)).toEqual([]);
	});

	it("files nothing for sections left out", () => {
		const bare = facts(render(MICRO_FILING));
		expect(
			bare.filter(
				(line) =>
					/part=m[67]/.test(line) &&
					/open~|str1/.test(line) &&
					!line.includes("bas=m107"),
			),
		).toEqual([]);
	});
});

describe("sections 7.1 and 7.2", () => {
	const filing: NbbFilingInput = {
		...MICRO_FILING,
		disclosures: {
			participations: [
				{
					name: "Acme Inc.",
					legalFormOther: "Corporation",
					address: {
						street: "Main St",
						houseNumber: "1",
						postalCode: "10001",
						city: "New York",
						country: "US",
					},
					rights: [
						{
							nature: "Common shares",
							heldDirectly: 600,
							percentageDirect: 0.6,
						},
					],
					lastAccounts: {
						closingDate: "2024-12-31",
						currency: "usd",
						equity: -15000,
						netResult: -2500.25,
					},
				},
			],
			unlimitedLiabilityEntities: [
				{
					name: "Partners SNC",
					enterpriseNumber: "0403170701",
					legalForm: "m612",
					address: HOME,
				},
			],
		},
	};
	const ours = render(filing);

	it("reports an investee's figures in its own currency, signed", () => {
		const money = ours.facts.filter(
			(fact) =>
				fact.type === "item" &&
				fact.name.localName === "am2" &&
				fact.unitRef !== "EUR",
		);
		expect(
			money.map((fact) =>
				fact.type === "item" ? [fact.value, fact.unitRef] : [],
			),
		).toEqual([
			["-15000.00", "USD"],
			["-2500.25", "USD"],
		]);
		expect(ours.units["USD"]?.measures?.[0]?.localName).toBe("USD");
	});

	it("measures share counts in shares and percentages as pure fractions", () => {
		const unitOf = (metric: string) =>
			ours.facts.flatMap((fact) =>
				fact.type === "item" && fact.name.localName === metric
					? [[fact.value, fact.unitRef]]
					: [],
			);
		expect(unitOf("int2")).toEqual([["600", "shares"]]);
		expect(unitOf("pct1")).toEqual([["0.6", "pure"]]);
	});

	it("keys the rights row on the investee's name and a line number", () => {
		expect(facts(ours, (m) => m.includes("bas=m117"))).toEqual(
			[
				"int2|bas=m117,open~1,part=m7,psn=m1,ptpn~Acme Inc.,rls=m7,spec=m87|600",
				"pct1|bas=m117,open~1,part=m7,psn=m1,ptpn~Acme Inc.,rls=m7,spec=m87|0.6",
				"str2|bas=m117,dcl=m7,open~1,part=m7,psn=m1,ptpn~Acme Inc.,rls=m7|Common shares",
			].sort(),
		);
	});

	it("warns that an entity with no publication code needs its accounts attached", () => {
		expect(warnings(filing).map((f) => f.field)).toEqual([
			"disclosures.unlimitedLiabilityEntities[0].publicationCode",
		]);
		expect(findings(filing)).toEqual([]);
	});

	it("refuses a percentage given as a whole number", () => {
		expect(
			findings({
				...MICRO_FILING,
				disclosures: {
					participations: [
						{
							name: "X",
							legalFormOther: "Ltd",
							address: {
								street: "High St",
								houseNumber: "1",
								postalCode: "SW1A 1AA",
								city: "London",
								country: "GB",
							},
							rights: [{ nature: "Parts", percentageDirect: 60 }],
							lastAccounts: {
								closingDate: "2024-12-31",
								currency: "GBP",
								equity: 1,
								netResult: 1,
							},
						},
					],
				},
			}).map((f) => f.field),
		).toEqual(["disclosures.participations[0].rights[0].percentageDirect"]);
	});
});

describe("disclosureCapabilities", () => {
	const all = {
		directors: true,
		accountantDeclaration: true,
		offBalanceSheet: true,
		directorReceivableTerms: true,
		otherInformation: true,
		participations: true,
		unlimitedLiabilityEntities: true,
	};
	const none = Object.fromEntries(Object.keys(all).map((key) => [key, false]));

	it.each([
		{ name: "26.0 m87-f", module: m87f, expected: all },
		{ name: "25.0 m87-f", module: m87f25, expected: all },
		// The association models lay sections 2, 6 and 7 out differently
		// (`s.02.01.0.ghi`, …); none of this mapping applies to them.
		{ name: "26.0 m04-f", module: m04f, expected: none },
		{ name: "26.0 m05-f", module: m05f, expected: none },
		{ name: "26.0 m08-f", module: m08f, expected: none },
		{ name: "25.0 m04-f", module: m04f25, expected: none },
		{ name: "25.0 m05-f", module: m05f25, expected: none },
		{ name: "25.0 m08-f", module: m08f25, expected: none },
	])("$name", ({ module, expected }) => {
		expect(disclosureCapabilities(module)).toEqual(expected);
	});

	it("refuses a director on a model without section 2.1, at the field", () => {
		expect(
			findings({
				...ASSOCIATION_FILING,
				directors: ACCEPTED_PEOPLE.directors ?? [],
			}).map((f) => f.field),
		).toEqual(["directors"]);
	});
});

describe("generated enumerations", () => {
	it("label every mandate function the model lists", () => {
		const codes = new Set(ENUMERATIONS["fct"]?.map((member) => member.code));
		expect(MANDATE_FUNCTIONS.filter((code) => !codes.has(code))).toEqual([]);
	});
});

/** NBB completeness-rule identifiers a filing's validation reports. */
const ruleIds = (input: NbbFilingInput) => {
	const result = validateNbbFiling(buildNbbFiling(input));
	return [
		...new Set(
			[...result.errors, ...result.warnings]
				.map((finding) => finding.check)
				.filter((check) => check.startsWith("oa_")),
		),
	].sort();
};

/**
 * The model's completeness rules (`m87-f-other-formula.xml`), which the NBB
 * applies on upload. The expected identifiers are what Arelle reports for the
 * same rendered instance against the 26.0.15 package; `arelle.test.ts`
 * re-derives them in CI, so this list cannot drift from the NBB's.
 */
describe("completeness rules", () => {
	it("reports none for a complete filing", () => {
		expect(ruleIds(FULL_MICRO_FILING)).toEqual([]);
	});

	it("reports the rules Arelle reports for a filing broken once per row", () => {
		expect(ruleIds(INCOMPLETE_MICRO_FILING)).toEqual(
			[
				"oa_01.00.1_0011",
				"oa_01.00.2_0008",
				"oa_02.01.0_0003",
				"oa_02.01.0_0004",
				"oa_02.01.0_0006",
				"oa_02.01.0_0007",
				"oa_02.01.0_0009",
				"oa_02.01.0_0017",
				"oa_02.01.0_0019",
				"oa_02.01.0_0020",
				"oa_02.01.0_0022",
				"oa_02.01.0_0028",
				"oa_02.01.0_0029",
				"oa_02.01.0_0031",
				"oa_02.01.0_0032",
				"oa_02.01.0_0034",
				"oa_02.01.0_0036",
				"oa_02.01.0_0047",
				"oa_02.01.0_0049",
				"oa_02.01.0_0050",
				"oa_02.01.0_0052",
				"oa_02.01.0_0054",
				"oa_02.01.0_0058",
				"oa_02.01.0_0059",
				"oa_02.01.0_0061",
				"oa_02.01.0_0062",
				"oa_02.02.0_0003",
				"oa_02.02.0_0004",
				"oa_02.02.0_0006",
				"oa_02.02.0_0007",
				"oa_02.02.0_0009",
				"oa_02.02.0_0011",
				"oa_02.02.0_0016",
				"oa_02.02.0_0018",
				"oa_02.02.0_0019",
				"oa_02.02.0_0021",
				"oa_02.02.0_0023",
				"oa_02.02.0_0025",
				"oa_02.02.0_0026",
				"oa_07.01.0_0003",
				"oa_07.01.0_0006",
				"oa_07.01.0_0008",
				"oa_07.01.0_0009",
				"oa_07.01.0_0010",
				"oa_07.01.0_0011",
				"oa_07.01.0_0012",
				"oa_07.01.0_0015",
				"oa_07.01.0_0018",
				"oa_07.02.0_0003",
				"oa_07.02.0_0004",
				"oa_07.02.0_0007",
			].sort(),
		);
	});

	it("reports a missing house number at the field, under the row's own rule", () => {
		const director = FULL_MICRO_FILING.directors?.[0];
		if (director?.holder.kind !== "natural" || !director.holder.address) {
			throw new Error("fixture changed");
		}
		const filing: NbbFilingInput = {
			...FULL_MICRO_FILING,
			directors: [
				{
					...director,
					holder: {
						...director.holder,
						address: { ...director.holder.address, houseNumber: " " },
					},
				},
			],
		};
		const findings = validateNbbFiling(buildNbbFiling(filing)).errors.filter((f) =>
			f.check.startsWith("oa_"),
		);
		expect(findings.map((f) => [f.check, f.field])).toEqual([
			["oa_02.01.0_0020", "directors[0].holder.address.houseNumber"],
		]);
	});
});
