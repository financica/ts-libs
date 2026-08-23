# Changelog

## 0.2.0

### Added

- **`buildXbrlInstance` and `serializeXbrl` write XBRL 2.1 instance documents.** `buildXbrlInstance` assembles a typed document from its parts and rejects one that could not be serialised: duplicate ids, dangling context or unit refs, items carrying both `decimals` and `precision`. `serializeXbrl` emits deterministic XML in document order, so regenerated filings diff clean, and normalises QNames onto the prefix they are written with, which makes `parseXbrl(serializeXbrl(doc))` equal to `doc` rather than merely equivalent.

### Fixed

- **Typed dimension values are no longer `undefined`.** The value of `xbrldi:typedMember` lives in a child element declared by the typed domain, not in its text; the parser now reads that child and records its name in `typedElement` so the writer can emit it back.

## 0.1.0

Initial release, published as `@financica/xbrl` (npm rejected the unscoped `xbrl` name).

- `parseXbrl`: XBRL 2.1 instance document parser covering schema, linkbase, role and arcrole refs, contexts (entities, explicit and typed dimensions, periods), units, items, tuples and footnote links.
- Typed model (`XbrlInstance`, `XbrlContext`, `XbrlFact`, ...) exported alongside.
