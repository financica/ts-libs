# Changelog

## 0.2.1

### Fixed

- **An empty `OBS_VALUE` is rejected instead of parsing as a rate of 0.** `Number("")` is `0`, so a blank observation in the ECB CSV passed the `isFinite` guard and came back as a zero exchange rate; the value is now trimmed and a blank one is treated as missing.

## 0.2.0

### Added

- **`EcbClient.getSeries(from, to, currencies?)`** — every observation the ECB published inside a date range, in one request, oldest first. Unlike `getRate` / `getRates` it does **not** substitute the last business day: non-business days are simply absent, so the caller sees the real publication calendar and decides how to fill the gaps. That is what you want when populating a local rate table; per-transaction pricing still wants the substituting single-day lookups. Returns a `RateSeries` (`from`, `to`, `rates`), and rejects an inverted range.

_Released from the standalone `financica/ecb-client` repository, which shipped without a changelog entry; written up retroactively when the package moved into this monorepo._

## 0.1.0

Initial release.

- `EcbClient` with `getRate`, `getRates`, and `convert` against the ECB data
  API (dataflow `EXR`, `text/csv`).
- Historical single-day lookups with last-business-day fallback via
  `lastNObservations`; the effective observation date is reported on every rate.
- Euro-crossed conversion between any two reference currencies.
- Injectable `fetch`, in-process snapshot cache, request timeout.
- Zero runtime dependencies; ESM + CJS builds with type declarations.
