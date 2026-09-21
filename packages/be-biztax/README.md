# @financica/be-biztax

Belgian corporate income tax returns for [Biztax](https://financien.belgium.be/nl/E-services/biztax), the filing application of FPS Finance (SPF Finances / FOD Financiën).

This package builds, checks and renders the XBRL instance of a return, and wraps one or more of them in the `.biztax` file that is uploaded under "Opladen aangiften". There is no submission API on the FPS Finance side: the deliverable is a file, signed in Biztax by whoever holds the mandate.

Belgian tax knowledge lives here. The generic XBRL 2.1 reading and writing lives in [`@financica/xbrl`](../xbrl), which this package builds on.

> **Status: early.** A resident company's return renders to an instance that Arelle accepts as valid XBRL 2.1 and XBRL Dimensions against the official taxonomy. The package does **not** compute the return: every line, totals included, is the caller's. Read [What is checked](#what-is-checked) before relying on validation.

## Scope

- Taxonomy **be-tax 2026-04-30** (assessment year 2026), entry point **`rcorp`**: the resident corporate tax return, form 275.1. The non-resident (`nrcorp`) and legal entities (`rle`) returns are a generator run away and untested.
- Every concept of the entry point can be reported, dimensional ones included. The identification block (the NBB's `pfs-gcd` tuples) is built from the entity and the period.

## Usage

```typescript
import {
	buildBiztaxReturn,
	validateBiztaxReturn,
	renderBiztaxReturn,
	wrapBiztax,
	biztaxFileName,
} from "@financica/be-biztax";
import ay2026 from "@financica/be-biztax/taxonomies/ay2026-rcorp";

const filing = buildBiztaxReturn({
	taxonomy: ay2026,
	language: "fr",
	entity: {
		enterpriseNumber: "0766.280.697",
		name: "EXEMPLE SRL",
		legalForm: "610",
		address: { street: "Rue Haute", houseNumber: "16", postalCode: "1000" },
	},
	period: { startDate: "2025-01-01", endDate: "2025-12-31" },
	facts: [
		{ concept: "LegalReserve", at: "start", value: 1860 },
		{ concept: "LegalReserve", at: "end", value: 1860 },
		{ concept: "NonDeductibleRestaurantExpenses", value: 418.5 },
		{ concept: "DisallowedExpenses", value: 418.5 },
		{
			concept: "OtherReserves",
			at: "end",
			value: 5000,
			dimensions: { "d-ty:DescriptionTypedDimension": "Réserve de liquidation" },
		},
		{ concept: "StatutoryAccounts", value: annualAccountsPdf }, // Uint8Array
	],
});

const { valid, findings } = validateBiztaxReturn(filing);
const file = wrapBiztax([renderBiztaxReturn(filing)]);
const name = biztaxFileName("Exemple SRL 2026"); // "Exemple SRL 2026.biztax"
```

`buildBiztaxReturn` throws a `BiztaxBuildError` for what is a bug in the caller: a concept the entry point does not declare, dimensions the concept cannot carry, a member an explicit dimension does not define, a JavaScript type the datatype has no form for, a code outside its list, or one fact given twice. What is wrong with the _figures_ is a finding, not an exception.

## How the return is laid out

Worth knowing before mapping a ledger onto it; the taxonomy's rules enforce all of it.

- **Three moments.** A concept covers the taxable period (`D`) or is a balance at its start or end (`I-Start`, `I-End`; `at: "start" | "end"`). A date-only XBRL instant means the end of that day, so the opening balance is rendered at the day _before_ the period starts. The rules test for exactly that.
- **The form opens from the reserves, not from the result.** The movement in taxable reserves (`TaxableReservedProfit`, closing less opening `TaxableReserves`), plus `DisallowedExpenses`, plus `TaxableDividendsPaid`, is the `FiscalResult`. Each subtotal on the way is its own mandatory concept, and a rule recomputes it.
- **Open tables are typed dimensions.** A row of "other reserves" is the concept `OtherReserves` with a `d-ty:DescriptionTypedDimension` member the filer names, three characters or more.
- **Closed lists are elements.** Legal form `610` is reported as the element `pfs-vl:XCode_LegalFormCode_610`. The builder does this from the code.
- **Always required** for a company: the three "size of the company" lines (average workforce, turnover, balance sheet total, zero included), the general meeting minutes as a PDF annex, and, when a dividend is reported, the withholding tax acknowledgement.
- **Amounts** are EUR with two decimals and `decimals="INF"`; positive is the default sign of every line.

## What is checked

`validateBiztaxReturn` checks what needs no formula processor: datatype ranges and lengths, typed members, the period against the assessment year's window, the enterprise number and its check digits, and the annexes (real PDFs, 5 MB each, 15 MB per instance).

It does **not** evaluate the taxonomy's XBRL formula assertions, several hundred of them, which is what Biztax validates an upload with and what decides whether a return can be signed. Neither are the `notAll` exclusion hypercubes read. A return this package accepts can still be refused.

The local stand-in for that is Arelle:

```sh
scripts/arelle-check.sh <taxonomy-dir> <instance.xbrl> [--offline]
```

It runs the official assertions and prints what fails, in the taxonomy's own words and with the form's line numbers (`[1240] 'Dépenses non admises…' (0) n'est pas correct (= 418.50)`). It patches two defects of the release on the way and filters one class of Arelle noise; the script's header says which. Arelle is not the processor FPS Finance runs (UBMatrix XPE), so the last word is an upload to Biztax left unsigned.

## Taxonomy modules

FPS Finance publishes a release every 30 April, at [Technische documentatie](https://financien.belgium.be/nl/E-services/biztax/technische-documentatie), with a versioning spreadsheet of what changed. A module is one entry point of one release:

```sh
curl -O https://financien.belgium.be/sites/default/files/downloads/be-tax-2026-04-30_V1.0.2.zip
unzip -q be-tax-2026-04-30_V1.0.2.zip -d taxo
bun run generate taxo/be-tax-2026-04-30_V1.0.2 1.0.2 rcorp
```

It holds the reportable concepts with their period type, datatype, labels (nl, fr, de) and the hypercubes they sit in; the tuples with their content models; the dimensions; the code lists the identification draws on; and the release's literal parameters (`AssessmentYearEndFirst`, rates, thresholds). There is no index of modules: a caller imports the one it files against and passes it in, which keeps the others out of its bundle.

## Filing constraints

- One return per instance, `.xbrl`; up to 25 instances per `.biztax` file.
- File names take unaccented letters, digits, spaces and `. - _`.
- The entity identifier is `BE` and the ten digits of the KBO/BCE number, under the scheme `http://www.fgov.be`.
- The return names itself by language: `ISoc`, `VenB` or `GSt`.

## Development

Standard scripts, see the [repository README](../../README.md#getting-started). This package adds `generate` (above).
