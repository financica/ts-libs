# Changelog

## 0.5.0

### Added

- **Peppol participant lookup helpers: `isPeppolParticipantRegistered`, `peppolLookupSupportsDocument`, `advertisesPeppolInvoice`, `advertisesPeppolCreditNote`, `probePeppolParticipant`.** The lookup endpoint wants `scheme="iso6523-actorid-upis"` with the EAS code inside the id (`9925:BE0206582284`) and never sets the legacy `registered`/`supportInvoice` booleans, so registration and document support must be derived from the advertised document types. Both quirks now live in one module instead of being re-implemented (and drifting) in every consumer. `probePeppolParticipant` tries several candidate identifiers, skips 404s and prefers the first that supports the requested document type.

## 0.4.0

### Changed

- **`sendOutboundDocument` now requires a `routing: PeppolOutboundDocumentRouting` option.** The raw-UBL endpoint does not parse the document for routing; Scrada rejects the request unless sender, receiver, document type and process arrive as `x-scrada-peppol-*` headers. The option maps onto those headers (plus the optional external reference).

## 0.3.0

### Added

- **`sendOutboundDocument`** — POST pre-built UBL XML (BIS3 invoices, self-billing, Invoice Response) to `/peppol/outbound/document`.
- **`sendOutboundSelfBillingInvoice`** — JSON-payload counterpart for self-billing invoices and credit notes; same shape as a sales invoice.
- **`getOutboundDocumentUbl`** — fetch the UBL Scrada rendered from a JSON submission, for archival.
- Both new POST endpoints accept the same `Idempotency-Key` option as `sendOutboundSalesInvoice`.

## 0.2.1

### Changed

- Package metadata only (repository, bugs and homepage fields). No code changes.

## 0.2.0

### Added

- **`sendOutboundSalesInvoice` accepts an `Idempotency-Key`.** A retry after a transient network error with the same key is collapsed by Scrada, so an invoice cannot be delivered twice to the recipient's Peppol endpoint. Pass a deterministic key, typically the upstream invoice id.

## 0.1.0

Initial release, extracted from peppost's `src/lib/peppol/`.

- `ScradaApiClient` wrapping `https://api.scrada.be/v1`: registration, inbound and outbound documents, participant lookup; `createScradaApiClientFromEnv`.
- `ScradaApiError` and `summarizeScradaErrorDetails`, which folds Scrada's variable error shapes (`message`/`error`/`detail`/`defaultFormat`/`modelState`) into one message.
- `PeppolOnlyInvoice` and party/line/total types mirroring the v1 schemas; `CompanyVatStatus`, `CompanyInvoiceLineVatType`, `CompanyInvoiceTaxNumberType` coded scalars.
- `DEFAULT_PEPPOL_*` identifier scheme constants.
- ESM build with type declarations.
