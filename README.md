# @financica/ts-libs

Financica's TypeScript libraries for European e-invoicing, accounting and financial
data standards. One toolchain and release process; each package is published to
npm independently.

## Packages

| Package                                                                | Version | Description                                                                                           |
| ---------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| [`@financica/be-vat-account`](packages/be-vat-account)                 | 0.3.0   | Belgian VAT current-account statement (Extrait de compte TVA) PDF parser                              |
| [`@financica/camt053`](packages/camt053)                               | 0.3.0   | ISO 20022 CAMT.053 (Bank-to-Customer Statement) XML parser                                            |
| [`@financica/coda`](packages/coda)                                     | 0.2.0   | Belgian CODA (coded statement of account) bank file parser                                            |
| [`@financica/ecb-client`](packages/ecb-client)                         | 0.2.1   | European Central Bank euro FX reference rates, with historical lookups and last-business-day fallback |
| [`@financica/edavki`](packages/edavki)                                 | 0.1.0   | Slovenian eDavki (FURS) tax documents — build and serialize the DDV-O VAT return as EDP XML           |
| [`@financica/facturx`](packages/facturx)                               | 0.2.0   | Factur-X / ZUGFeRD (EN 16931 CII) hybrid e-invoices: parse, generate, embed in PDF/A-3                |
| [`@financica/gst-einvoice-qr`](packages/gst-einvoice-qr)               | 0.1.0   | Decode and verify the signed QR code on Indian GST e-invoices (IRP / IRN)                             |
| [`@financica/iso4217`](packages/iso4217)                               | 0.2.0   | ISO 4217 currency codes, numeric codes, minor units and entities                                      |
| [`@financica/myminfin`](packages/myminfin)                             | 0.8.0   | Client and document generators for the Belgian SPF Finances MyMinFin and Intervat APIs                |
| [`@financica/nace-codes`](packages/nace-codes)                         | 3.1.0   | NACE and NACEBEL economic activity classification codes                                               |
| [`@financica/nbb-cbso`](packages/nbb-cbso)                             | 0.6.1   | Belgian annual-accounts filing for the NBB/BNB Central Balance Sheet Office                           |
| [`@financica/pcmn`](packages/pcmn)                                     | 0.4.0   | Belgian PCMN class taxonomy and the statutory charts of accounts (`/charts`)                          |
| [`@financica/peppol`](packages/peppol)                                 | 0.8.0   | Peppol network: SML/SMP participant discovery, Directory lookups, EAS schemes                         |
| [`@financica/react-ubl-renderer`](packages/react-ubl-renderer)         | 0.3.0   | Render parsed UBL / Peppol BIS Billing 3.0 invoices as React or standalone HTML                       |
| [`@financica/scrada-client`](packages/scrada-client)                   | 0.5.0   | HTTP client for the Scrada Peppol API                                                                 |
| [`@financica/stripe-hosted-invoices`](packages/stripe-hosted-invoices) | 0.1.0   | Read a Stripe invoice, credit note or receipt from its public hosted URL — no API key                 |
| [`@financica/stripe-tax-invoices`](packages/stripe-tax-invoices)       | 0.1.0   | Stripe's monthly tax invoice for its own fees — PDF parser                                            |
| [`@financica/stripe-ubl`](packages/stripe-ubl)                         | 2.0.0   | Convert Stripe invoices and credit notes into Peppol BIS Billing 3.0 UBL                              |
| [`@financica/ubl`](packages/ubl)                                       | 0.16.0  | UBL invoice toolkit — parse, build and serialize Peppol BIS Billing 3.0                               |
| [`@financica/xbrl`](packages/xbrl)                                     | 0.2.0   | XBRL 2.1 instance document parser and serializer                                                      |

## Getting started

```sh
bun install
bun run ci      # lint, format:check, build, typecheck, test
```

Per-package work uses the same script names everywhere:

```sh
bun run --filter '@financica/ubl' test
bun run --filter '@financica/ubl' build
```

| Script                                  | Does                          |
| --------------------------------------- | ----------------------------- |
| `build`                                 | Bundle to `dist/` with tsdown |
| `clean`                                 | Remove `dist/`                |
| `typecheck`                             | `tsc --noEmit`                |
| `lint` / `lint:fix`                     | oxlint                        |
| `format` / `format:check`               | oxfmt                         |
| `test` / `test:watch` / `test:coverage` | vitest                        |
| `ci`                                    | All of the above, in order    |

Run at the repository root, `build`, `clean` and `typecheck` fan out across every
package in dependency order; `lint`, `format` and `test` run once over the whole
workspace. A package README lists only the scripts it adds beyond these.

Every package declares `engines.node >= 24`, and that is what CI runs.

Cross-package rules — error handling, absent values, types, packaging — are in
[CONVENTIONS.md](CONVENTIONS.md).

## Layout

Shared configuration lives at the root:

- `tsconfig.base.json` — every package extends it and overrides only what it must
  (`jsx`, DOM libs, extra strictness).
- `.oxlintrc.json`, `.oxfmtrc.json` — one lint and format configuration.
- `vitest.config.ts` — a project per package; a package keeps its own
  `vitest.config.ts` only where its tests need different settings.
- `oxlint`, `oxfmt`, `tsdown`, `typescript`, `vitest` and `@types/node` are root
  devDependencies. Packages declare only their own runtime and peer dependencies.

Cross-package dependencies are ordinary semver ranges (`@financica/ubl: ^0.13.0`),
not `workspace:*`: the manifest that is published is the manifest in the tree, with
no rewrite step. Bun resolves a range to the workspace copy when it matches, so a
change in `@financica/ubl` is picked up by `@financica/stripe-ubl` without a
publish — as long as the range is kept current when the dependency bumps.

Package history predates the monorepo; `git log --follow packages/<name>/src/index.ts`
reaches it.

## Releasing

Packages are released by hand, one at a time, from the package directory:

1. Bump `version` in `package.json` and add the entry to the package's `CHANGELOG.md`.
2. Update the version in the [Packages](#packages) table above.
3. Commit, then `npm publish --access public` — `prepack` runs the build.
4. Tag the commit `<name>@<version>` (for example `nbb-cbso@0.6.0`) and push the tag.

CI does not publish.

## Documentation

Each package's `README.md` is its complete reference: purpose, contract, API, limits
and the reasoning behind non-obvious choices. Longer reference material goes under
`packages/<name>/docs/` and is linked from that README. Prose describes the current
state only — what the package does and why, not what it used to do; the history is
in `CHANGELOG.md` and git. There are no per-package agent instruction files.

## License

MIT
