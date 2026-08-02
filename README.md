# @financica/ts-libs

Financica's TypeScript libraries for European e-invoicing, accounting and financial
data standards. One repository, one toolchain, one release process — each package is
still published to npm independently.

## Packages

| Package                                                        | Version | Description                                                                                           |
| -------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| [`@financica/camt053`](packages/camt053)                       | 0.1.0   | ISO 20022 CAMT.053 (Bank-to-Customer Statement) XML parser                                            |
| [`@financica/coda`](packages/coda)                             | 0.1.0   | Belgian CODA (coded statement of account) bank file parser                                            |
| [`@financica/ecb-client`](packages/ecb-client)                 | 0.1.0   | European Central Bank euro FX reference rates, with historical lookups and last-business-day fallback |
| [`@financica/edavki`](packages/edavki)                         | 0.1.0   | Slovenian eDavki (FURS) tax documents — build and serialize the DDV-O VAT return as EDP XML           |
| [`@financica/facturx`](packages/facturx)                       | 0.1.0   | Factur-X / ZUGFeRD (EN 16931 CII) hybrid e-invoices: parse, generate, embed in PDF/A-3                |
| [`@financica/gst-einvoice-qr`](packages/gst-einvoice-qr)       | 0.1.0   | Decode and verify the signed QR code on Indian GST e-invoices (IRP / IRN)                             |
| [`@financica/iso4217`](packages/iso4217)                       | 0.1.0   | ISO 4217 currency codes, numeric codes, minor units and entities                                      |
| [`@financica/myminfin`](packages/myminfin)                     | 0.7.0   | Client and document generators for the Belgian SPF Finances MyMinFin and Intervat APIs                |
| [`@financica/nace-codes`](packages/nace-codes)                 | 2.0.0   | NACE and NACEBEL economic activity classification codes                                               |
| [`@financica/nbb-cbso`](packages/nbb-cbso)                     | 0.5.0   | Belgian annual-accounts filing for the NBB/BNB Central Balance Sheet Office                           |
| [`@financica/pcmn`](packages/pcmn)                             | 0.3.1   | Belgian PCMN class taxonomy — account classes to economic categories                                  |
| [`@financica/peppol`](packages/peppol)                         | 0.6.0   | Peppol network: SML/SMP participant discovery, Directory lookups, EAS schemes                         |
| [`@financica/react-ubl-renderer`](packages/react-ubl-renderer) | 0.2.0   | Render parsed UBL / Peppol BIS Billing 3.0 invoices as React or standalone HTML                       |
| [`@financica/scrada-client`](packages/scrada-client)           | 0.5.0   | HTTP client for the Scrada Peppol API                                                                 |
| [`@financica/stripe-ubl`](packages/stripe-ubl)                 | 1.0.1   | Convert Stripe invoices and credit notes into Peppol BIS Billing 3.0 UBL                              |
| [`@financica/ubl`](packages/ubl)                               | 0.12.0  | UBL invoice toolkit — parse, build and serialize Peppol BIS Billing 3.0                               |
| [`@financica/xbrl`](packages/xbrl)                             | 0.2.0   | XBRL 2.1 instance document parser                                                                     |

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
workspace.

## Layout

Shared configuration lives at the root and is the single source of truth:

- `tsconfig.base.json` — every package extends it and overrides only what it must
  (`jsx`, DOM libs, extra strictness).
- `.oxlintrc.json`, `.oxfmtrc.json` — one lint and format configuration.
- `vitest.config.ts` — a project per package; a package keeps its own
  `vitest.config.ts` only where its tests need different settings.
- `oxlint`, `oxfmt`, `tsdown`, `typescript`, `vitest` and `@types/node` are root
  devDependencies. Packages declare only their own runtime and peer dependencies.

Cross-package dependencies use `workspace:*`, so a change in `@financica/ubl` is
picked up by `@financica/stripe-ubl` without a publish.

## History

This repository is the merge of 17 previously separate repositories. Each one's full
history was rewritten into `packages/<name>/` before being merged, so
`git log packages/ubl` and `git log --follow packages/ubl/src/index.ts` reach back to
the original commits. Commit hashes changed; authors, dates and messages did not.

Three packages were renamed on the way in — `@ingram-tech/camt053`,
`@ingram-tech/coda` and `@ingram-tech/myminfin` became `@financica/*` — as did
`nace-codes`, now `@financica/nace-codes`.

## License

MIT
