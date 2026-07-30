# Changelog

## 0.10.0

### Added

- **Prepayment and rounding on the build side**: `UblMonetaryTotal` gains optional `prepaidAmount` (BT-113, gross/VAT-inclusive) and `payableRoundingAmount` (BT-114), and the serializer emits `cbc:PrepaidAmount` / `cbc:PayableRoundingAmount` in UBL sequence order (before `cbc:PayableAmount`). Both are omitted when absent or zero.
- **`buildTaxTotals` derives `payableAmount` per BR-CO-16**: an optional second argument (`BuildTaxTotalsOptions`) supplies the prepaid and rounding terms, and BT-115 is computed as `taxInclusiveAmount - prepaidAmount + payableRoundingAmount` rather than hardwired to the gross total. Documents for already-settled invoices — credit notes against paid invoices in particular — no longer present their full gross total as outstanding, which was a double-payment risk. The result is not clamped, so an overpayment surfaces as a negative payable amount instead of being silently hidden. Existing single-argument call sites are unchanged.

## 0.9.0

### Added

- **Tax categories K and G**: `taxCategoryFromReasonOrRate` maps intra-community supply to category `K` and export outside the EU to category `G`, both zero-rated with the required EN 16931 exemption reason. Previously both fell through to the generic `E` (exempt).

### Changed

- **Toolchain migrated to bun + oxc**: oxlint replaces ESLint, oxfmt replaces Prettier, and tsdown replaces tsup for the dual-entry (`.` and `./build`) build. TypeScript upgraded to 7.0; `bun.lock` replaces `package-lock.json`.
- **`@xmldom/xmldom` upgraded to 0.9**: 0.9 drops the ambient DOM lib reference and exports its own DOM types, so the parser and MLR reader now import `Element`/`Document` from the package and read `globalThis.DOMParser` through a typed cast. The isomorphic design is unchanged (native browser `DOMParser` preferred, xmldom as the Node fallback).

### Fixed

- **Null `documentElement` guard in `parseUblInvoice`**: xmldom 0.9 correctly types `Document.documentElement` as nullable; the missing guard is now in place (`parsePeppolMessageLevelResponse` already had one).

## 0.8.0

### Added

- **`extractUblEmbeddedAttachments` and `isPdfLikeAttachment`**: embedded-attachment extraction (base64 content, approximate decoded size, PDF sniffing) moves into the library instead of being reimplemented on top of `parseUblInvoice` by callers. References carrying only an external URI are skipped.

## 0.7.0

### Added

- **`buildCustomerParty`**: the buyer-party builder is promoted out of `@financica/stripe-ubl` into the shared build core so every X→UBL adapter resolves the Peppol `EndpointID` identically — explicit Peppol ID → GLN (`0088`) → VAT EAS scheme (e.g. BE → `9925`). A customer known only by VAT number now gets a routable endpoint instead of `null`.

## 0.6.0

### Added

- **`resolveVatEndpoint` and qualified receiver candidates**: `listPeppolReceiverIdentifierCandidates` previously returned bare values (e.g. a VAT number `BE0206582284`), but a participant lookup needs a fully-qualified `scheme:value` identifier — fed through `parsePeppolEndpoint` a bare value has no `:` to split on and yielded `null`, so a registered recipient could not be resolved. Candidates are now emitted qualified and in priority order: explicit Peppol ID, GLN (`0088`), VAT (country scheme), the Belgian enterprise-number fallback (`0208`), then a generic tax number. Backed by a country → VAT EAS scheme table from the Peppol Code Lists (Participant Identifier Schemes, BIS Billing 3.0, Nov 2025). Countries that address by organisation number rather than VAT (SE/DK/NO) are intentionally absent.

### Changed

- Repository moved to `github.com/financica/ubl-ts`; package metadata and README updated to match.

### Documentation

- The README documents the build/serialize API with a complete, type-checked `UblDocument` example alongside the existing parse-side usage.

## 0.5.0

### Added

- **UBL build core at `@financica/ubl/build`**: a generic Peppol BIS Billing 3.0 document model, serializer (`serializeUblDocument`), and party/tax/identifier/attachment builders. Extracted from `@financica/stripe-ubl` so any X→UBL adapter shares one core. The build-side types live under the subpath so they do not collide with the parse-side types exported from the package root.

## 0.4.0

### Added

- **Peppol Message Level Response parser**: `parsePeppolMessageLevelResponse` and `isPeppolMessageLevelResponse`, plus the `PEPPOL_MLR_*` document-type and process constants. Parses a UBL `ApplicationResponse` (the Peppol transport-level ack), unwrapping an SBDH envelope when present, using the same XXE-safe approach as the invoice parser.

## 0.3.2

### Fixed

- **Unit price now divides PriceAmount by BaseQuantity**: When `cac:Price/cbc:BaseQuantity` is present and greater than 1, the effective unit price (BT-146 / BT-149) was previously reported as the raw `PriceAmount`, overstating per-unit cost on invoices that price by a multi-unit basis (e.g. €75.00 per 1.5 hours now correctly reports `unitPrice: 50`, not `75`).

## 0.3.1

### Fixed

- **`Price/AllowanceCharge` line discounts**: the parser only collected `AllowanceCharge` elements that were direct children of `InvoiceLine`. UBL also allows `Price/AllowanceCharge` for per-unit discounts (e.g. a 100% discount on a subscription); these were silently ignored, leaving `discount_amount` null. They are now merged into the line's `allowanceCharges` and reflected in `discountAmount`.

## 0.3.0

### Added

- **Real-world Peppol invoice features** seen in telco invoices: `AdditionalDocumentReference` without an attachment (text-only references such as terms & conditions), `ExternalReference/URI` for externally hosted attachments, `PaymentMandate/ID` for SEPA Direct Debit mandates, `AdditionalItemProperty` on lines as key-value metadata, multiple `PartyIdentification` elements with scheme IDs, and the `schemeID` attribute on `PartyLegalEntity/CompanyID`.

### Changed

- **Package renamed** from `@ingram-tech/ubl` to `@financica/ubl`. 0.3.0 was published under both names — as `@ingram-tech/ubl` on 2026-03-07 (tagged `v0.3.0`), then republished unchanged apart from the rename as `@financica/ubl` on 2026-04-02. `@financica/ubl` starts at 0.3.0; 0.1.0 through 0.2.0 exist only under the old name.

## 0.2.0

### Added

- **CreditNote type code support**: `invoiceTypeCode` now correctly reads `cbc:CreditNoteTypeCode` for CreditNote documents (previously only read `cbc:InvoiceTypeCode`, which is absent on credit notes).
- **Billing reference parsing**: New `UblBillingReference` type and `billingReference` field on `UblInvoice`. Extracts the original invoice ID and issue date from `cac:BillingReference/cac:InvoiceDocumentReference` -- essential for credit notes that reference the invoice being corrected.
- **DTO billing reference**: `normalizeUblResponse()` now includes `billing_reference` in the `extra` object with `invoice_id` and `invoice_issue_date`.

## 0.1.1

Published as `@ingram-tech/ubl` from an uncommitted version bump, so no commit
carries this version and it has no release tag.

### Changed

- Added `prepack` script to ensure build runs before publish. (Committed later, with 0.2.0.)

## 0.1.0

### Added

- Initial release.
- `parseUblInvoice(xml)` -- parse UBL 2.1 Invoice and CreditNote XML into typed objects.
- `normalizeUblResponse(xml, documentId)` -- normalize parsed UBL into a flat `InvoiceExtractionDTO`.
- `parseUblInvoiceDocument({ bytes, documentId, mimeType })` -- parse from raw bytes with BOM handling.
- Full type exports for all UBL structures.
