# Changelog

## Unreleased

### Changed

- `StripeTaxInvoiceParseError.cause` is declared `readonly` on the class, matching the error contract shared across this repository. No behaviour change.

## 0.1.0

Initial release.

- `parseStripeTaxInvoice(pdf)` reads a Stripe tax invoice — the monthly invoice
  for Stripe's own fees — into its identity, both parties, and a fee table per
  transfer currency.
- Invoices that span currencies: each section's totals restated in the reporting
  currency (`convertedTotals`), the invoice's own `Total fees in EUR`, and the
  `Exchange Rates` table those conversions were made at.
- `line.volume` reads the count and gross volume out of a description line,
  which is what ties a month's fees back to the payments behind them. Refunds
  and adjustments carry negative amounts.
- Wording that varies between invoices is kept verbatim rather than reduced to a
  flag: `settlementNote`, `reverseChargeNote`, `footnotes`.
- `parseStripeTaxInvoiceRows(items, rows)` takes positioned text directly, for
  callers with their own PDF pipeline. `groupIntoRows` is exported to build the
  per-page grouping it expects.
- `isStripeTaxInvoice(pdf)` is a cheap format gate that never throws.
- Failures are a `StripeTaxInvoiceParseError` carrying a `code`
  (`not_a_stripe_tax_invoice` or `missing_field`).

Verified against 78 real invoices from five Stripe accounts, Aug 2021 to
Jul 2026, EUR and USD.
