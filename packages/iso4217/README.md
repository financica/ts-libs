# @financica/iso4217

Strictly typed, zero-dependency ISO 4217 currency dataset with O(1) lookups
and a small, spec-aligned API surface.

- **Fresh**: built from SIX Group's official `list-one.xml` (currently
  published `2026-01-01`).
- **Spec-aligned**: alphabetic code, numeric code, minor units, name,
  fund-flag, kind. Country associations are ISO 3166-1 alpha-2 codes, never
  opaque name strings.
- **Strictly typed**: every code is a literal union, so the compiler can
  tell `"USD"` from `"usd"` and `"US"` from `"USA"`.
- **Tiny**: zero runtime dependencies, tree-shakeable, ships ESM + CJS.
- **Immutable**: all exported data is `Object.freeze`d; all arrays are
  `readonly`.
- **Complete**: ships an opt-in `/historic` subpath for every withdrawn
  currency back to the 1970s.

## Install

```sh
npm install @financica/iso4217
```

Requires Node 18+.

## Usage

```ts
import {
  getByCode,
  getByNumericCode,
  getByCountry,
  formatAmount,
  CURRENCIES,
  PUBLISHED_AT,
} from "@financica/iso4217";

getByCode("USD");
// → {
//     alphabeticCode: "USD",
//     numericCode: "840",
//     minorUnits: 2,
//     name: "US Dollar",
//     countryCodes: ["AS", "BQ", "EC", "GU", "HT", "IO", "MH", "MP", "PA",
//                    "PR", "PW", "SV", "TC", "TL", "UM", "US", "VG", "VI"],
//     isFund: false,
//     kind: "fiat",
//   }

getByCode("usd")?.alphabeticCode;      // "USD"  — case-insensitive
getByNumericCode("840")?.alphabeticCode; // "USD"
getByNumericCode(840)?.alphabeticCode;   // "USD"
getByNumericCode(8)?.alphabeticCode;     // "ALL" — unpadded input is normalised

getByCountry("CH").map((c) => c.alphabeticCode);
// ["CHE", "CHF", "CHW"]

formatAmount(1234.5, "USD", { locale: "en-US" }); // "$1,234.50"
formatAmount(1234.5, "JPY", { locale: "en-US" }); // "¥1,235"     (0 minor units)
formatAmount(1.5,    "BHD", { locale: "en-US" }); // "BHD 1.500"  (3 minor units)

CURRENCIES.length;     // 178 (as of 2026-01-01)
PUBLISHED_AT;          // "2026-01-01"
```

### Type guards

```ts
import { isAlphabeticCode, isNumericCode, isCountryCode } from "@financica/iso4217";

function logCurrency(code: string) {
  if (!isAlphabeticCode(code)) return;
  // `code` is now narrowed to AlphabeticCode.
  console.log(getByCode(code)?.name);
}
```

### Historic currencies

Withdrawn currencies (Italian Lira, Zaire Zaïre, Netherlands Antillean
Guilder, etc.) live behind a subpath import so they don't bloat the main
bundle.

```ts
import { getHistoricByCode, HISTORIC_CURRENCIES } from "@financica/iso4217/historic";

getHistoricByCode("ANG").map((c) => c.withdrawalDate);
// ["2010-10", "2025-03"]  — ANG was withdrawn twice.
```

## API

### Lookups

| Function | Returns |
| --- | --- |
| `getByCode(code: string)` | `Currency \| undefined` |
| `getByNumericCode(code: string \| number)` | `Currency \| undefined` |
| `getByCountry(countryCode: string)` | `readonly Currency[]` (possibly empty) |

### Type guards

| Function | Signature |
| --- | --- |
| `isAlphabeticCode(s)` | `s is AlphabeticCode` |
| `isNumericCode(s)` | `s is NumericCode` |
| `isCountryCode(s)` | `s is CountryCode` |

### Formatting

| Function | Signature |
| --- | --- |
| `formatAmount(amount, code, options?)` | `string` (wraps `Intl.NumberFormat`) |

### Data

| Export | Shape |
| --- | --- |
| `CURRENCIES` | `readonly Currency[]` — sorted by alphabetic code |
| `ALPHABETIC_CODES` | `readonly AlphabeticCode[]` |
| `NUMERIC_CODES` | `readonly NumericCode[]` |
| `COUNTRY_CODES` | `readonly CountryCode[]` (ISO 3166-1 alpha-2 union) |
| `PUBLISHED_AT` | `"YYYY-MM-DD"` date of the embedded SIX Group revision |

### Types

```ts
interface Currency {
  readonly alphabeticCode: AlphabeticCode;   // e.g. "USD"
  readonly numericCode:    NumericCode;      // e.g. "840"
  readonly minorUnits:     number | null;    // null for metals and N.A. codes
  readonly name:           string;
  readonly countryCodes:   readonly CountryCode[];
  readonly isFund:         boolean;
  readonly kind:           "fiat" | "fund" | "metal" | "special";
}

type CurrencyKind = "fiat" | "fund" | "metal" | "special";
```

`kind` classifies each entry for easy filtering:

- **`fiat`** — sovereign or supranational general-tender currency
  (USD, EUR, GBP, XAF, XOF, XCD, XCG, XPF, …).
- **`fund`** — accounting/investment unit (CHE, CHW, BOV, CLF, COU, MXV,
  USN, UYI, UYW).
- **`metal`** — precious metal commodity code (XAU, XAG, XPT, XPD).
- **`special`** — reserved codes: bond units (XBA–XBD), IMF SDR (XDR),
  ADB unit (XUA), Sucre (XSU), Arab Accounting Dinar (XAD), testing (XTS),
  no-currency sentinel (XXX).

## Data provenance

Data is generated from the two official SIX Group XML lists:

- `list-one.xml` — active currencies
- `list-three.xml` — historic / withdrawn currencies

Both are downloaded into `data/` by `npm run fetch-data`. `npm run generate`
then re-parses the XML, normalises entity rows to ISO 3166-1 alpha-2 country
codes (via the mapping in `scripts/iso-3166.ts`), and emits the three
generated source files in `src/`:

- `src/codes.ts`
- `src/data.ts`
- `src/historic-data.ts`

The generator throws if it encounters an entity name it does not know how to
map, so a change in the upstream spec can never silently corrupt the data.

## Releasing a new revision

1. `npm run fetch-data`
2. `npm run generate`
3. Review `git diff src/`
4. `npm test`
5. Bump the `version` in `package.json`, commit, tag, `npm publish`.

## License

MIT
