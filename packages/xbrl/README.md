# @financica/xbrl

A TypeScript library for reading and writing [XBRL 2.1](https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html) instance documents as typed JavaScript objects. It focuses on practical reporting data: contexts, units, facts, schema references, and footnotes.

The library is for application code that needs a parser and serialiser rather than a full validation pipeline. It resolves QNames into `{ namespace, localName, prefix }`, preserves reported values as strings so callers can apply their own numeric and precision rules, represents tuples recursively, indexes contexts and units by ID for direct lookup from fact references, parses segment and scenario dimensions into structured members where it can, and returns `null` instead of throwing when the input is empty, malformed, or not an XBRL instance document.

Parsing and writing are symmetric: `parseXbrl(serializeXbrl(doc))` gives back `doc`.

## Installation

```bash
npm install @financica/xbrl
```

## Usage

```typescript
import { parseXbrl } from "@financica/xbrl";
import { readFileSync } from "node:fs";

const xml = readFileSync("filing.xbrl", "utf-8");
const instance = parseXbrl(xml);

if (instance) {
	// Schema references
	for (const ref of instance.schemaRefs) {
		console.log(`Taxonomy: ${ref.href}`);
	}

	// Contexts
	for (const [id, ctx] of Object.entries(instance.contexts)) {
		console.log(`Context ${id}: ${ctx.entity.value} (${ctx.period.type})`);
	}

	// Units
	for (const [id, unit] of Object.entries(instance.units)) {
		const label =
			unit.measures?.map((m) => m.localName).join("*") ??
			`${unit.divide?.numerator.map((m) => m.localName).join("*")}/${unit.divide?.denominator.map((m) => m.localName).join("*")}`;
		console.log(`Unit ${id}: ${label}`);
	}

	// Facts (recursive traversal)
	function printFacts(facts: typeof instance.facts, indent = "") {
		for (const fact of facts) {
			if (fact.type === "item") {
				console.log(
					`${indent}${fact.name.localName} = ${fact.value} [${fact.contextRef}]`,
				);
			} else {
				console.log(`${indent}${fact.name.localName} (tuple)`);
				printFacts(fact.children, indent + "  ");
			}
		}
	}
	printFacts(instance.facts);
}
```

## Writing

```typescript
import { buildXbrlInstance, serializeXbrl } from "@financica/xbrl";

const doc = buildXbrlInstance({
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
	units: [
		{
			id: "EUR",
			measures: [
				{ namespace: "http://www.xbrl.org/2003/iso4217", localName: "EUR" },
			],
		},
	],
	facts: [
		{
			type: "item",
			name: {
				namespace: "http://example.com/taxonomy",
				localName: "Revenue",
				prefix: "ex",
			},
			contextRef: "d1",
			unitRef: "EUR",
			decimals: 2,
			value: "1000.00",
			isNil: false,
		},
	],
});

const xml = serializeXbrl(doc);
```

`buildXbrlInstance` normalises the document and rejects one that could not be
serialised as a well-formed instance (duplicate IDs, dangling references,
conflicting precision — see the [API reference](docs/api_reference.md#buildxbrlinstanceinput-xbrlinstanceinput-xbrlinstance)).
Namespace declarations are worked out from the QNames actually used, so you
only declare a prefix when you care which one it is.

Output is deterministic. The same document always produces the same bytes, and
contexts, units and facts are written in document order — filers regenerate and
diff their filings, so stable output matters.

## What it parses

- Contexts, including entity identifiers, periods, segments, and scenarios
- Units, including simple and divide units with resolved measure QNames
- Facts as typed items and tuples
- Schema, linkbase, role, and arcrole references
- Footnote links, locators, resources, and arcs
- Namespace declarations from the root instance element

## API Reference

Detailed API documentation lives in [`docs/api_reference.md`](docs/api_reference.md).

## Development

Standard scripts — see the [repository README](../../README.md#getting-started).

## License

MIT
