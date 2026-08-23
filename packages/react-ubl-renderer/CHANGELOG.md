# Changelog

## Unreleased

### Changed

- **BREAKING: reads the unified `@financica/ubl` model (Unreleased, > 0.16).** The renderer reads `party.endpoint.{value,scheme}`, `party.companyId.{value,scheme}`, `line.taxCategory.percent`, `invoice.taxTotal.subtotals` and each subtotal's `category.{id,percent,exemptionReason}` instead of the flat `endpointId`/`companyId`/`taxPercent`/`taxSubtotals` fields. The legacy shape and the `""`/`0` sentinels of older stores are no longer tolerated: an absent field is an absent key, and `id`/`currency` are used as stated. Visible changes for the same document: the "Tax ID" party field shows `scheme:value` when the company id carries a scheme (previously the bare value); the "VAT" totals row (shown only when the document has no VAT breakdown) uses the stated `taxTotal.taxAmount` (BT-110) and falls back to summing the subtotals only when it is absent; a line with `baseQuantity > 1` shows "per N" after its unit price.

## 0.3.0

### Changed

- **BREAKING: follows the `@financica/ubl` parse contract.** `<UblInvoice xml>` renders `fallback` when the XML is malformed, not a UBL invoice, or lacks a mandatory element (`parseUblInvoice` returning `null` or throwing `UblParseError`); `renderUblInvoiceHtml` throws `UblParseError` for the same inputs instead of a generic `Error`. Optional fields of the parsed model (`seller.name`, line `description`/`quantity`/`unitPrice`, monetary-total amounts, …) may now be absent; the renderer treats an absent field exactly as it treated `""`/`0` (both still tolerated, so stored parses from older versions render unchanged), so output is identical for documents that state them. Requires `@financica/ubl` with `UblParseError`.

## 0.2.0

Breaking: `@financica/ubl` is now a peer dependency, and `invoice` is no
longer a standalone required prop of `<UblInvoice />`.

### Added

- **`<UblInvoice xml={xml} />` accepts raw XML.** `UblInvoiceProps` is the discriminated union `{ xml } | { invoice }`; XML is parsed internally (memoised) and a parse failure renders `fallback` instead of crashing. Every consumer previously had to run a manual, null-unsafe parse step.
- **`renderUblInvoiceHtml` accepts `string | UblInvoiceData`**; it throws on bad XML.
- **`parseUblInvoice` and the `UblInvoiceData` type are re-exported** for a single import surface, which also resolves the `UblInvoice` component-vs-type name collision.

### Changed

- **`@financica/ubl` moved to `peerDependencies`.** As a regular dependency two copies of the `UblInvoice` type were possible, producing structural-typing compile errors; one shared copy is now guaranteed.

## 0.1.0

Initial release: render a parsed UBL / Peppol BIS Billing 3.0 invoice as the `<UblInvoice />` React component or as a standalone HTML document via `renderUblInvoiceHtml()`. Styles are scoped under `.ubl-invoice` and shipped as `styles.css`, `ublInvoiceCss`, and inlined into the HTML document.
