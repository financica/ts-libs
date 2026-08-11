# @financica/be-vat-account

Parser for the **Belgian VAT current-account statement** — the _Extrait de compte TVA_ / _Uittreksel btw-rekening_ the FPS Finance (SPF Finances / FOD Financiën) issues through MyMinfin.

The statement is the authority's own running account of what you owe it and what it owes you: every return it has processed, every payment it has received, every interest charge and fine, and the month-end position after each. It arrives as a PDF and nowhere else — there is no API, no CSV, no structured export.

```
Extrait de compte TVA (PDF)
            │
            ▼
  @financica/be-vat-account ──▶ header + dated entries
```

For filing the returns that produce those movements, see [`@financica/myminfin`](../myminfin).

## Installation

```bash
npm install @financica/be-vat-account
```

One runtime dependency (`unpdf`, for text extraction). Requires Node ≥ 24.

## Usage

```ts
import { parseVatAccountStatement } from "@financica/be-vat-account";

const statement = await parseVatAccountStatement(await file.arrayBuffer());

console.log(statement.header.vatNumber); // "0766280697"
console.log(statement.header.balanceType); // "to_pay"
console.log(statement.header.balanceAmount); // 2561.66

for (const entry of statement.entries) {
	console.log(entry.entryType, entry.effectiveDate, entry.amountOwed);
}
```

### Detecting the format first

`isVatAccountStatement` reads the text and checks for the markers, doing none of
the table work. Use it as a gate in front of a multi-format importer.

```ts
import { isVatAccountStatement } from "@financica/be-vat-account";

if (await isVatAccountStatement(bytes)) {
	// …
}
```

### Bringing your own text extraction

`parseVatAccountStatementRows` takes positioned text directly, so you can feed
it from your own PDF pipeline, or from OCR of a scanned copy. Group rows **per
page** and concatenate in page order — Y coordinates restart on each page, and
grouping across the document fuses unrelated lines. `groupIntoRows` is exported
for exactly this.

```ts
import { groupIntoRows, parseVatAccountStatementRows } from "@financica/be-vat-account";

const items = []; // { str, x, y } in document order
const rows = pages.flatMap((page) => groupIntoRows(itemsOf(page)));

const statement = parseVatAccountStatementRows(items, rows);
```

## The two layouts

The administration changed the statement in Q4 2022. Both are supported, and
`header.layout` reports which one you got.

|                 | `pform671` (Q4 2022 →)        | `legacy` (← Q3 2022)          |
| --------------- | ----------------------------- | ----------------------------- |
| Marker          | `PFORM671`                    | none; recognised by its title |
| Dates           | `31.10.2024`                  | `31/10/2024`                  |
| VAT number      | `BE0766280697/PFORM671/…`     | `0766.280.697`, dotted        |
| Situation lines | `Situation fin novembre 2024` | `Situation fin 11/2024`       |
| Form reference  | printed on the document       | **synthesized** (see below)   |

Both are issued in French and Dutch; `header.language` reports which.

A legacy statement carries no reference of its own, so one is derived as
`BE<vat>/VAT-STATEMENT/<situationDate>`. It is stable enough to deduplicate
imports of the same document, but it is **not** a value the administration
knows — do not quote it back to them.

## What you get

`header` carries the identity and the closing position:

- `vatNumber` — ten digits, no prefix, no dots
- `formReference`, `documentUuid`
- `statementDate`, `situationDate`, `periodStartDate` — all `YYYY-MM-DD`
- `language`, `layout`
- `balanceType` — `to_pay` · `to_reimburse` · `to_carry_forward` · `zero`
- `balanceAmount` — always non-negative; `balanceType` carries the direction
- `structuredCommunication` — the `+++000/0000/00000+++` payment reference

`entries` is the detailed table, in printed order (`lineOrder`), one of three
kinds:

- `previous_balance` — the carried-forward opening position
- `transaction` — a dated movement, with `registrationDate`, `operationCode`
  and `effectiveDate`
- `situation` — the running position at the end of a month, with
  `situationMonth` / `situationYear`

Amounts are split across two columns and kept that way: `amountInFavor` is owed
to you, `amountOwed` is owed by you, and a row fills exactly one of them.

The `effectiveDate` on a transaction is the one interest runs from, and it is
regularly not the `registrationDate`. If you are computing anything, use the
effective date.

## Notes and limits

- **Native text only.** These PDFs are generated, not scanned, so extraction is
  exact and no OCR is involved. A scan of a printout will not parse — extract
  the text yourself and use `parseVatAccountStatementRows`.
- **Column geometry is measured, not declared.** The PDF is a positioned
  drawing with no table structure, so columns are recovered from X
  coordinates against ranges taken from real statements. A future redesign of
  the form would need new ranges.
- **Read only.** Nothing here files, pays, or contacts the administration.
- Both layouts, both languages, and multi-page statements are covered. Amounts
  are parsed as numbers, which is correct at the magnitudes this document
  carries; if you need exact decimal arithmetic, convert to minor units at the
  boundary.

## License

MIT
