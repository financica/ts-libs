# Changelog

## Unreleased

### Changed

- **BREAKING: parse errors throw `CodaParseError`; `null` means "not a CODA file".** `parseCoda` returns `null` only when the content does not start with a CODA header record (record code `0` with a DDMMYY creation date). A statement without its old-balance record, an unparseable mandatory date or amount, or an invalid transaction code now throws instead of returning `null`.
- **BREAKING: absent fields are absent.** `addressee` and `separateApplication` are optional (were `""` when blank); `totalDebit` / `totalCredit` are optional (were `0` when the trailer record is missing); `counterpartyName` is absent rather than `""`. Dates are no longer filled with `new Date(0)`.

## 0.1.0

Initial release.

- `parseCoda(content)` parses CODA v2.x (Febelfin coded statement of account) files into a typed `CodaFile`; returns `null` on malformed input instead of throwing.
- Statements with account (number, currency), holder, old and new balances, movements and free communications; balances and amounts are signed numbers (credit positive, debit negative).
- Movements merge records 2.1 + 2.2 + 2.3; information records (3.x) attach to the preceding movement as `information[]`; communications are concatenated across record parts and right-trimmed.
- Structured communications are reported by `communicationType` / `structuredCommunicationType` with the raw `communication` content (type 101/102 references come through as 12-digit strings).
- Zero runtime dependencies; ESM build with type declarations.
