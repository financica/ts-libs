# Changelog

## 0.1.0

Initial release.

- 178 active currencies from SIX Group `list-one.xml` (published 2026-01-01).
- 152 historic currencies from `list-three.xml`.
- Alphabetic code, numeric code, minor units, name, isFund, kind.
- Country associations as ISO 3166-1 alpha-2 codes (including `EU`).
- `getByCode`, `getByNumericCode`, `getByCountry`, `formatAmount`.
- Type guards for alphabetic / numeric / country codes.
- Opt-in `/historic` subpath for withdrawn currencies.
- Zero runtime dependencies. ESM + CJS builds. Full TypeScript types.
