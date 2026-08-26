# Changelog

## 0.4.0

### Added

- `serializeCamt053(report)` writes a `Camt053Report` as a camt.053.001.04 document, elements in schema order. `parseCamt053(serializeCamt053(report))` reproduces `report`. A date at UTC midnight is written as `Dt`, any other instant as a UTC `DtTm`. `CAMT053_SERIALIZED_NS` names the namespace written.

## 0.3.0

### Changed

- **BREAKING: parse errors throw `Camt053ParseError`; `null` means "not a CAMT.053 document".** `parseCamt053` returns `null` only when the root is not a `Document` in a `camt.053.001.*` namespace. Malformed XML and missing mandatory elements (`GrpHdr/MsgId`, `GrpHdr/CreDtTm`, `Stmt/Id`, `Stmt/CreDtTm`, `Stmt/Acct`, `Ntry/Amt`, `Ntry/CdtDbtInd`, `Bal/Amt`, `Bal/CdtDbtInd`, `Bal/Dt`) now throw instead of returning `null` or a filled-in placeholder.
- **BREAKING: absent fields are absent.** `Camt053Balance.type` is now optional (was `""` for proprietary balances); `reversalIndicator` is `undefined` rather than `false` when `RvslInd` is absent; `creditDebitIndicator` values are validated against `"CRDT" | "DBIT"` (an unknown value is `undefined` on batches and summaries, and an error on entries and balances). Dates are no longer filled with `new Date(0)`.

## 0.2.0

### Added

- **`CAMT053_NS_PREFIX` is exported.** Consumers sniffing a file for the format were hardcoding their own copy of the CAMT.053 namespace URI prefix; it now comes from the parser that actually matches on it.

## 0.1.0

### Added

- Initial release.
- `parseCamt053(xml)` — parse CAMT.053.001.x Bank-to-Customer Statement XML into typed objects.
- Full support for: group header, statements, accounts (IBAN + other ID), account owner with postal address and organisation ID, financial institution servicer (BIC, name, address), balances, transaction summary, entries with all fields (status, booking/value dates, bank transaction codes, charges, reversal indicator, additional info), amount details with currency exchange, entry details with batch info, transaction details with references, related parties/agents, purpose, remittance information (structured + unstructured), return information.
- Handles both `Dt` and `DtTm` date formats, `Pty`-wrapped and unwrapped party elements, domain and proprietary bank transaction codes.
- Tested against real Wise (TransferWise) CAMT.053.001.10 bank statements.
