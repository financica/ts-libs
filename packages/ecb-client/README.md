# @financica/ecb-client

Tiny, zero-dependency TypeScript client for the **European Central Bank's euro
foreign-exchange reference rates**, with historical single-day lookups and
last-business-day fallback.

- **Authoritative source.** Reads the ECB data API directly (dataflow `EXR`),
  with no third-party middleman and no API key. ECB reference rates are the
  rates EU tax authorities accept for currency conversion (VAT Directive
  art. 91).
- **Point-in-time.** Ask for a rate "on or before" any date. The ECB publishes
  only on TARGET business days, so weekends and holidays resolve to the most
  recent prior business day, and the effective date is reported back on every
  rate.
- **Cross rates.** Every ECB rate is quoted against the euro; the client crosses
  two foreign currencies through EUR for you.
- **Interface.** ESM + CJS, strict types, an injectable `fetch`, and an
  in-process snapshot cache.

## Install

```sh
npm install @financica/ecb-client
```

Requires Node 18+ (uses the global `fetch`).

## Usage

```ts
import { EcbClient } from "@financica/ecb-client";

const ecb = new EcbClient();

// A single rate (units of the currency per 1 EUR) on a given day.
await ecb.getRate("USD", "2024-01-15");
// → { currency: "USD", rate: 1.0945, date: "2024-01-15" }

// Weekends/holidays fall back to the last business day; the effective
// date comes back on the result.
await ecb.getRate("USD", "2024-01-13"); // a Saturday
// → { currency: "USD", rate: 1.0942, date: "2024-01-12" }

// Convert an amount. Non-euro pairs cross through EUR.
await ecb.convert({ amount: 100, from: "USD", to: "EUR", date: "2024-01-15" });
// → { amount: 91.36…, rate: 0.9136…, from: "USD", to: "EUR",
//     requestedDate: "2024-01-15", rateDate: "2024-01-15" }

// Several currencies for one date, in a single request.
const snapshot = await ecb.getRates("2024-01-15", ["USD", "GBP", "CHF"]);
// → { requestedDate: "2024-01-15", rates: [ { currency, rate, date }, … ] }

// A whole date range in one request, for populating a local rate table.
const series = await ecb.getSeries("2024-01-11", "2024-01-15", ["USD", "GBP"]);
// → { from: "2024-01-11", to: "2024-01-15", rates: [ … ] }  (oldest first;
//    the 13th and 14th are a weekend and are simply absent)
```

## API

### `new EcbClient(options?)`

| option      | default                                  | description                                              |
| ----------- | ---------------------------------------- | -------------------------------------------------------- |
| `baseUrl`   | `https://data-api.ecb.europa.eu/service` | ECB data API base URL.                                   |
| `fetch`     | global `fetch`                           | Custom fetch (testing, proxying).                        |
| `cache`     | unbounded in-process `Map`               | Snapshot cache keyed by request. Pass `null` to disable. |
| `timeoutMs` | `15000`                                  | Per-request timeout. `0` disables it.                    |

### `getRate(currency, date) → Promise<ReferenceRate>`

The rate for one currency on (or before) `date`. `date` is a `YYYY-MM-DD`
string or a `Date`. `EUR` returns a unit rate without a network call. Throws
`NoRateError` when no observation exists on or before the date.

### `getRates(date, currencies?) → Promise<RateSnapshot>`

Rates for several currencies on (or before) `date`. Omit `currencies` to fetch
every series the ECB publishes — note that **discontinued series resolve to
their own last-published date**, so check each rate's `date` rather than
assuming the requested one.

### `getSeries(from, to, currencies?) → Promise<RateSeries>`

Every observation published between `from` and `to` inclusive, in **one**
request, sorted oldest first and then by currency. Prefer this over looping
`getRates()` per date when building a local rate table.

Unlike `getRate`/`getRates`, this performs **no last-business-day
substitution**: weekends and holidays are absent from the result rather than
carrying the previous rate forward. That reports the ECB's real publication
calendar, leaving the gap-filling policy to the caller. `EUR` is omitted, since
it is the implicit unit of every quote.

### `convert({ amount, from, to, date }) → Promise<ConvertResult>`

Convert `amount` from one currency to another. Identical currencies are a no-op
(no request). The result reports the applied `rate` and the `rateDate` actually
used.

## How rates are quoted

Every value is **units of the quoted currency per 1 EUR** (the ECB convention).
So `getRate("USD", …).rate === 1.0945` means `1 EUR = 1.0945 USD`. To go from
USD to EUR, divide; from EUR to USD, multiply; `convert()` handles both and the
cross-currency case.

## Caveats

- **~30 active currencies, all against EUR.** Cross rates are computed through
  EUR. Discontinued series (e.g. `ARS`) still return, at a stale date.
- **No SLA.** The ECB data API is public and unmetered, with nothing guaranteed
  behind it. The built-in cache deduplicates repeated lookups; cache
  aggressively in your app.

## License

MIT © Financica
