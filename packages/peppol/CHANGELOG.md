# Changelog

## 0.8.0

### Added

- **`getPeppolIdentifierSchemes` now covers every country with a `CC:VAT` EAS scheme.** After the hand-verified profiles and the EU addressing table, it falls back to the full EAS code list, so Switzerland, Serbia, Andorra and the other non-EU VAT schemes resolve instead of returning null. France's SIRENE (`0002`) is known as its registry scheme.
- **`getVatParticipantScheme(country)`** (raw `CC:VAT` code-list lookup) and **`countryFromVatNumber(vatNumber)`** (prefix → country, handling `EL` → GR and `XI` → GB) are exported from `@financica/peppol/identifiers`.

## 0.7.0

### Added

- **`normalizeParticipantValue`, `getPeppolParticipantScheme` and `PEPPOL_PARTICIPANT_SCHEMES`** (also at `@financica/peppol/identifiers`, free of Node built-ins so it can be bundled for the browser). The table records, per EAS scheme, whether the registered value structure carries separators; it is what the fix below is driven by.
- **`isDnsNotFound` is exported** so the "not registered vs transient DNS failure" distinction can be tested directly.

### Fixed

- **`buildParticipantId` no longer strips separators that are part of the registered identifier.** It used to drop every non-alphanumeric character, which is right for a Belgian enterprise number (`0208:0762.747.721` is registered as `0762747721`) and wrong for a German Leitweg-ID: `0204:991-07335-68` became `0204:9910733568`, which hashes to a different SML name, answered NXDOMAIN, and reported a validly registered customer as unreachable (same for 0246 DE:GEBA and 0225 FR:CTC). Whitespace and characters outside the identifier policy's repertoire are always dropped; `. - _ ~` only for schemes catalogued as separator-free. Uncatalogued schemes are preserved verbatim, so an unknown scheme fails safe.

## 0.6.0

### Added

- **Luxembourg profile: company scheme `0240` (CTIE matricule) / VAT scheme `9938`.** EAS 0240 is the 11-digit matricule from the Répertoire des personnes morales, whose ISO 6523 entry names e-invoicing as its purpose — not the RCS B number, which has no scheme.

### Changed

- **`CountryEInvoicingProfile.companyIdentifierScheme` is a `string` again** (reverts the 0.5.0 nullable widening): every profiled country has one. A `null` from `getPeppolIdentifierSchemes` (unprofiled country) still means "register nothing".

## 0.5.0

### Added

- **Luxembourg profile**, addressed by VAT (`9938`) alone.

### Changed

- **`companyIdentifierScheme` widened to `string | null`** for countries with no company register scheme; a profile keeps at least one addressable scheme. (Reverted in 0.6.0.)

## 0.4.0

### Added

- **`getPeppolIdentifierSchemes(country)` resolves a sender's participant schemes in one call.** The verified country profile is authoritative (company vs separate VAT scheme, and the countries that route on the company scheme alone); unprofiled countries fall back to the VAT-based addressing table; `null` for countries outside Peppol. Before this, integrations for countries without a full profile fell back to a provider default and emitted a foreign VAT under Belgium's `9925` scheme.

## 0.3.0

### Added

- **Country e-invoicing profiles** (`CountryEInvoicingProfile`: network, EAS schemes, VAT registry source, archival years, org-number length), moved here from the financica app and pinned by test to the `PEPPOL_COUNTRY_SCHEMES` addressing table so the two views cannot drift.
- **Self-Billing 3.0 and Invoice Response document-type and process identifiers**, plus the BIS Billing process id, for registration payloads.

### Changed

- Toolchain moved to bun and oxc (oxlint, oxfmt, tsdown); no change to the published API.

## 0.2.0

### Fixed

- **Participant discovery works again on the OpenPeppol SML.** Lookup used the retired EC zone with the legacy `B-<md5>` CNAME algorithm, so every registered participant came back `not_registered`. `lookupPeppolParticipant` now builds `base32(sha256(lowercase("<icd>:<id>")))` on the OpenPeppol zones, queries the `Meta:SMP` U-NAPTR record and follows its URI to the SMP.
- **Transient DNS failures are reported as `status: "error"`, not `not_registered`.** Only ENOTFOUND/ENODATA count as absent.

### Added

- **`environment: "production" | "test"` option** to look up on the SMK test zone.

### Changed

- **`buildSmpHostname` replaced by `buildSmlHostname`** (value-based, takes the zone); new `parseSmpUrlFromNaptrRegexp`.

## 0.1.0

Initial release: `lookupPeppolParticipant` (SML/SMP discovery), `lookupPeppolDirectory`, `PEPPOL_COUNTRY_SCHEMES` / `getPeppolCountryScheme`, `buildParticipantId` / `buildCanonicalParticipantId`, `parseServiceGroupDocumentTypes`, and the BIS Billing invoice and credit-note document-type constants with `classifyPeppolDocumentType`.
