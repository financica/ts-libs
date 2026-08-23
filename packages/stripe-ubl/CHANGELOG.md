# Changelog

## 3.0.0

### Changed

- **BREAKING: builds the unified `@financica/ubl` model.** `buildUblInvoiceDocument` / `buildUblCreditNoteDocument` return a `UblInvoice` (the former `UblDocument`, still re-exported as a deprecated alias) with the renamed fields from `@financica/ubl`'s Unreleased entry: `seller`/`buyer` (was `supplier`/`customer`), `vatId`, `registrationName`, per-unit `unitPrice` (was `priceAmount`), line `description` (was `name`), attachment `base64Content`, `billingReference: { invoiceId }` (was `precedingInvoiceId`), `documentType: "Invoice" | "CreditNote"`, and `endpoint`/`companyId` objects. Absent fields are absent keys instead of `null`: `toUblPeriod` and `resolveInvoicePeriod` return `undefined` when there is no period, and `dueDate`, `note`, `buyerReference` and `buyer.endpoint` are omitted rather than `null`. `buildUblInvoiceFromStripeInvoice` / `buildUblCreditNoteFromStripeCreditNote` go through `serializeUblInvoice`, which now throws `UblBuildError` for a document missing a mandatory field. The Stripe-side inputs (`UblSupplier`, `customerEndpoint`, `buyerReference`) still accept `null`.
- On the wire, via the `@financica/ubl` serializer: the line description is written as `cbc:Description` (in addition to `cbc:Name`), and `cbc:CustomizationID`, `cbc:ProfileID` and the type code are written from the model with the BIS defaults. Amounts, parties, periods and the credit note's `cac:BillingReference` are unchanged.

## 2.0.0

### Changed

- **BREAKING: `UblSupplier.vatStatus` takes the new string union** from `@financica/ubl` (`"subject" | "not_subject" | "small_business"`). The exemption coercion moved to `@financica/ubl/build`'s `coerceLinesForSupplierVatStatus`; output is unchanged for Belgian suppliers and now uses a generic reason for other countries.
- **BREAKING: `buildCustomerPartyFromStripeInvoice` returns the `UblParty` directly.** The `{ customer, customerName }` wrapper is gone; `customerName` was always `customer.name`.

### Added

- **A credit note without a memo carries its Stripe `reason` as a BT-21 coded note.** Stripe's `credit_note.reason` (e.g. `order_change`) was dropped whenever there was no memo, leaving the receiver with no reason for the credit. It is now emitted as `#ACD#order change` in `cbc:Note`, the EN 16931 UBL binding for a reason note (UNTDID 4451 `ACD`). A memo, being the sender's own words, still wins when present.

## 1.2.0

### Added

- **The Stripe `footer` now reaches the BT-22 note.** Only `invoice.description` was emitted; the footer, where legal mentions usually live, was lost. Memo and footer are joined with a blank line into the single document-level `cbc:Note`, via the exported `stripeInvoiceNote(invoice)` so importers can store the same text a Peppol receiver sees.

### Changed

- Requires `@financica/ubl` `^0.14.0`, the release this package's period and note emission builds on.

## 1.1.0

### Added

- **The billing period now reaches the wire.** Stripe states a service period per line and per invoice, and every one of them was being dropped: a subscription invoice went out saying only when it was issued, leaving the receiver to infer what it paid for from the issue date — which is exactly the inference that goes wrong across a year end. `cac:InvoicePeriod` is now emitted at document level (BT-73/BT-74) and per line (BT-134/BT-135), via the exported `resolveInvoicePeriod` / `toUblPeriod`.

    Two conversions are applied, both silently wrong if skipped. **Stripe's period end is exclusive** — a January month bills `01-01 → 02-01`, while BT-74 is the inclusive last day of service, so the end moves back a day; passing it through unchanged puts every monthly invoice one day into the following period. And **a degenerate period is not a period**: Stripe stamps `start === end` on one-off invoice items, which is reported as absent rather than as a zero-length range.

    The document period is the span of the line periods, falling back to `invoice.period_start/end` only when no line states one — the invoice-level pair is the billing window, which a proration or mid-cycle add-on legitimately falls outside of.

### Changed

- Requires `@financica/ubl` >= 0.13.0, which is what can emit `cac:InvoicePeriod`.

## 1.0.3

### Changed

- **`@financica/ubl` requirement moved to `^0.13.0`.** A caret range on a 0.x line excludes the next minor, so `^0.12.0` did not admit 0.13.0 — inside this monorepo it resolved to the published 0.12.0 instead of the workspace sibling, and consumers could not pick up first-class invoice service periods (BT-73/BT-74, BT-134/BT-135). Nothing in this package's own behaviour changes.

## 1.0.2

### Changed

- **`@financica/ubl` requirement widened to `^0.12.0`.** The 1.0.1 range was `^0.11.0`, which on a 0.x line excludes 0.12.0 entirely, so consumers were pinned to 0.11.x and could not pick up its fix: with no declared `cbc:PrepaidAmount`, a cash-rounded payable (the Belgian nearest-0.05 rule) was inferred as a partial prepayment, importing an untouched invoice as already partly settled. Nothing in this package's own behaviour changes.

## 1.0.1

### Fixed

- **Lines whose total doesn't divide evenly into cents no longer fail PEPPOL-EN16931-R120.** Stripe reports a line _total_ and a quantity but no exact unit price, so `cac:Price` is always derived — and rounding `net ÷ quantity` to cents breaks the rule whenever the division doesn't land on a cent. A credit note of 940.00 over 14 units emitted a price of 67.14, and 14 × 67.14 = 939.96 — 0.04 out against a 0.02 tolerance, a _fatal_ validation error, so the document was rejected at the access point and never transmitted. Line pricing now goes through `deriveUnitPrice` from `@financica/ubl`, which falls back to BT-149 (`cbc:BaseQuantity`) when the net doesn't divide evenly. Requires `@financica/ubl` ≥ 0.11.0.

## 1.0.0

### Added

- **Settled amounts are reported as BT-113**: `cbc:PayableAmount` is the _outstanding_ amount per BIS Billing 3.0, so a document for an already-paid invoice must not present its full gross total as still owed — a receiver's AP system has nothing else in the document to go on, making it a double-payment risk. What has been settled is now emitted as `cbc:PrepaidAmount` and the payable amount derives from it per BR-CO-16. Invoices take BT-113 from `invoice.amount_paid`; credit notes take it from `credit_note.post_payment_amount`. Requires `@financica/ubl` ≥ 0.10.0.
- **`resolveInvoiceSettledCents`, `resolveCreditNoteSettledCents`, `resolvePrepaidAmount`** are exported so callers can inspect or reuse the settlement mapping.

### Changed

- **BREAKING — `stripe` peer range raised to `>=22.0.0`** (was `>=18.0.0`). `credit_note.post_payment_amount` and the `mixed` value on `credit_note.type` both arrived in API version `2025-05-28.basil` (stripe-node 18.2.0). Supporting versions below that meant falling back to the coarse `type`, which cannot express a mixed credit note on exactly the versions where the fallback applied — it would report as plain `pre_payment`/`post_payment`, BT-113 would be emitted for the whole total, and the buyer would never net the pre-payment portion against the open invoice. Requiring the split outright removes that failure mode rather than guarding it.
- **The due-date fallback is now conditional on a positive payable amount.** A `charge_automatically` invoice with no `due_date` still falls back to its issue date to satisfy BR-CO-25, but a settled invoice reports a payable amount of 0, so BR-CO-25 no longer applies and no due date is invented — previously one was fabricated for an invoice that was not due. A due date Stripe did supply is always preserved.

### Notes on the semantics

- **`pre_payment_amount` is excluded from BT-113 by design.** It only reduced the open invoice's `amount_remaining`; nothing was returned to the buyer. The parent invoice still travels at its full amount, and the receiver nets the two documents via BT-25 — invoice 121 against credit note 121 leaves 0 owed. Emitting BT-113 on such a credit note would make it payable 0, the netting would come out as `121 - 0`, and the buyer would still owe the full amount despite the credit. A credit note's BT-113 therefore means strictly "already paid back to you", never "netted off elsewhere".
- **Invoices use `amount_paid`, not `total - amount_due`.** Stripe also reduces `amount_due` by `pre_payment_credit_notes_amount` / `post_payment_credit_notes_amount`, and a credit-note reduction is not a prepayment.
- **A fully-settled document snaps to the derived BT-112**, not Stripe's gross total. BT-112 is rebuilt from the reconciled lines with each VAT category's tax derived as `taxable × rate` (BR-CO-17), so it can sit a cent off what Stripe reports; passing Stripe's figure would leave a settled document reporting 0.01 payable, which is positive and re-triggers BR-CO-25. The side effect is that a genuine overpayment reports 0 rather than a negative payable amount.

## 0.5.1

### Fixed

- **Invoice due date falls back to the issue date** (BR-CO-25): `charge_automatically` invoices carry no `due_date`, and Peppol rejects a positive payable amount with neither BT-9 nor BT-20.

## 0.5.0

### Added

- **`retrieveStripeInvoiceForUbl` and `STRIPE_INVOICE_UBL_EXPAND`**: the canonical `expand` paths for a UBL-ready invoice, so per-line VAT survives under either the legacy `tax_amounts` or the newer `taxes` shape.

### Changed

- **Customer party delegated to `@financica/ubl`'s shared `buildCustomerParty`** so every X→UBL adapter resolves the Peppol `EndpointID` identically.
- **VAT-only customers are routed via their VAT EAS scheme** (e.g. BE → `9925`) instead of resolving to a null endpoint.

## 0.4.0

### Changed

- **Depends on the `@financica/ubl` build core**; this package ships only the Stripe adapter. The UBL document model, serializer, and party/tax/identifier/attachment builders are re-exported so existing import paths keep working.

## 0.2.0

### Changed

- **Renamed to `@financica/stripe-ubl`** and emits Peppol BIS Billing 3.0 UBL rather than a vendor payload.

## 0.1.2

### Fixed

- **Post-discount net is used as the VAT base** for invoice lines, so a discounted standard-rated line keeps its true rate (21%, not 14.70%).

## 0.1.0

### Added

- Initial release: the Stripe → payload builder extracted from peppost.
