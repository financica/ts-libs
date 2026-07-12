# xbrl

`xbrl` is a TypeScript library for parsing [XBRL 2.1](https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html) instance documents into typed JavaScript objects. It focuses on practical extraction of reporting data such as contexts, units, facts, schema references, and footnotes.

The library is designed for application code that needs a dependable parser rather than a full validation pipeline. It resolves QNames, preserves reported values as strings, represents tuples recursively, and returns `null` instead of throwing when the input is empty, malformed, or not an XBRL instance document.

## Installation

```bash
npm install xbrl
```

## Usage

```typescript
import { parseXbrl } from "xbrl";
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

## What The Library Parses

- Contexts, including entity identifiers, periods, segments, and scenarios
- Units, including simple and divide units with resolved measure QNames
- Facts as typed items and tuples
- Schema, linkbase, role, and arcrole references
- Footnote links, locators, resources, and arcs
- Namespace declarations from the root instance element

## Design Notes

- `parseXbrl(xml)` returns an `XbrlInstance` or `null`
- Element and measure names are resolved into `{ namespace, localName, prefix }`
- Fact values stay as strings so callers can apply their own numeric and precision rules
- Contexts and units are indexed by ID for direct lookup from fact references
- Segment and scenario dimensions are parsed into structured members when possible

## API Reference

Detailed API documentation lives in [`docs/api_reference.md`](docs/api_reference.md).

## Development

This repo uses [Bun](https://bun.sh) and the [oxc](https://oxc.rs) toolchain:
oxlint, oxfmt, and [tsdown](https://tsdown.dev) (rolldown-powered bundler).

```bash
bun run test        # run tests once (vitest)
bun run test:watch  # run tests in watch mode
bun run lint        # oxlint
bun run format      # oxfmt
bun run typecheck   # tsc --noEmit
bun run build       # bundle to dist/ with tsdown
bun run ci          # typecheck + lint + test + build
```

## License

MIT
