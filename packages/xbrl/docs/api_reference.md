# API Reference

## `parseXbrl(xml: string): XbrlInstance | null`

Parses an XBRL 2.1 instance document and returns a typed `XbrlInstance`.

The function returns `null` for:

- Empty input
- Non-XML input
- Documents without an `<xbrl>` root element
- Documents that contain neither schema references nor facts

Both prefixed (`<xbrli:xbrl>`) and unprefixed (`<xbrl>`) root elements are supported.

## `buildXbrlInstance(input: XbrlInstanceInput): XbrlInstance`

Assembles a typed instance document from its parts. Contexts and units may be
given as arrays or as ID-keyed records; the result always holds records.

The function fills in the namespace declarations implied by the QNames actually
used, and rewrites every QName to carry the prefix it will be written with, so
that a built document round-trips exactly rather than merely equivalently.

It throws when the document could not be serialised into a well-formed
instance:

- Duplicate context or unit IDs
- A fact referring to a context or unit that is not present
- An item carrying both `decimals` and `precision`

Facts nested inside tuples are checked too.

## `serializeXbrl(doc: XbrlInstance, options?: XbrlSerializeOptions): string`

Serialises an instance document to XBRL 2.1 XML.

Output is deterministic: the same document always produces the same bytes, and
contexts, units and facts are written in document order (rationale in the
[README](../README.md#writing)).

Handles instant, duration and forever periods; entity segments and scenarios;
explicit and typed dimensions; simple, multi-measure and divide units;
`decimals` and `precision`; `xsi:nil`; and nested tuples.

```typescript
const doc = buildXbrlInstance({ schemaRefs, contexts, units, facts });
const xml = serializeXbrl(doc, { lang: "fr" });
```

### `XbrlSerializeOptions`

| Field            | Type       | Description                                  |
| ---------------- | ---------- | -------------------------------------------- |
| `indent`         | `string?`  | Indentation per level. Defaults to a tab     |
| `xmlDeclaration` | `boolean?` | Emit the XML declaration. Defaults to `true` |
| `lang`           | `string?`  | Value for `xml:lang` on the root element     |

## Exported Types

### `XbrlInstance`

| Field           | Type                          | Description                      |
| --------------- | ----------------------------- | -------------------------------- |
| `namespaces`    | `Record<string, string>`      | Namespace prefix-to-URI mappings |
| `schemaRefs`    | `XbrlSchemaRef[]`             | Taxonomy schema references       |
| `linkbaseRefs`  | `XbrlLinkbaseRef[]`           | Linkbase references              |
| `roleRefs`      | `XbrlRoleRef[]`               | Custom role definitions          |
| `arcroleRefs`   | `XbrlArcroleRef[]`            | Custom arcrole definitions       |
| `contexts`      | `Record<string, XbrlContext>` | Contexts by ID                   |
| `units`         | `Record<string, XbrlUnit>`    | Units by ID                      |
| `facts`         | `XbrlFact[]`                  | Top-level facts                  |
| `footnoteLinks` | `XbrlFootnoteLink[]`          | Footnote links                   |

### `XbrlSchemaRef`

| Field     | Type      | Description   |
| --------- | --------- | ------------- |
| `href`    | `string`  | Schema URI    |
| `role`    | `string?` | XLink role    |
| `arcrole` | `string?` | XLink arcrole |

### `XbrlLinkbaseRef`

| Field     | Type      | Description   |
| --------- | --------- | ------------- |
| `href`    | `string`  | Linkbase URI  |
| `role`    | `string?` | XLink role    |
| `arcrole` | `string?` | XLink arcrole |

### `XbrlRoleRef`

| Field     | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `roleURI` | `string` | Role URI being defined               |
| `href`    | `string` | Schema URI containing the definition |

### `XbrlArcroleRef`

| Field        | Type     | Description                          |
| ------------ | -------- | ------------------------------------ |
| `arcroleURI` | `string` | Arcrole URI being defined            |
| `href`       | `string` | Schema URI containing the definition |

### `XbrlQName`

| Field       | Type      | Description     |
| ----------- | --------- | --------------- |
| `namespace` | `string`  | Namespace URI   |
| `localName` | `string`  | Local name      |
| `prefix`    | `string?` | Original prefix |

### `XbrlContext`

| Field      | Type                     | Description                            |
| ---------- | ------------------------ | -------------------------------------- |
| `id`       | `string`                 | Context identifier                     |
| `entity`   | `XbrlEntity`             | Entity identifier and optional segment |
| `period`   | `XbrlPeriod`             | Reporting period                       |
| `scenario` | `XbrlDimensionMember[]?` | Scenario members                       |

### `XbrlEntity`

| Field     | Type                     | Description           |
| --------- | ------------------------ | --------------------- |
| `scheme`  | `string`                 | Identifier scheme URI |
| `value`   | `string`                 | Identifier value      |
| `segment` | `XbrlDimensionMember[]?` | Segment members       |

### `XbrlDimensionMember`

| Field          | Type         | Description                                         |
| -------------- | ------------ | --------------------------------------------------- |
| `dimension`    | `XbrlQName?` | Dimension QName                                     |
| `member`       | `XbrlQName?` | Explicit member QName                               |
| `typedValue`   | `string?`    | Text of the element carrying a typed member's value |
| `typedElement` | `XbrlQName?` | Name of the element carrying that value             |
| `elementName`  | `string?`    | Raw element name for unrecognized members           |
| `textContent`  | `string?`    | Raw text content                                    |

A typed dimension holds its value in a child element declared by the
dimension's typed domain, not in `xbrldi:typedMember` itself. `typedValue` is
that child's text and `typedElement` is its name; both are needed to write the
member back out.

### `XbrlPeriod`

Discriminated union:

- `{ type: "instant"; instant: string }`
- `{ type: "duration"; startDate: string; endDate: string }`
- `{ type: "forever" }`

### `XbrlUnit`

| Field      | Type                                                    | Description         |
| ---------- | ------------------------------------------------------- | ------------------- |
| `id`       | `string`                                                | Unit identifier     |
| `measures` | `XbrlQName[]?`                                          | Product of measures |
| `divide`   | `{ numerator: XbrlQName[]; denominator: XbrlQName[] }?` | Divide unit         |

### `XbrlFact`

Union type: `XbrlItem | XbrlTuple`

### `XbrlItem`

| Field        | Type               | Description        |
| ------------ | ------------------ | ------------------ |
| `type`       | `"item"`           | Discriminator      |
| `name`       | `XbrlQName`        | Concept QName      |
| `id`         | `string?`          | Element ID         |
| `contextRef` | `string`           | Context reference  |
| `unitRef`    | `string?`          | Unit reference     |
| `precision`  | `number \| "INF"?` | Precision metadata |
| `decimals`   | `number \| "INF"?` | Decimals metadata  |
| `value`      | `string \| null`   | Fact value         |
| `isNil`      | `boolean`          | `xsi:nil` flag     |

### `XbrlTuple`

| Field      | Type         | Description   |
| ---------- | ------------ | ------------- |
| `type`     | `"tuple"`    | Discriminator |
| `name`     | `XbrlQName`  | Tuple QName   |
| `id`       | `string?`    | Element ID    |
| `children` | `XbrlFact[]` | Nested facts  |

### `XbrlFootnoteLink`

| Field       | Type                     | Description              |
| ----------- | ------------------------ | ------------------------ |
| `role`      | `string`                 | Link role URI            |
| `locators`  | `XbrlFootnoteLocator[]`  | Fact locators            |
| `footnotes` | `XbrlFootnoteResource[]` | Footnote resources       |
| `arcs`      | `XbrlFootnoteArc[]`      | Locator-to-footnote arcs |

### `XbrlFootnoteLocator`

| Field   | Type     | Description        |
| ------- | -------- | ------------------ |
| `label` | `string` | XLink label        |
| `href`  | `string` | Fact reference URI |

### `XbrlFootnoteResource`

| Field     | Type      | Description                    |
| --------- | --------- | ------------------------------ |
| `label`   | `string`  | XLink label                    |
| `role`    | `string`  | Footnote role URI              |
| `lang`    | `string?` | XML language                   |
| `content` | `string`  | Footnote text or XHTML content |

### `XbrlFootnoteArc`

| Field     | Type      | Description           |
| --------- | --------- | --------------------- |
| `from`    | `string`  | Source locator label  |
| `to`      | `string`  | Target footnote label |
| `arcrole` | `string`  | Arcrole URI           |
| `order`   | `number?` | Ordering hint         |
