# Changelog

## 0.1.0

Initial release.

Read a Stripe invoice, credit note or receipt from its public hosted URL, with
no API key, over the undocumented ephemeral-key protocol the hosted invoice page
uses to render itself.

- `resolveStripeInvoiceUrl` — the whole protocol in one call: URL
  classification, the receipt-page detour, the hosted-page credential fetch, the
  invoice read with full line pagination, and the credit notes.
- `fetchStripeHostedPage` / `fetchStripeHostedInvoice` /
  `fetchStripeCreditNotes` / `fetchStripePdf` — the individual steps.
- `parseStripeInvoiceUrl` / `parseStripeReceiptUrl` / `isStripeInvoiceUrl` —
  dependency-free URL matchers, safe in a client bundle.
- `parseStripeReceiptPage` — reads the refunded amount, date and credited lines
  off a receipt, which after a post-payment refund is the only place they exist.
- `fromStripeMinorUnits` / `toStripeMinorUnits` — Stripe's decimal
  classification, which diverges from ISO 4217 on `UGX`, `ISK` and `HUF`.
- `detectStripeTaxInclusive` — whether an invoice prices VAT-inclusively, or
  `null` when the payload cannot say.

Nothing throws; failures return a typed `{ ok: false, error }`.
