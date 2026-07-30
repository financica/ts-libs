import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildXbrlInstance, parseXbrl, serializeXbrl } from "../src/index.js";
import type { XbrlInstance, XbrlInstanceInput } from "../src/index.js";

const NS_XBRLI = "http://www.xbrl.org/2003/instance";
const NS_ISO4217 = "http://www.xbrl.org/2003/iso4217";
const NS_EX = "http://example.com/taxonomy";
const NS_DIM = "http://example.com/dim";

const ex = (localName: string, prefix = "ex") => ({
	namespace: NS_EX,
	localName,
	prefix,
});

/** Serialise, parse back, and return what the parser saw. */
function roundTrip(doc: XbrlInstance): XbrlInstance {
	const parsed = parseXbrl(serializeXbrl(doc));
	if (!parsed) throw new Error("serialized document did not parse");
	return parsed;
}

const MINIMAL: XbrlInstanceInput = {
	schemaRefs: [{ href: "http://example.com/taxonomy.xsd" }],
	contexts: [
		{
			id: "d1",
			entity: { scheme: "http://example.com/scheme", value: "123" },
			period: {
				type: "duration",
				startDate: "2025-01-01",
				endDate: "2025-12-31",
			},
		},
	],
	units: [{ id: "EUR", measures: [{ namespace: NS_ISO4217, localName: "EUR" }] }],
	facts: [
		{
			type: "item",
			name: ex("Revenue"),
			contextRef: "d1",
			unitRef: "EUR",
			decimals: 2,
			value: "1000.00",
			isNil: false,
		},
	],
};

describe("buildXbrlInstance", () => {
	it("indexes contexts and units given as arrays", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(Object.keys(doc.contexts)).toEqual(["d1"]);
		expect(Object.keys(doc.units)).toEqual(["EUR"]);
	});

	it("accepts contexts already keyed by id", () => {
		const doc = buildXbrlInstance(MINIMAL);
		const again = buildXbrlInstance({ ...MINIMAL, contexts: doc.contexts });
		expect(again.contexts).toEqual(doc.contexts);
	});

	it("declares a namespace for every QName used", () => {
		const doc = buildXbrlInstance(MINIMAL);
		const declared = Object.values(doc.namespaces);
		expect(declared).toContain(NS_XBRLI);
		expect(declared).toContain(NS_EX);
		expect(declared).toContain(NS_ISO4217);
	});

	it("keeps the prefix a QName was written with", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(doc.namespaces["ex"]).toBe(NS_EX);
	});

	it("rejects a fact referring to a context that is not there", () => {
		expect(() =>
			buildXbrlInstance({
				...MINIMAL,
				facts: [
					{
						type: "item",
						name: ex("Revenue"),
						contextRef: "nope",
						value: "1",
						isNil: false,
					},
				],
			}),
		).toThrow(/unknown context "nope"/);
	});

	it("rejects a fact referring to a unit that is not there", () => {
		expect(() =>
			buildXbrlInstance({
				...MINIMAL,
				facts: [
					{
						type: "item",
						name: ex("Revenue"),
						contextRef: "d1",
						unitRef: "USD",
						value: "1",
						isNil: false,
					},
				],
			}),
		).toThrow(/unknown unit "USD"/);
	});

	it("rejects duplicate context ids", () => {
		const context = {
			id: "d1",
			entity: { scheme: "s", value: "1" },
			period: { type: "instant" as const, instant: "2025-12-31" },
		};
		expect(() =>
			buildXbrlInstance({ ...MINIMAL, contexts: [context, context], facts: [] }),
		).toThrow(/duplicate context id/);
	});

	it("rejects an item carrying both decimals and precision", () => {
		expect(() =>
			buildXbrlInstance({
				...MINIMAL,
				facts: [
					{
						type: "item",
						name: ex("Revenue"),
						contextRef: "d1",
						unitRef: "EUR",
						decimals: 2,
						precision: 4,
						value: "1",
						isNil: false,
					},
				],
			}),
		).toThrow(/both decimals and precision/);
	});

	it("validates facts nested inside tuples", () => {
		expect(() =>
			buildXbrlInstance({
				...MINIMAL,
				facts: [
					{
						type: "tuple",
						name: ex("Group"),
						children: [
							{
								type: "item",
								name: ex("Revenue"),
								contextRef: "missing",
								value: "1",
								isNil: false,
							},
						],
					},
				],
			}),
		).toThrow(/unknown context "missing"/);
	});
});

describe("serializeXbrl round-trips", () => {
	it("preserves a minimal document", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves instant and duration contexts", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{
					id: "i1",
					entity: { scheme: "s", value: "1" },
					period: { type: "instant", instant: "2025-12-31" },
				},
				{
					id: "d1",
					entity: { scheme: "s", value: "1" },
					period: {
						type: "duration",
						startDate: "2025-01-01",
						endDate: "2025-12-31",
					},
				},
				{
					id: "f1",
					entity: { scheme: "s", value: "1" },
					period: { type: "forever" },
				},
			],
			facts: [],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves explicit dimensions in a scenario", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{
					id: "d1",
					entity: { scheme: "s", value: "1" },
					period: { type: "instant", instant: "2025-12-31" },
					scenario: [
						{
							dimension: {
								namespace: NS_DIM,
								localName: "region",
								prefix: "d",
							},
							member: {
								namespace: NS_DIM,
								localName: "north",
								prefix: "d",
							},
							elementName: "xbrldi:explicitMember",
						},
					],
				},
			],
			facts: [],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves typed dimensions, value element and all", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{
					id: "d1",
					entity: { scheme: "s", value: "1" },
					period: { type: "instant", instant: "2025-12-31" },
					scenario: [
						{
							dimension: {
								namespace: NS_DIM,
								localName: "line",
								prefix: "d",
							},
							typedElement: {
								namespace: NS_DIM,
								localName: "str",
								prefix: "d",
							},
							typedValue: "row-1",
							elementName: "xbrldi:typedMember",
						},
					],
				},
			],
			facts: [],
		});
		const parsed = roundTrip(doc);
		expect(parsed).toEqual(doc);
		expect(parsed.contexts["d1"]?.scenario?.[0]?.typedValue).toBe("row-1");
	});

	it("preserves segments on the entity", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{
					id: "d1",
					entity: {
						scheme: "s",
						value: "1",
						segment: [
							{
								dimension: {
									namespace: NS_DIM,
									localName: "unit",
									prefix: "d",
								},
								member: {
									namespace: NS_DIM,
									localName: "retail",
									prefix: "d",
								},
								elementName: "xbrldi:explicitMember",
							},
						],
					},
					period: { type: "instant", instant: "2025-12-31" },
				},
			],
			facts: [],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves divide units", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			units: [
				{
					id: "EURpershare",
					divide: {
						numerator: [{ namespace: NS_ISO4217, localName: "EUR" }],
						denominator: [{ namespace: NS_XBRLI, localName: "shares" }],
					},
				},
			],
			facts: [
				{
					type: "item",
					name: ex("EarningsPerShare"),
					contextRef: "d1",
					unitRef: "EURpershare",
					decimals: 2,
					value: "1.50",
					isNil: false,
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves multi-measure units", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			units: [
				{
					id: "EURsq",
					measures: [
						{ namespace: NS_ISO4217, localName: "EUR" },
						{ namespace: NS_ISO4217, localName: "EUR" },
					],
				},
			],
			facts: [],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves precision as an alternative to decimals", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "item",
					name: ex("Revenue"),
					contextRef: "d1",
					unitRef: "EUR",
					precision: 4,
					value: "1000",
					isNil: false,
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves INF for decimals and precision", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "item",
					name: ex("Revenue"),
					contextRef: "d1",
					unitRef: "EUR",
					decimals: "INF",
					value: "1000.00",
					isNil: false,
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves nil facts", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "item",
					name: ex("Revenue"),
					contextRef: "d1",
					unitRef: "EUR",
					decimals: 2,
					value: null,
					isNil: true,
				},
			],
		});
		const parsed = roundTrip(doc);
		expect(parsed).toEqual(doc);
		expect(parsed.facts[0]).toMatchObject({ isNil: true, value: null });
	});

	it("preserves nested tuples", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "tuple",
					name: ex("Outer"),
					id: "t1",
					children: [
						{
							type: "item",
							name: ex("Revenue"),
							contextRef: "d1",
							unitRef: "EUR",
							decimals: 2,
							value: "10.00",
							isNil: false,
						},
						{
							type: "tuple",
							name: ex("Inner"),
							children: [
								{
									type: "item",
									name: ex("Revenue"),
									contextRef: "d1",
									unitRef: "EUR",
									decimals: 2,
									value: "20.00",
									isNil: false,
								},
							],
						},
					],
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves footnote links", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			footnoteLinks: [
				{
					role: "http://www.xbrl.org/2003/role/link",
					locators: [{ label: "fact1", href: "#f1" }],
					footnotes: [
						{
							label: "fn1",
							role: "http://www.xbrl.org/2003/role/footnote",
							lang: "en",
							content: "Restated.",
						},
					],
					arcs: [
						{
							from: "fact1",
							to: "fn1",
							arcrole: "http://www.xbrl.org/2003/arcrole/fact-footnote",
							order: 1,
						},
					],
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("preserves linkbase, role and arcrole references", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			linkbaseRefs: [{ href: "labels.xml", role: "http://example.com/label" }],
			roleRefs: [{ roleURI: "http://example.com/role", href: "roles.xsd#r1" }],
			arcroleRefs: [
				{ arcroleURI: "http://example.com/arc", href: "roles.xsd#a1" },
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("escapes markup in values and attributes", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{
					id: "d1",
					entity: {
						scheme: 'http://example.com/?a="b"&c',
						value: "A & B <Ltd>",
					},
					period: { type: "instant", instant: "2025-12-31" },
				},
			],
			facts: [
				{
					type: "item",
					name: ex("Note"),
					contextRef: "d1",
					value: 'Profit rose <5% & "held"',
					isNil: false,
				},
			],
		});
		const parsed = roundTrip(doc);
		expect(parsed).toEqual(doc);
		expect(parsed.facts[0]).toMatchObject({ value: 'Profit rose <5% & "held"' });
	});
});

describe("serializeXbrl output", () => {
	it("is byte-identical across runs", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(serializeXbrl(doc)).toBe(serializeXbrl(doc));
	});

	it("does not depend on how contexts were supplied", () => {
		const fromArray = buildXbrlInstance(MINIMAL);
		const fromRecord = buildXbrlInstance({
			...MINIMAL,
			contexts: fromArray.contexts,
		});
		expect(serializeXbrl(fromRecord)).toBe(serializeXbrl(fromArray));
	});

	it("writes contexts in document order", () => {
		const entity = { scheme: "s", value: "1" };
		const period = { type: "instant" as const, instant: "2025-12-31" };
		const doc = buildXbrlInstance({
			...MINIMAL,
			contexts: [
				{ id: "c10", entity, period },
				{ id: "c2", entity, period },
				{ id: "c1", entity, period },
			],
			facts: [],
		});
		const ids = [
			...serializeXbrl(doc).matchAll(/<xbrli:context id="([^"]+)"/g),
		].map((m) => m[1]);
		expect(ids).toEqual(["c10", "c2", "c1"]);
	});

	it("omits the XML declaration on request", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(serializeXbrl(doc, { xmlDeclaration: false })).not.toContain("<?xml");
	});

	it("writes xml:lang when asked", () => {
		const doc = buildXbrlInstance(MINIMAL);
		expect(serializeXbrl(doc, { lang: "fr" })).toContain('xml:lang="fr"');
	});

	it("invents a prefix for a namespace that has none", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "item",
					name: { namespace: "http://example.com/other", localName: "Thing" },
					contextRef: "d1",
					value: "1",
					isNil: false,
				},
			],
		});
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("does not collide when two namespaces prefer the same prefix", () => {
		const doc = buildXbrlInstance({
			...MINIMAL,
			facts: [
				{
					type: "item",
					name: { namespace: NS_EX, localName: "A", prefix: "ex" },
					contextRef: "d1",
					value: "1",
					isNil: false,
				},
				{
					type: "item",
					name: {
						namespace: "http://example.com/second",
						localName: "B",
						prefix: "ex",
					},
					contextRef: "d1",
					value: "2",
					isNil: false,
				},
			],
		});
		const uris = new Set(Object.values(doc.namespaces));
		expect(uris.has(NS_EX)).toBe(true);
		expect(uris.has("http://example.com/second")).toBe(true);
		const parsed = roundTrip(doc);
		expect(parsed.facts.map((f) => f.name.namespace)).toEqual([
			NS_EX,
			"http://example.com/second",
		]);
	});
});

describe("a real filed instance", () => {
	const path = fileURLToPath(
		new URL("./fixtures/nbb-cbso-m87.xbrl", import.meta.url),
	);
	const original = parseXbrl(readFileSync(path, "utf-8"));

	it("parses", () => {
		expect(original).not.toBeNull();
	});

	it("survives a round trip through the writer", () => {
		const doc = buildXbrlInstance(original!);
		expect(roundTrip(doc)).toEqual(doc);
	});

	it("keeps every context, unit and fact", () => {
		const parsed = roundTrip(buildXbrlInstance(original!));
		expect(Object.keys(parsed.contexts)).toHaveLength(
			Object.keys(original!.contexts).length,
		);
		expect(parsed.facts).toHaveLength(original!.facts.length);
		expect(Object.keys(parsed.units)).toEqual(Object.keys(original!.units));
	});

	it("keeps the typed dimension values that identify open-table rows", () => {
		const typed = Object.values(original!.contexts)
			.flatMap((c) => c.scenario ?? [])
			.filter((m) => m.typedElement);
		expect(typed.length).toBeGreaterThan(0);
		expect(typed.every((m) => m.typedValue)).toBe(true);
	});
});
