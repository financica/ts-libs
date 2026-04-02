# API Reference

## `parseXbrl(xml: string): XbrlInstance | null`

Parses an XBRL 2.1 instance document and returns a typed `XbrlInstance`.

The function returns `null` for:

- Empty input
- Non-XML input
- Documents without an `<xbrl>` root element
- Documents that contain neither schema references nor facts

Both prefixed (`<xbrli:xbrl>`) and unprefixed (`<xbrl>`) root elements are supported.

## Exported Types

### `XbrlInstance`

| Field | Type | Description |
|-------|------|-------------|
| `namespaces` | `Record<string, string>` | Namespace prefix-to-URI mappings |
| `schemaRefs` | `XbrlSchemaRef[]` | Taxonomy schema references |
| `linkbaseRefs` | `XbrlLinkbaseRef[]` | Linkbase references |
| `roleRefs` | `XbrlRoleRef[]` | Custom role definitions |
| `arcroleRefs` | `XbrlArcroleRef[]` | Custom arcrole definitions |
| `contexts` | `Record<string, XbrlContext>` | Contexts by ID |
| `units` | `Record<string, XbrlUnit>` | Units by ID |
| `facts` | `XbrlFact[]` | Top-level facts |
| `footnoteLinks` | `XbrlFootnoteLink[]` | Footnote links |

### `XbrlSchemaRef`

| Field | Type | Description |
|-------|------|-------------|
| `href` | `string` | Schema URI |
| `role` | `string?` | XLink role |
| `arcrole` | `string?` | XLink arcrole |

### `XbrlLinkbaseRef`

| Field | Type | Description |
|-------|------|-------------|
| `href` | `string` | Linkbase URI |
| `role` | `string?` | XLink role |
| `arcrole` | `string?` | XLink arcrole |

### `XbrlRoleRef`

| Field | Type | Description |
|-------|------|-------------|
| `roleURI` | `string` | Role URI being defined |
| `href` | `string` | Schema URI containing the definition |

### `XbrlArcroleRef`

| Field | Type | Description |
|-------|------|-------------|
| `arcroleURI` | `string` | Arcrole URI being defined |
| `href` | `string` | Schema URI containing the definition |

### `XbrlQName`

| Field | Type | Description |
|-------|------|-------------|
| `namespace` | `string` | Namespace URI |
| `localName` | `string` | Local name |
| `prefix` | `string?` | Original prefix |

### `XbrlContext`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Context identifier |
| `entity` | `XbrlEntity` | Entity identifier and optional segment |
| `period` | `XbrlPeriod` | Reporting period |
| `scenario` | `XbrlDimensionMember[]?` | Scenario members |

### `XbrlEntity`

| Field | Type | Description |
|-------|------|-------------|
| `scheme` | `string` | Identifier scheme URI |
| `value` | `string` | Identifier value |
| `segment` | `XbrlDimensionMember[]?` | Segment members |

### `XbrlDimensionMember`

| Field | Type | Description |
|-------|------|-------------|
| `dimension` | `XbrlQName?` | Dimension QName |
| `member` | `XbrlQName?` | Explicit member QName |
| `typedValue` | `string?` | Typed member value |
| `elementName` | `string?` | Raw element name for unrecognized members |
| `textContent` | `string?` | Raw text content |

### `XbrlPeriod`

Discriminated union:

- `{ type: "instant"; instant: string }`
- `{ type: "duration"; startDate: string; endDate: string }`
- `{ type: "forever" }`

### `XbrlUnit`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unit identifier |
| `measures` | `XbrlQName[]?` | Product of measures |
| `divide` | `{ numerator: XbrlQName[]; denominator: XbrlQName[] }?` | Divide unit |

### `XbrlFact`

Union type: `XbrlItem | XbrlTuple`

### `XbrlItem`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"item"` | Discriminator |
| `name` | `XbrlQName` | Concept QName |
| `id` | `string?` | Element ID |
| `contextRef` | `string` | Context reference |
| `unitRef` | `string?` | Unit reference |
| `precision` | `number \| "INF"?` | Precision metadata |
| `decimals` | `number \| "INF"?` | Decimals metadata |
| `value` | `string \| null` | Fact value |
| `isNil` | `boolean` | `xsi:nil` flag |

### `XbrlTuple`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"tuple"` | Discriminator |
| `name` | `XbrlQName` | Tuple QName |
| `id` | `string?` | Element ID |
| `children` | `XbrlFact[]` | Nested facts |

### `XbrlFootnoteLink`

| Field | Type | Description |
|-------|------|-------------|
| `role` | `string` | Link role URI |
| `locators` | `XbrlFootnoteLocator[]` | Fact locators |
| `footnotes` | `XbrlFootnoteResource[]` | Footnote resources |
| `arcs` | `XbrlFootnoteArc[]` | Locator-to-footnote arcs |

### `XbrlFootnoteLocator`

| Field | Type | Description |
|-------|------|-------------|
| `label` | `string` | XLink label |
| `href` | `string` | Fact reference URI |

### `XbrlFootnoteResource`

| Field | Type | Description |
|-------|------|-------------|
| `label` | `string` | XLink label |
| `role` | `string` | Footnote role URI |
| `lang` | `string?` | XML language |
| `content` | `string` | Footnote text or XHTML content |

### `XbrlFootnoteArc`

| Field | Type | Description |
|-------|------|-------------|
| `from` | `string` | Source locator label |
| `to` | `string` | Target footnote label |
| `arcrole` | `string` | Arcrole URI |
| `order` | `number?` | Ordering hint |
