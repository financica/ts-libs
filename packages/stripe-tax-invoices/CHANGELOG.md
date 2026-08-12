# Changelog

## 0.1.0

Initial release.

- `parseStripeTaxInvoice(pdf)` reads a Stripe tax invoice — the monthly invoice
  for Stripe's own fees — into its identity, both parties, and a fee table per
  transfer currency.
- Both fee-table layouts: the fee categories with a payment count and volume
  under each, used until mid-2026, and the itemised product lines used since.
- `line.volume` reads the payment count and gross volume out of a description
  line, which is what ties a month's fees back to the payments behind them.
- `parseStripeTaxInvoiceRows(items, rows)` takes positioned text directly, for
  callers with their own PDF pipeline. `groupIntoRows` is exported to build the
  per-page grouping it expects.
- `isStripeTaxInvoice(pdf)` is a cheap format gate that never throws.
- Failures are a `StripeTaxInvoiceParseError` carrying a `code`
  (`not_a_stripe_tax_invoice` or `missing_field`).
