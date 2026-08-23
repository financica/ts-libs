# Changelog

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
