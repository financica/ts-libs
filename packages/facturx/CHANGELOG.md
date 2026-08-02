# Changelog

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
