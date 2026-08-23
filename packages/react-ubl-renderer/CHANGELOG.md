# Changelog

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
