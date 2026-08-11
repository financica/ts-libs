# Changelog

## 0.1.0

Initial release.

- `parseVatAccountStatement(pdf)` reads a Belgian VAT current-account statement
  (_Extrait de compte TVA_ / _Uittreksel btw-rekening_) into a header and the
  dated entries of its detailed table.
- Both layouts: `pform671` (Q4 2022 onwards) and `legacy`, in French and Dutch,
  across multi-page statements. `header.layout` reports which one was read.
- `parseVatAccountStatementRows(items, rows)` takes positioned text directly,
  for callers with their own PDF or OCR pipeline. `groupIntoRows` is exported to
  build the per-page grouping it expects.
- `isVatAccountStatement(pdf)` is a cheap format gate that never throws.
- Failures are a `VatAccountParseError` carrying a `code`
  (`not_a_vat_statement` or `missing_field`).

Extracted from the Financica application, where it has run against real
statements in production since 2026.
