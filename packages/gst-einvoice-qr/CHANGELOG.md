# Changelog

## Unreleased

### Changed

- `GstQrError.cause` is declared `readonly` on the class, matching the error contract shared across this repository. No behaviour change.

## 0.1.0

Initial release.

- `decodeSignedQr` / `verifySignedQr`: parse the IRP-signed QR (compact JWS,
  RS256) and check its signature against caller-supplied certificates. The
  outcome is a union, so "we hold no key for this signer" never collapses into
  "this is forged".
- `loadSignerCertificate` / `selectCertificate`: certificate handling keyed on
  the SHA-1 thumbprint the header carries as `kid` / `x5t`. No certificates are
  bundled.
- `reconcileWithQr`: compare the attestation against your own extraction, with
  `explained` verdicts for same-PAN-different-state GSTINs and `URP` buyers.
- GSTIN utilities: `isValidGstin`, `parseGstin`, `isSameLegalEntity`,
  `isUnregisteredPerson`, `gstinCheckCharacter`.
