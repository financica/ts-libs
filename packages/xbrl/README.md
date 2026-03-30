# @ingram-tech/xbrl

TypeScript parser for [XBRL 2.1](https://www.xbrl.org/Specification/XBRL-2.1/REC-2003-12-31/XBRL-2.1-REC-2003-12-31+corrected-errata-2013-02-20.html) instance documents. Parses XBRL instance XML into fully typed objects, extracting contexts, units, facts (items and tuples), and footnote links.

## Installation

```bash
npm install @ingram-tech/xbrl
```

## Usage

```typescript
import { parseXbrl } from "@ingram-tech/xbrl";
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
        const label = unit.measures?.map((m) => m.localName).join("*")
            ?? `${unit.divide?.numerator.map((m) => m.localName).join("*")}/${unit.divide?.denominator.map((m) => m.localName).join("*")}`;
        console.log(`Unit ${id}: ${label}`);
    }

    // Facts (recursive traversal)
    function printFacts(facts: typeof instance.facts, indent = "") {
        for (const fact of facts) {
            if (fact.type === "item") {
                console.log(`${indent}${fact.name.localName} = ${fact.value} [${fact.contextRef}]`);
            } else {
                console.log(`${indent}${fact.name.localName} (tuple)`);
                printFacts(fact.children, indent + "  ");
            }
        }
    }
    printFacts(instance.facts);
}
```

## Design

- **Single function, null return** -- `parseXbrl(xml)` returns an `XbrlInstance` or `null`. No exceptions for malformed input.
- **Full QName resolution** -- All element names and measure references are resolved to `{ namespace, localName, prefix }` using the document's namespace declarations.
- **Items vs tuples** -- Items (elements with `contextRef`) carry values; tuples (elements whose descendants have `contextRef`) group related items. Both are represented as a discriminated union `XbrlFact = XbrlItem | XbrlTuple`.
- **Signed values as strings** -- Item values are kept as strings (or `null` for nil items). Numeric parsing is left to the caller, since XBRL values may have arbitrary precision and the `decimals`/`precision` attributes affect interpretation.
- **Contexts and units by ID** -- Contexts and units are stored as `Record<string, XbrlContext>` and `Record<string, XbrlUnit>` for O(1) lookup from fact references.
- **Dimension-aware** -- Segment and scenario elements are parsed, with XBRL Dimensions (`xbrldi:explicitMember`, `xbrldi:typedMember`) recognized and structured.

## Parsed fields

The parser extracts all elements from an XBRL 2.1 instance document:

- **Namespaces**: all prefix-to-URI mappings from the root element
- **Schema refs** (`link:schemaRef`): taxonomy schema URIs
- **Linkbase refs** (`link:linkbaseRef`): linkbase URIs with role
- **Role/arcrole refs**: custom role and arc role definitions
- **Contexts**: entity identifier (scheme + value), period (instant/duration/forever), optional segment and scenario dimensions
- **Units**: simple measures (product) or divide (numerator/denominator), with QName-resolved measure references
- **Items**: concept QName, contextRef, unitRef, precision/decimals, value (string or null for nil), isNil flag
- **Tuples**: concept QName, recursive children (items and nested tuples)
- **Footnote links**: locators (label + href), footnote resources (label + role + lang + content), arcs (from + to + arcrole + order)

## API reference

### `parseXbrl(xml: string): XbrlInstance | null`

Parse an XBRL 2.1 instance document. Returns `null` for empty input, non-XML content, missing `<xbrl>` root, or documents with no schema references and no facts. Supports both prefixed (`<xbrli:xbrl>`) and unprefixed (`<xbrl>`) root elements.

### Types

#### `XbrlInstance`

| Field | Type | Description |
|-------|------|-------------|
| `namespaces` | `Record<string, string>` | Namespace prefix-to-URI mappings |
| `schemaRefs` | `XbrlSchemaRef[]` | Taxonomy schema references |
| `linkbaseRefs` | `XbrlLinkbaseRef[]` | Linkbase references |
| `roleRefs` | `XbrlRoleRef[]` | Custom role definitions |
| `arcroleRefs` | `XbrlArcroleRef[]` | Custom arc role definitions |
| `contexts` | `Record<string, XbrlContext>` | Contexts by id |
| `units` | `Record<string, XbrlUnit>` | Units by id |
| `facts` | `XbrlFact[]` | Top-level facts (items and tuples) |
| `footnoteLinks` | `XbrlFootnoteLink[]` | Footnote links |

#### `XbrlContext`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Context identifier |
| `entity` | `XbrlEntity` | Entity identifier (scheme + value + optional segment) |
| `period` | `XbrlPeriod` | Reporting period |
| `scenario` | `XbrlDimensionMember[]?` | Scenario dimensions |

#### `XbrlPeriod`

Discriminated union: `{ type: "instant", instant: string }` | `{ type: "duration", startDate: string, endDate: string }` | `{ type: "forever" }`

#### `XbrlUnit`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unit identifier |
| `measures` | `XbrlQName[]?` | Simple unit: product of measures |
| `divide` | `{ numerator: XbrlQName[], denominator: XbrlQName[] }?` | Divide unit |

#### `XbrlFact` = `XbrlItem | XbrlTuple`

#### `XbrlItem`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"item"` | Discriminator |
| `name` | `XbrlQName` | Concept QName |
| `id` | `string?` | Element id |
| `contextRef` | `string` | Context reference |
| `unitRef` | `string?` | Unit reference (numeric items) |
| `precision` | `number \| "INF"?` | Significant digits |
| `decimals` | `number \| "INF"?` | Decimal places |
| `value` | `string \| null` | Text value (null if nil) |
| `isNil` | `boolean` | xsi:nil flag |

#### `XbrlTuple`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"tuple"` | Discriminator |
| `name` | `XbrlQName` | Element QName |
| `id` | `string?` | Element id |
| `children` | `XbrlFact[]` | Child items and tuples |

#### `XbrlQName`

| Field | Type | Description |
|-------|------|-------------|
| `namespace` | `string` | Namespace URI |
| `localName` | `string` | Local name |
| `prefix` | `string?` | Original prefix |

#### `XbrlFootnoteLink`

| Field | Type | Description |
|-------|------|-------------|
| `role` | `string` | Link role URI |
| `locators` | `XbrlFootnoteLocator[]` | Fact locators |
| `footnotes` | `XbrlFootnoteResource[]` | Footnote text resources |
| `arcs` | `XbrlFootnoteArc[]` | Locator-to-footnote arcs |

## Development

```bash
npm test          # run tests in watch mode
npm run test:run  # run tests once
npm run lint      # eslint
npm run format    # prettier
npm run build     # build to dist/
npm run ci        # type-check + lint + test + build
```

## License

MIT
