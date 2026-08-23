# Changelog

## Unreleased

### Changed

- **BREAKING: `SupplierVatStatus` is a string union.** `1 | 2 | 3` becomes `"subject" | "not_subject" | "small_business"`; the numbers were Scrada's wire encoding leaking into a generic model. Callers that hold the Scrada code map it at their own boundary.
- **EAS schemes come from `@financica/peppol` instead of a private copy.** `resolveVatEndpoint` and `resolveCompanyIdScheme` resolve through `getPeppolIdentifierSchemes`, so the three hand-copied tables are one. Routing changes for two countries whose verified profile disagreed with the old copy: Swedish VAT numbers now resolve to `9955` and Italian to `0211` (previously null). Requires `@financica/peppol` ≥ 0.8.0.
- **BREAKING: parse errors throw `UblParseError`; `null` means "not a UBL invoice".** `parseUblInvoice` returns `null` only when well-formed XML has a root other than a UBL `Invoice`/`CreditNote`; malformed XML and documents missing a mandatory element (`cbc:ID`, `cbc:IssueDate`, `cbc:DocumentCurrencyCode`, a line `cbc:ID`) throw the new `UblParseError` (exported from the root, `cause` set when wrapping). `parsePeppolMessageLevelResponse`, `extractUblEmbeddedAttachments` and `normalizeUblResponse` throw the same class instead of a generic `Error`; `isPeppolMessageLevelResponse` stays a non-throwing sniff.
- **BREAKING: the parsed model has no sentinel values.** A field the document omits is an absent key instead of `""`/`0`/`"Unknown"`: `UblAddress` (`street`, `city`, `postalZone`, `countryCode`), `UblParty.name`, `UblLine` (`description`, `quantity`, `unitCode`, `unitPrice`, `lineExtensionAmount`), `UblTaxSubtotal` (`taxableAmount`, `taxAmount`, `taxPercent`), every `UblMonetaryTotal` amount, `UblAllowanceCharge.amount`, `UblPaymentMeans.code`, `UblAttachment.id`, `UblDocumentReference.id`, `UblItemProperty.value` and `UblEmbeddedAttachment.id` are now optional, and `PeppolMessageLevelResponse` fields are `?: string` instead of `string | null`. `seller`, `buyer`, `monetaryTotal`, `lines` and `taxSubtotals` are always present. `normalizeUblResponse` reports `null` where it previously reported a manufactured `0` (totals of a document without `LegalMonetaryTotal`, line quantity/price/amount the line does not state), and attachment `sizeBytes` is the exact padding-aware decoded size.
- **Build-side inputs are typed instead of `unknown`.** `extractCustomerTaxIdentifiers` takes `readonly CustomerTaxIdInput[] | null | undefined` (`{type, value}` pairs, the shape of Stripe's `customer_tax_ids`), and `normalizeAddress` / `UblSupplier.address` take the new `AddressInput` (Stripe `line1`/`postal_code`/`country` and legacy `street`/`zip_code`/`country_code` keys). Both new types are exported from `@financica/ubl/build`. Runtime behaviour is unchanged; callers that passed arbitrary values must now pass the documented shape (or `null`). `listPeppolReceiverIdentifierCandidates` accepts `Partial<CustomerTaxIdentifiers>`, which is the same shape it took before.

### Added

- **`coerceLinesForSupplierVatStatus(lines, vatStatus, supplierCountryCode?)`** — the "seller does not charge VAT → every line is `E`/0% with a BT-120 reason" rule now lives here instead of inside the Stripe adapter, so every adapter gets it. The Belgian Article 56bis text is picked by supplier country; other countries get a generic reason.

## 0.15.1

### Fixed

- **`extractCustomerTaxIdentifiers` no longer drops non-VAT registration numbers.** An entry was classified by substring of its type (`vat`, `tax`, `peppol`, `gln`), so `ca_gst_hst`, `au_abn`, `us_ein`, `ch_uid` and most of the Stripe taxonomy vanished and a seller with only such an id failed the identifier check. Any other typed entry is now the registration number (BT-30).

## 0.13.0

### Added

- **Service periods, end to end.** `UblLine.invoicePeriod` carries a line's own `cac:InvoicePeriod` (BT-134/BT-135), which the parser previously discarded; `normalizeUblResponse` promotes both the document period (BT-73/BT-74) and each line's to first-class `period_start` / `period_end` DTO fields, so consumers no longer have to dig the document one out of `extra.invoice_period` and had no way at all to reach the line ones. The serializer emits `cac:InvoicePeriod` from `UblDocument.invoicePeriod` and `UblLine.invoicePeriod`, at the positions UBL's element sequence requires (after `cbc:BuyerReference` on the document, after `cbc:LineExtensionAmount` on a line). A period with neither bound set is omitted rather than emitted empty, which would fail BR-CO-19.

### Fixed

- **A line's period is no longer reported as the document's.** The document-level lookup was a descendant search, so on an invoice that states a period only per line — the normal shape for a subscription bill with prorations — the first line's period surfaced as the whole document's. Both lookups now read direct children only.

## 0.12.0

### Added

- **`rounding_total` on the normalized DTO**: `normalizeUblResponse` now surfaces `cbc:PayableRoundingAmount` (BT-114). The parser has always read it into `UblMonetaryTotal`; it simply never reached the DTO, so consumers could not tell a cash-rounded payable from an unexplained gap.

### Fixed

- **A rounded payable is no longer mistaken for a prepayment.** With no declared `cbc:PrepaidAmount`, `amount_paid` was inferred from any `TaxInclusiveAmount > PayableAmount` gap — but under BR-CO-16 a rounding amount is exactly such a gap by design. An invoice rounded _down_ (27.17 → 27.15, the Belgian nearest-0.05 cash rule) imported as 0.02 already paid, reporting an untouched invoice as partially settled; one rounded _up_ left the total and the amount due disagreeing with nothing to explain it. The rounding term is now removed before the inference, and the result is rounded to cents before the sign test so the float residue of undoing it cannot pass as a sub-cent prepayment. A declared `PrepaidAmount` is still authoritative and is untouched.

## 0.11.0

### Added

- **`deriveUnitPrice` and `UblLine.baseQuantity` (BT-149)**: the serializer now emits `cbc:BaseQuantity` inside `cac:Price`, carrying the quantity's unit code as PEPPOL-EN16931-R130 requires.

### Fixed

- **Line prices no longer violate PEPPOL-EN16931-R120.** A line's net price was derived as `net ÷ quantity` rounded to cents, which breaks the rule whenever the division doesn't land on a cent: 940.00 over 14 units gives 67.142857…, and 14 × 67.14 = 939.96 — 0.04 out against a 0.02 tolerance, rejected as a _fatal_ validation error, so the document is never transmitted. `deriveUnitPrice` keeps the cent-rounded unit price only when it reproduces the net exactly, and otherwise prices the line as a whole via BT-149 (`priceAmount` = the net, `baseQuantity` = the quantity). That is exact at any magnitude, rather than merely within tolerance — the residual of a rounded unit price grows with quantity and would eventually breach 0.02 at any fixed precision.
- **`reconcileLinesToExclTotal` re-derives the price after adjusting a line's net.** It previously re-divided at cent precision, reintroducing the same R120 violation on the very line it had just corrected. It now routes through `deriveUnitPrice` and clears a stale `baseQuantity` when the adjusted net divides evenly.

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
