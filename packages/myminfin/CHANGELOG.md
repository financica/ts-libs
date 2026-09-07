# Changelog

## 0.10.0

### Changed

- **`searchDocuments` parses what FineAPI actually returns.** The response is a `DocumentCollection` (`items`, `total`, `lastSyncDate`) whose documents carry a localized `docType.name`, `relatedTo` owners as `{ type, identifier }`, a `metadata` list and `modifiedOn` — not the flat `type`/`title`/`publishDate` shape the client assumed, which no environment has ever produced. `DocumentMetadata` and `DocumentRelation` are replaced by `MyMinFinDocument`, `DocumentOwner`, `DocumentMetadataEntry` and `LocalizedString`; the known metadata labels are lifted into `mimeType`, `publishedOn` and `externalReference`. `DocumentSearchResult` gains `total` and `lastSyncDate`. A bare array is still accepted.
- **Every document request carries `Minfin-Ws-Correlation`.** The API declares the header required; a fresh UUID is generated per request.

### Added

- `MyMinFinApiError.retryAfterSeconds`, from the `Retry-After` header of a 429, so a caller can schedule around SPF's per-company rate limits instead of retrying blindly.
- `parseDocumentCollection` and `parseMyMinFinDocument` are exported, for callers that keep the raw JSON.

## 0.9.1

### Fixed

- **`W_TVA_GRID_59_INCORRECT_VALUE` used the wrong threshold.** Its proportional branch tested for an excess deduction of 300000 rather than 3.000,00, which SPF's 2026-07-14 revision identifies as a long-standing typo in the published rule: Intervat has always validated at 3.000,00. As written, the branch was unreachable (it sat above the rule's own absolute threshold), so a return between the two figures was submitted unjustified and rejected. Rules 2 and 4 are also restated in the revision's wording; their behaviour is unchanged.

## 0.9.0

### Added

- **Justifications for the plausibility rules Intervat rejects on.** `evaluateProbabilityWarnings(grid)` reports which of the nine `W_TVA_GRID_*` rules a grid trips, each with the grids it concerns and Intervat's own explanation in fr/nl/de/en; `findUnjustifiedWarnings` narrows that to the ones still lacking a comment. `serializeVatReturn` and `buildBelgianVatReturn` take `justifications`, emitting `<ns2:Justification Code="…">` — without which Intervat refuses a return that trips a rule — and `buildBelgianVatReturn` returns `unjustifiedWarnings` so a caller can collect explanations before submitting.

### Changed

- **`MyMinFinError` is the base class of every error the package throws.** `MyMinFinApiError` now extends it; `instanceof MyMinFinApiError` checks keep working. Raw `fetch` rejections (network failures, aborts) no longer escape: they are wrapped in `MyMinFinError` with `cause` set.
- **`MyMinFinAuth` checks the token response status before parsing the body.** A non-JSON 5xx from the token endpoint now throws `MyMinFinApiError` (message "Token request failed") instead of a `SyntaxError`.
- `MyMinFinApiError.details` aliases `problem`, matching the other HTTP clients in this repository.

### Added

- `fetch?:` on `AuthConfig` and `ClientConfig` (used by `MyMinFinAuth`, `MyMinFinClient`, `IntervatClient`), defaulting to `globalThis.fetch`.
- Optional `{ signal?: AbortSignal }` on every request method.
- `MyMinFinError` is exported.

## 0.8.0

### Added

- **`isDecemberAdvancePeriod(period)`** reports whether a VAT return period may carry the December advance (grid 91): only a December monthly or Q4 quarterly period can, and that is a rule of the return rather than of the caller's UI.

### Fixed

- **Client assertions carry an `iat` claim.** The RFC 7523 JWT set `exp` and `jti` but no issue time, so the authorization server had nothing to age the assertion against.

## 0.7.0

### Changed

- **PKCE and JWT helpers use Web Crypto instead of `node:crypto`**, so the client no longer requires a Node runtime and bundles for edge/browser targets.
- **BREAKING: `getAuthorizationUrl` is now async** (`crypto.subtle.digest` is promise-only). Await its result.

## 0.6.0

### Added

- **December advance (grid 91).** `BelgianVatReturnFigures.prepayment` lands in box 91 under the actual-figures method, and is emitted even at 0.00 since a zero grid 91 is itself a declaration.

## 0.5.0

### Added

- **Credit-note corrections and regularisation boxes.** Credit-note bases map to 48/49 (issued) and 84/85 (received), their VAT to 63/64, and miscellaneous regularisations to 61/62; all six enter the 71/72 balance.

## 0.4.0

### Added

- **Intra-community, reverse-charge, import and export figures on the Belgian grid.** New optional `BelgianVatReturnFigures` fields fill boxes 00/44/45/46/47 (sales) and 86/87/88 + 55/56/57 (reverse-charge purchases); the balance now includes self-assessed VAT.

## 0.3.0

### Added

- **`MIN_TURNOVER_THRESHOLD`** (€250) — the annual client-listing turnover rule, exported so callers filter their rows before calling `generateClientListingXml`.

## 0.2.0

### Added

- **Intervat XML generators**, pure and network-free: `serializeVatReturn`, `computeBelgianVatGrid` (bases 01/02/03, output VAT 54, purchases 82, deductible 59, balance 71/72, with warnings on unmapped scenarios), `buildBelgianVatReturn`, and `generateClientListingXml` for the annual client listing.

### Changed

- Shared HTTP helpers (`authorizedFetch`, `assertOk`) replace duplicated Bearer-header and error-parsing code across the clients.

## 0.1.0

Initial release.

- `MyMinFinAuth`: OIDC authorization-code flow with PKCE, token exchange and refresh.
- `MyMinFinClient`: document search, metadata and download.
- `IntervatClient`: VAT submission with business-rule error decoding.
- Environment-aware endpoint helpers and `MyMinFinApiError`.
