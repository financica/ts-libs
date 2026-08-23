import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { XbrlParseError, parseXbrl } from "../src/parser.js";
import type { XbrlItem, XbrlTuple } from "../src/types.js";

function fixture(name: string): string {
	return readFileSync(join(import.meta.dirname, "fixtures", name), "utf-8");
}

/** Recursively collect all items from a fact tree. */
function collectItems(facts: (XbrlItem | XbrlTuple)[]): XbrlItem[] {
	const items: XbrlItem[] = [];
	for (const f of facts) {
		if (f.type === "item") items.push(f);
		else items.push(...collectItems(f.children));
	}
	return items;
}

/** Recursively collect all tuples from a fact tree. */
function collectTuples(facts: (XbrlItem | XbrlTuple)[]): XbrlTuple[] {
	const tuples: XbrlTuple[] = [];
	for (const f of facts) {
		if (f.type === "tuple") {
			tuples.push(f);
			tuples.push(...collectTuples(f.children));
		}
	}
	return tuples;
}

// ── Validation ────────────────────────────────────────────────────────

const wrap = (
	body: string,
) => `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
		xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink"
		xmlns:eg="http://example.com/taxonomy">
		<link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>${body}</xbrli:xbrl>`;

describe("validation", () => {
	it.each([
		["empty string", ""],
		["non-XML input", "this is not xml"],
		[
			"unbalanced tags",
			'<xbrl xmlns="http://www.xbrl.org/2003/instance"><a></xbrl>',
		],
	])("throws XbrlParseError for %s", (_label, xml) => {
		expect(() => parseXbrl(xml)).toThrow(XbrlParseError);
	});

	it("sets name and cause on a malformed-XML error", () => {
		let error: unknown;
		try {
			parseXbrl("<root><a></root>");
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(XbrlParseError);
		expect((error as XbrlParseError).name).toBe("XbrlParseError");
		expect((error as XbrlParseError).cause).toBeDefined();
	});

	it("returns null for XML without xbrl root", () => {
		expect(parseXbrl("<root><child/></root>")).toBeNull();
	});

	it("returns null for an xbrl root outside the xbrli namespace", () => {
		expect(
			parseXbrl('<xbrl xmlns="http://example.com/not-xbrl"></xbrl>'),
		).toBeNull();
	});

	it("throws XbrlParseError for an xbrl document without schemaRef", () => {
		expect(() =>
			parseXbrl('<xbrl xmlns="http://www.xbrl.org/2003/instance"></xbrl>'),
		).toThrow(XbrlParseError);
	});

	it.each([
		["a context without id", "<xbrli:context><xbrli:entity/></xbrli:context>"],
		[
			"a context without period",
			`<xbrli:context id="c1"><xbrli:entity>
				<xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
			</xbrli:entity></xbrli:context>`,
		],
		[
			"a unit without id",
			"<xbrli:unit><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>",
		],
		["an undeclared namespace prefix", '<nope:Fact contextRef="c1">1</nope:Fact>'],
	])("throws XbrlParseError for %s", (_label, body) => {
		expect(() => parseXbrl(wrap(body))).toThrow(XbrlParseError);
	});

	it("leaves optional item attributes absent rather than filled", () => {
		const result = parseXbrl(
			wrap(`<xbrli:context id="c1"><xbrli:entity>
				<xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
			</xbrli:entity><xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period></xbrli:context>
			<eg:Name contextRef="c1">Acme</eg:Name>`),
		)!;
		const item = result.facts[0] as XbrlItem;
		expect(item.contextRef).toBe("c1");
		expect(item).not.toHaveProperty("id");
		expect(item).not.toHaveProperty("unitRef");
		expect(item).not.toHaveProperty("decimals");
		expect(item).not.toHaveProperty("precision");
		expect(result.contexts["c1"]).not.toHaveProperty("scenario");
		expect(result.contexts["c1"]!.entity).not.toHaveProperty("segment");
		expect(result.schemaRefs[0]).not.toHaveProperty("role");
	});
});

// ── Belgian NPO filing ───────────────────────────────────────────────

describe("belgian-npo.xbrl", () => {
	const result = parseXbrl(fixture("belgian-npo.xbrl"));

	it("parses successfully", () => {
		expect(result).not.toBeNull();
	});

	const inst = result!;

	// ── Namespaces ────────────────────────────────────────────────

	describe("namespaces", () => {
		it("extracts namespace declarations", () => {
			expect(inst.namespaces["xbrli"]).toBe("http://www.xbrl.org/2003/instance");
			expect(inst.namespaces["link"]).toBe("http://www.xbrl.org/2003/linkbase");
			expect(inst.namespaces["iso4217"]).toBe("http://www.xbrl.org/2003/iso4217");
			expect(inst.namespaces["pfs"]).toBe(
				"http://www.nbb.be/be/fr/pfs/ci/2017-04-01",
			);
		});
	});

	// ── Schema refs ───────────────────────────────────────────────

	describe("schema references", () => {
		it("parses one schema reference", () => {
			expect(inst.schemaRefs).toHaveLength(1);
		});

		it("extracts schema href", () => {
			expect(inst.schemaRefs[0]!.href).toBe(
				"http://www.nbb.be/be/fr/pfs/npo/full/pfs-npo-full-2017-04-01.xsd",
			);
		});

		it("extracts schema arcrole", () => {
			expect(inst.schemaRefs[0]!.arcrole).toBe(
				"http://www.w3.org/1999/xlink/properties/linkbase",
			);
		});
	});

	// ── Contexts ──────────────────────────────────────────────────

	describe("contexts", () => {
		it("parses 5 contexts", () => {
			expect(Object.keys(inst.contexts)).toHaveLength(5);
		});

		it("parses instant context", () => {
			const ctx = inst.contexts["CurrentInstant"]!;
			expect(ctx.id).toBe("CurrentInstant");
			expect(ctx.entity.scheme).toBe("http://www.fgov.be");
			expect(ctx.entity.value).toBe("BE0410682657");
			expect(ctx.period.type).toBe("instant");
			if (ctx.period.type === "instant") {
				expect(ctx.period.instant).toBe("2016-12-31");
			}
		});

		it("parses duration context", () => {
			const ctx = inst.contexts["CurrentDuration"]!;
			expect(ctx.period.type).toBe("duration");
			if (ctx.period.type === "duration") {
				expect(ctx.period.startDate).toBe("2016-01-01");
				expect(ctx.period.endDate).toBe("2016-12-31");
			}
		});

		it("parses preceding year contexts", () => {
			expect(inst.contexts["PrecedingInstant"]).toBeDefined();
			expect(inst.contexts["PrecedingDuration"]).toBeDefined();
			const pi = inst.contexts["PrecedingInstant"]!;
			if (pi.period.type === "instant") {
				expect(pi.period.instant).toBe("2015-12-31");
			}
		});

		it("parses N-2 context", () => {
			const ctx = inst.contexts["N-2Instant"]!;
			if (ctx.period.type === "instant") {
				expect(ctx.period.instant).toBe("2014-12-31");
			}
		});

		it("shares same entity across all contexts", () => {
			for (const ctx of Object.values(inst.contexts)) {
				expect(ctx.entity.scheme).toBe("http://www.fgov.be");
				expect(ctx.entity.value).toBe("BE0410682657");
			}
		});
	});

	// ── Units ─────────────────────────────────────────────────────

	describe("units", () => {
		it("parses 3 units", () => {
			expect(Object.keys(inst.units)).toHaveLength(3);
		});

		it("parses EUR currency unit", () => {
			const u = inst.units["U-EUR"]!;
			expect(u.id).toBe("U-EUR");
			expect(u.measures).toHaveLength(1);
			expect(u.measures![0]!.localName).toBe("EUR");
			expect(u.measures![0]!.namespace).toBe("http://www.xbrl.org/2003/iso4217");
		});

		it("parses shares unit", () => {
			const u = inst.units["U-Shares"]!;
			expect(u.measures).toHaveLength(1);
			expect(u.measures![0]!.localName).toBe("shares");
			expect(u.measures![0]!.namespace).toBe("http://www.xbrl.org/2003/instance");
		});

		it("parses pure unit", () => {
			const u = inst.units["U-Pure"]!;
			expect(u.measures).toHaveLength(1);
			expect(u.measures![0]!.localName).toBe("pure");
		});
	});

	// ── Facts overview ────────────────────────────────────────────

	describe("facts", () => {
		const allItems = collectItems(inst.facts);
		const allTuples = collectTuples(inst.facts);

		it("extracts 589 items total", () => {
			expect(allItems).toHaveLength(589);
		});

		it("extracts tuples", () => {
			expect(allTuples.length).toBeGreaterThan(0);
		});

		it("has no footnote links", () => {
			expect(inst.footnoteLinks).toHaveLength(0);
		});
	});

	// ── Top-level tuples ──────────────────────────────────────────

	describe("tuples", () => {
		it("first fact is EntityInformation tuple", () => {
			const f = inst.facts[0]!;
			expect(f.type).toBe("tuple");
			expect(f.name.localName).toBe("EntityInformation");
			expect(f.name.prefix).toBe("pfs-gcd");
		});

		it("EntityInformation contains nested tuples and items", () => {
			const ei = inst.facts[0]! as XbrlTuple;
			expect(ei.children.length).toBeGreaterThan(0);

			// Should have EntityName tuple
			const entityName = ei.children.find(
				(c) => c.name.localName === "EntityName",
			);
			expect(entityName).toBeDefined();
			expect(entityName!.type).toBe("tuple");
		});

		it("extracts entity name from nested item", () => {
			const ei = inst.facts[0]! as XbrlTuple;
			const entityName = ei.children.find(
				(c) => c.name.localName === "EntityName",
			) as XbrlTuple;
			const nameItem = entityName.children.find(
				(c) => c.name.localName === "EntityCurrentLegalName",
			) as XbrlItem;
			expect(nameItem.type).toBe("item");
			expect(nameItem.value).toBe("Xerius Sociaal Verzekeringsfonds");
			expect(nameItem.contextRef).toBe("CurrentDuration");
		});
	});

	// ── Items ─────────────────────────────────────────────────────

	describe("items", () => {
		const allItems = collectItems(inst.facts);

		it("parses monetary items with EUR unit", () => {
			const monetary = allItems.filter((i) => i.unitRef === "U-EUR");
			expect(monetary.length).toBeGreaterThan(0);
		});

		it("parses numeric items with decimals=INF", () => {
			const infDecimals = allItems.filter((i) => i.decimals === "INF");
			expect(infDecimals.length).toBeGreaterThan(0);
		});

		it("parses item values as strings", () => {
			const item = allItems.find(
				(i) => i.name.localName === "EntityCurrentLegalName",
			);
			expect(item).toBeDefined();
			expect(item!.value).toBe("Xerius Sociaal Verzekeringsfonds");
		});

		it("parses numeric values", () => {
			const item = allItems.find(
				(i) =>
					i.name.localName === "PersonnelCostsTotal" &&
					i.contextRef === "CurrentDuration",
			);
			expect(item).toBeDefined();
			expect(item!.value).toBe("8291585");
			expect(item!.unitRef).toBe("U-EUR");
			expect(item!.decimals).toBe("INF");
		});

		it("parses items with different context refs", () => {
			const contexts = new Set(allItems.map((i) => i.contextRef));
			expect(contexts.size).toBeGreaterThan(1);
			expect(contexts.has("CurrentInstant")).toBe(true);
			expect(contexts.has("CurrentDuration")).toBe(true);
			expect(contexts.has("PrecedingDuration")).toBe(true);
		});

		it("parses pure unit items", () => {
			const pure = allItems.filter((i) => i.unitRef === "U-Pure");
			expect(pure.length).toBeGreaterThan(0);

			const hoursItem = pure.find(
				(i) => i.name.localName === "NumberHoursActuallyWorkedTotal",
			);
			expect(hoursItem).toBeDefined();
		});
	});

	// ── QName resolution ──────────────────────────────────────────

	describe("QName resolution", () => {
		it("resolves fact element namespaces", () => {
			const allItems = collectItems(inst.facts);
			const item = allItems.find(
				(i) => i.name.localName === "PersonnelCostsTotal",
			);
			expect(item).toBeDefined();
			expect(item!.name.namespace).toBe(
				"http://www.nbb.be/be/fr/pfs/ci/2017-04-01",
			);
			expect(item!.name.prefix).toBe("pfs");
		});

		it("resolves unit measure QNames", () => {
			const eur = inst.units["U-EUR"]!.measures![0]!;
			expect(eur.namespace).toBe("http://www.xbrl.org/2003/iso4217");
			expect(eur.localName).toBe("EUR");
			expect(eur.prefix).toBe("iso4217");
		});
	});
});

// ── Synthetic test cases ──────────────────────────────────────────────

describe("synthetic XBRL documents", () => {
	it("parses minimal valid instance", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">ENTITY1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:instant>2024-12-31</xbrli:instant>
    </xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1">
    <xbrli:measure>iso4217:USD</xbrli:measure>
  </xbrli:unit>
  <eg:Revenue contextRef="c1" unitRef="u1" decimals="0">1000000</eg:Revenue>
</xbrli:xbrl>`;

		const result = parseXbrl(xml);
		expect(result).not.toBeNull();
		expect(result!.schemaRefs).toHaveLength(1);
		expect(Object.keys(result!.contexts)).toHaveLength(1);
		expect(Object.keys(result!.units)).toHaveLength(1);

		const items = collectItems(result!.facts);
		expect(items).toHaveLength(1);
		expect(items[0]!.name.localName).toBe("Revenue");
		expect(items[0]!.value).toBe("1000000");
		expect(items[0]!.contextRef).toBe("c1");
		expect(items[0]!.unitRef).toBe("u1");
		expect(items[0]!.decimals).toBe(0);
	});

	it("parses forever period", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="forever">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:forever/>
    </xbrli:period>
  </xbrli:context>
  <eg:Name contextRef="forever">Test Entity</eg:Name>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		const ctx = result.contexts["forever"]!;
		expect(ctx.period.type).toBe("forever");
	});

	it("parses nil items", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <eg:Amount contextRef="c1" unitRef="u1" xsi:nil="true"/>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		const items = collectItems(result.facts);
		expect(items).toHaveLength(1);
		expect(items[0]!.isNil).toBe(true);
		expect(items[0]!.value).toBeNull();
	});

	it("parses precision attribute", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
  <eg:Amount contextRef="c1" unitRef="u1" precision="6">123456</eg:Amount>
  <eg:Exact contextRef="c1" unitRef="u1" precision="INF">42</eg:Exact>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		const items = collectItems(result.facts);
		expect(items[0]!.precision).toBe(6);
		expect(items[0]!.decimals).toBeUndefined();
		expect(items[1]!.precision).toBe("INF");
	});

	it("parses divide units", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="eps">
    <xbrli:divide>
      <xbrli:unitNumerator><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unitNumerator>
      <xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator>
    </xbrli:divide>
  </xbrli:unit>
  <eg:EPS contextRef="c1" unitRef="eps" decimals="2">3.14</eg:EPS>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		const u = result.units["eps"]!;
		expect(u.divide).toBeDefined();
		expect(u.divide!.numerator).toHaveLength(1);
		expect(u.divide!.numerator[0]!.localName).toBe("EUR");
		expect(u.divide!.denominator).toHaveLength(1);
		expect(u.divide!.denominator[0]!.localName).toBe("shares");
		expect(u.measures).toBeUndefined();
	});

	it("parses footnote links", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <eg:Revenue id="f1" contextRef="c1" unitRef="u1" decimals="0">1000000</eg:Revenue>
  <link:footnoteLink xlink:type="extended" xlink:role="http://www.xbrl.org/2003/role/link">
    <link:loc xlink:type="locator" xlink:label="fact1" xlink:href="#f1"/>
    <link:footnote xlink:type="resource" xlink:label="fn1"
      xlink:role="http://www.xbrl.org/2003/role/footnote"
      xml:lang="en">Includes merger effects.</link:footnote>
    <link:footnoteArc xlink:type="arc" xlink:from="fact1" xlink:to="fn1"
      xlink:arcrole="http://www.xbrl.org/2003/arcrole/fact-footnote" order="1"/>
  </link:footnoteLink>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		expect(result.footnoteLinks).toHaveLength(1);

		const fl = result.footnoteLinks[0]!;
		expect(fl.role).toBe("http://www.xbrl.org/2003/role/link");

		expect(fl.locators).toHaveLength(1);
		expect(fl.locators[0]!.label).toBe("fact1");
		expect(fl.locators[0]!.href).toBe("#f1");

		expect(fl.footnotes).toHaveLength(1);
		expect(fl.footnotes[0]!.label).toBe("fn1");
		expect(fl.footnotes[0]!.content).toBe("Includes merger effects.");
		expect(fl.footnotes[0]!.lang).toBe("en");

		expect(fl.arcs).toHaveLength(1);
		expect(fl.arcs[0]!.from).toBe("fact1");
		expect(fl.arcs[0]!.to).toBe("fn1");
		expect(fl.arcs[0]!.arcrole).toBe(
			"http://www.xbrl.org/2003/arcrole/fact-footnote",
		);
		expect(fl.arcs[0]!.order).toBe(1);
	});

	it("parses non-numeric items without unitRef", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <eg:CompanyName contextRef="c1">Acme Corp</eg:CompanyName>
  <eg:IsActive contextRef="c1">true</eg:IsActive>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		const items = collectItems(result.facts);
		expect(items).toHaveLength(2);
		expect(items[0]!.unitRef).toBeUndefined();
		expect(items[0]!.value).toBe("Acme Corp");
		expect(items[1]!.value).toBe("true");
	});

	it("parses multiple schema and linkbase refs", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema1.xsd"/>
  <link:schemaRef xlink:type="simple" xlink:href="schema2.xsd"/>
  <link:linkbaseRef xlink:type="simple" xlink:href="labels.xml"
    xlink:role="http://www.xbrl.org/2003/role/labelLinkbaseRef"
    xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <eg:Fact contextRef="c1">value</eg:Fact>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		expect(result.schemaRefs).toHaveLength(2);
		expect(result.linkbaseRefs).toHaveLength(1);
		expect(result.linkbaseRefs[0]!.role).toBe(
			"http://www.xbrl.org/2003/role/labelLinkbaseRef",
		);
	});

	it("parses tuples with nested items", () => {
		const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:link="http://www.xbrl.org/2003/linkbase"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
            xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://example.com">E1</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2024-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <eg:Manager>
    <eg:Name contextRef="c1">Jane Doe</eg:Name>
    <eg:Title contextRef="c1">CEO</eg:Title>
  </eg:Manager>
  <eg:Manager>
    <eg:Name contextRef="c1">John Smith</eg:Name>
    <eg:Title contextRef="c1">CFO</eg:Title>
  </eg:Manager>
</xbrli:xbrl>`;

		const result = parseXbrl(xml)!;
		expect(result.facts).toHaveLength(2);

		const mgr1 = result.facts[0]! as XbrlTuple;
		expect(mgr1.type).toBe("tuple");
		expect(mgr1.name.localName).toBe("Manager");
		expect(mgr1.children).toHaveLength(2);

		const name = mgr1.children[0]! as XbrlItem;
		expect(name.type).toBe("item");
		expect(name.value).toBe("Jane Doe");

		const allItems = collectItems(result.facts);
		expect(allItems).toHaveLength(4);
	});

	it("parses unprefixed xbrl root element", () => {
		const xml = `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance"
      xmlns:link="http://www.xbrl.org/2003/linkbase"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      xmlns:eg="http://example.com/taxonomy">
  <link:schemaRef xlink:type="simple" xlink:href="schema.xsd"/>
  <context id="c1">
    <entity>
      <identifier scheme="http://example.com">E1</identifier>
    </entity>
    <period><instant>2024-12-31</instant></period>
  </context>
  <eg:Fact contextRef="c1">hello</eg:Fact>
</xbrl>`;

		const result = parseXbrl(xml);
		expect(result).not.toBeNull();
		expect(Object.keys(result!.contexts)).toHaveLength(1);
		const items = collectItems(result!.facts);
		expect(items).toHaveLength(1);
		expect(items[0]!.value).toBe("hello");
	});
});
