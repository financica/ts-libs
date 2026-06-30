# Changelog

## 0.1.0

Initial release.

- `EcbClient` with `getRate`, `getRates`, and `convert` against the ECB data
  API (dataflow `EXR`, `text/csv`).
- Historical single-day lookups with last-business-day fallback via
  `lastNObservations`; the effective observation date is reported on every rate.
- Euro-crossed conversion between any two reference currencies.
- Injectable `fetch`, in-process snapshot cache, request timeout.
- Zero runtime dependencies; ESM + CJS builds with type declarations.
