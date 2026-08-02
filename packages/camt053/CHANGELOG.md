# Changelog

## 0.1.0

### Added

- Initial release.
- `parseCamt053(xml)` — parse CAMT.053.001.x Bank-to-Customer Statement XML into typed objects.
- Full support for: group header, statements, accounts (IBAN + other ID), account owner with postal address and organisation ID, financial institution servicer (BIC, name, address), balances, transaction summary, entries with all fields (status, booking/value dates, bank transaction codes, charges, reversal indicator, additional info), amount details with currency exchange, entry details with batch info, transaction details with references, related parties/agents, purpose, remittance information (structured + unstructured), return information.
- Handles both `Dt` and `DtTm` date formats, `Pty`-wrapped and unwrapped party elements, domain and proprietary bank transaction codes.
- Tested against real Wise (TransferWise) CAMT.053.001.10 bank statements.
