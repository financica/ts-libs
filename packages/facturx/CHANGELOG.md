# Changelog

## 0.1.1 (2026-08-18)

### Fixed

- **Re-attaching `factur-x.xml` no longer leaves a dangling `/AF` entry.** `removeEmbeddedFile` deleted the old filespec while walking the name tree, so the later catalog `/AF` pass could not resolve it and kept a reference to a deleted object — invalid under PDF/A-3, so a validator rejected the second attach.

## 0.1.0 (2026-07-10)

Initial release.

- `FacturXInvoice` data model with EN 16931 business-term naming.
- `parseFacturXXml`: tolerant CII reader covering all Factur-X / ZUGFeRD 2.x
  profiles and XRechnung; decodes numeric character references; matches
  elements by local name.
- `computeTotals`: EN 16931 totals calculation (VAT breakdown, rounding,
  prepaid, tax-currency conversion, VATEX defaults).
- `buildFacturXXml`: schema-ordered CII serializer.
- `extractFacturXXml` / `attachFacturXXml`: hybrid-PDF attachment handling
  with PDF/A-3B conversion (XMP, output intent, AF relationship).
- `renderInvoicePdf` / `generateFacturXPdf`: built-in A4 invoice template
  (en/fr/de/nl) with embedded fonts.
