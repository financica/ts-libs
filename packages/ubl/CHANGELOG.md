# Changelog

## 0.2.0

### Added

- **CreditNote type code support**: `invoiceTypeCode` now correctly reads `cbc:CreditNoteTypeCode` for CreditNote documents (previously only read `cbc:InvoiceTypeCode`, which is absent on credit notes).
- **Billing reference parsing**: New `UblBillingReference` type and `billingReference` field on `UblInvoice`. Extracts the original invoice ID and issue date from `cac:BillingReference/cac:InvoiceDocumentReference` -- essential for credit notes that reference the invoice being corrected.
- **DTO billing reference**: `normalizeUblResponse()` now includes `billing_reference` in the `extra` object with `invoice_id` and `invoice_issue_date`.

## 0.1.1

### Changed

- Added `prepack` script to ensure build runs before publish.

## 0.1.0

### Added

- Initial release.
- `parseUblInvoice(xml)` -- parse UBL 2.1 Invoice and CreditNote XML into typed objects.
- `normalizeUblResponse(xml, documentId)` -- normalize parsed UBL into a flat `InvoiceExtractionDTO`.
- `parseUblInvoiceDocument({ bytes, documentId, mimeType })` -- parse from raw bytes with BOM handling.
- Full type exports for all UBL structures.
