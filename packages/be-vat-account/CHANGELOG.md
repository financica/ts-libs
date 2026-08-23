# Changelog

## Unreleased

### Changed

- `VatAccountParseError.cause` is declared `readonly` on the class, matching the error contract shared across this repository. No behaviour change.

## 0.3.0

### Added

- **`@financica/be-vat-account/amount` and `@financica/be-vat-account/operations` subpath exports.** The root entry statically imports `unpdf`, so a consumer that only wanted `parseLocalizedAmount` dragged ~1.6 MB of PDF machinery into its browser bundle (measured in Financica, where the amount parser is reachable from a client component and the bundler did not shake the barrel despite `sideEffects: false`). Both subpaths are pure and import nothing else. The root export is unchanged.

## 0.2.0

### Added

- **`operationKind(code)` classifies a statement operation code** as `declaration`, `settlement`, `late-interest`, `fine` or `other` (type `OperationKind`). Only the leading letter is significant, so `A-12.2025` and `A` classify the same. Previously every consumer re-derived the categories itself.
- **`declarationPeriodEnd(code)` returns the ISO date a declaration code covers** (`A-06.2025` -> `2025-06-30`), `null` for anything else. The statement registers a declaration ~20 days into the _next_ period, so measuring at the registration date drags the next period's VAT into this one.
- **`parseLocalizedAmount` and `EUROPEAN_AMOUNT_RE` are now exported** from the package entry; they were public in source only.

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
