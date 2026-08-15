# @financica/nbb-cbso

Belgian annual-accounts filing for the National Bank of Belgium's Central Balance Sheet Office (Centrale des bilans / Balanscentrale).

This package builds, validates and renders the `.xbrl` instance document a filer uploads to the NBB Filing application. There is no submission API on the NBB side: the deliverable is a file.

Belgian knowledge lives here. The generic XBRL 2.1 reading and writing lives in [`@financica/xbrl`](../xbrl), which this package builds on.

> **Status: working end to end.** A micro company filing and an abbreviated association filing build, validate and render to a `.xbrl` that round-trips through a parser. Read [Check coverage](#check-coverage) before relying on validation: the validator is sound but incomplete.

## Scope

- Taxonomy **NBB-CBSO-26.0.15**, in use since 2 January 2026. Each release and model is its own module, so older and future releases sit alongside rather than replace.
- The nine annual-accounts models are full, abbreviated and micro, for companies with capital (`m02`, `m01`, `m07`), companies without capital (`m82`, `m81`, `m87`) and associations and foundations (`m05`, `m04`, `m08`). Since the CSA abolished company capital, a Belgian SRL/BV files a _without capital_ model — `m87` for a micro SRL. Generated: **`m87-f`, `m04-f`, `m05-f` and `m08-f`**; the other five are a generator run away (see [Taxonomy modules](#taxonomy-modules)).
- The statutory arithmetic and logical checks published in the Moniteur belge, which are disqualifying; the complementary checks from Annex 1.2 of the filing protocol, which are not; and the social balance sheet checks from Annex 1.3.

## The input contract

The full contract is in [`src/types.ts`](src/types.ts) and is the authority; this section explains the parts that are easy to get wrong.

```typescript
import type { NbbFilingInput } from "@financica/nbb-cbso";
import m87f from "@financica/nbb-cbso/taxonomies/m87-f";

const filing: NbbFilingInput = {
	taxonomy: m87f,
	language: "fr",
	entity: {
		enterpriseNumber: "0766280697",
		name: "EXEMPLE SRL",
		legalForm: "m610",
		address: { street: "RUE HAUTE", houseNumber: "16", postalCode: "1000" },
	},
	identification: {
		exercise: { startDate: "2025-01-01", endDate: "2025-12-31" },
		previousExercise: { startDate: "2024-01-01", endDate: "2024-12-31" },
		generalMeetingDate: "2026-06-15",
		previousPeriodDataUnchanged: true,
		pageCount: 12,
	},
	producer: { name: "Financica" },
	balanceSheet: { "20/58": { current: 184964.76, previous: 150210.0 } },
	incomeStatement: { "9905": { current: 12500.0, previous: 9800.0 } },
	appropriation: { "9906": { current: 41200.0 } },
	valuationRules: "Les règles d'évaluation sont établies conformément à…",
};
```

### The taxonomy is a module you import

The model, filing part and release are not named by string: `taxonomy` takes the module for the entry point you file against, `@financica/nbb-cbso/taxonomies/<model>-<part>`. The module carries `model`, `part` and `version` itself. Each is a separate file — `m05-f` alone is close to 3 MB of datapoints and checks — and the main entry imports none of them, so a bundler ships only the models a caller imports and a caller that files for one kind of entity pays for one.

An association or foundation (`m04`, `m05`, `m08`) files only the `-f` part; the NBB publishes no `-a` or `-o` entry point for those models, so there is no module to import.

### Figures are keyed by statutory rubric code

You pass `"20/58"`, not a taxonomy element name. The NBB taxonomy is dimensional: there are only fifteen metric elements in the whole dictionary, and a figure is a metric such as `met:am1` combined with a set of explicit dimension members that identify the rubric. Resolving a rubric code to that combination is this package's job. Element names never appear in the contract.

### The balance sheet is after appropriation

The NBB model is **après répartition / na resultaatverwerking**. Pass post-appropriation figures in `balanceSheet`, and the appropriation itself in `appropriation`. A pre-appropriation trial balance is not a valid input: the result of the exercise has to be allocated first, and the two must agree — that agreement is one of the statutory checks.

### There is no prior-period _context_, only a prior-period _column_

Both the current and the preceding exercise are reported at the same instant, the closing date of the exercise being filed. Current versus prior is a dimension, not a period. So the contract carries `current` and `previous` on each rubric rather than two sets of figures, and codes written `8059P` in the model are expressed as the `previous` side of `8059` rather than as their own key.

### Amounts

EUR, as plain numbers. Negative values take a minus sign. No thousands separators. Two decimal places are accepted on submission; publication is without decimals. `null` means reported as nil, which is not the same as absent.

### Identification is mandatory and easily forgotten

`generalMeetingDate`, both exercise date ranges, `previousPeriodDataUnchanged`, `pageCount` and `sectionsNotFiled` are all required by the model and are modelled explicitly for that reason.

## API

```typescript
import {
	buildNbbFiling,
	validateNbbFiling,
	renderNbbFiling,
} from "@financica/nbb-cbso";
import m04f from "@financica/nbb-cbso/taxonomies/m04-f";

const filing = buildNbbFiling({ ...input, taxonomy: m04f });
const { errors, warnings, skipped } = validateNbbFiling(filing);
if (errors.length === 0) {
	const xbrl = renderNbbFiling(filing); // write this to <name>.xbrl
}
```

`buildNbbFiling` resolves each rubric code against the taxonomy, so an unknown code throws rather than silently dropping a figure. That is also what keeps a company figure out of an association filing: `RubricCode` is a plain string, and `10/11` or `19` fed to `m04-f` fails at build time because the association model has no such rubric.

`validateNbbFiling` separates `errors` from `warnings` along the NBB's own line: statutory checks are disqualifying and land in `errors`, Annex 1.2 and social balance sheet checks are not and land in `warnings`. Each `Finding` carries the NBB's own check identifier, the rubric codes involved, and a message naming the figures that broke the rule. `skipped` lists checks that were not evaluated, which is deliberate — see below.

`renderNbbFiling` produces the instance document, following the conventions of accepted filings: one instant context per fact at the closing date, the preceding exercise as a period dimension, `decimals="INF"`, a single EUR unit, no segments, and none of the prohibited `linkbaseRef` / `roleRef` / `arcroleRef` / `footnoteLink` elements. Output is byte-stable across runs.

## Check coverage

The datapoint table and the check list are both generated from the taxonomy by `scripts/generate-taxonomy.ts`, which reads the table linkbases for rubric codes and the formula linkbases for the published assertions. The association models do not share the company checks — their equity identity has no capital in it and their appropriation account no dividends — so each model carries its own list:

| Module  | Datapoints | With a rubric code | Checks | Not applicable | Evaluated on the test fixture |
| ------- | ---------- | ------------------ | ------ | -------------- | ----------------------------- |
| `m87-f` | 1027       | 586                | 171    | 54             | 69                            |
| `m04-f` | 894        | 595                | 179    | 54             | 73                            |
| `m05-f` | 2139       | 1741               | 415    | 88             | —                             |
| `m08-f` | 819        | 540                | 160    | 54             | —                             |

_Not applicable_ are checks about a section the model does not have — the social balance sheet, for a micro or abbreviated filing. Of the rest, a check is evaluated when it resolves unambiguously to one rubric per variable and the filing reports something for it; `validateNbbFiling` reports the others as `skipped` (nothing reported to check), `unresolved` (could not be pinned to its rubrics) or `notApplicable`. Where a variable is ambiguous, the taxonomy filters it loosely enough to match several rubrics and disambiguates through `implicitFiltering`; the generator applies implicit filtering and an exact-match preference, which resolves most but not all.

Skipping is deliberate. Guessing which rubric an ambiguous variable meant would invent failures on filings that are in fact correct, and a rejected filing is what this package exists to prevent.

Six of the `m87-f` checks and three of the `m04-f` ones are pinned in tests to the equations published in Appendix 2.1 of the technical guide and reproduce the published form exactly, for example `va_03.01.0_0014` → `20/58 = 20 + 21/28 + 29/58` and, for the association, `va_03.02.0_0012` → `14 = 9906 + 791 - 691`. The rest come from the same generated code path but have not been transcribed against the guide individually.

Alongside the generated checks, these are asserted directly: the balance sheet balancing (`20/58 = 10/49`, stated too loosely in the taxonomy to resolve), DAT 26 date consistency, DAT 31 decimal places, the enterprise number's modulo-97 check digits, non-empty valuation rules, and the requirement that at least one balance sheet figure be reported for the exercise.

## Known gaps

- The software producer is **not** written into the annual accounts instance. Its section belongs to the `m101-r` module, which is a separate filing and is not generated.
- The company models with capital (`m01`, `m02`, `m07`), the full and abbreviated models without capital (`m81`, `m82`) and the split `-a` / `-o` parts are not generated. Nothing in the code is specific to the four that are; see [Taxonomy modules](#taxonomy-modules).
- Directors (section 2.1) and the accountant declaration (section 2.2) are accepted by the contract but not rendered — they sit in open tables addressed by typed dimensions.
- DAT 39, duplicate filing, cannot be checked locally: it depends on what the NBB already holds.

## Filing constraints

- One annual account per file, `.xbrl` extension, 50 MB maximum.
- The entity identifier is the KBO/BCE enterprise number as ten digits, no `BE` prefix, under the scheme `http://www.fgov.be`.
- Filing is due within 30 days of approval by the general meeting, and at most 7 months after the close of the exercise.
- The fee must be paid within 6 working days of the filing reaching "ready for payment", or the filing is cancelled.

## Development

Standard scripts — see the [repository README](../../README.md#getting-started).
Package-specific: `bun run generate <taxonomy-dir> <version> <model-part>...` regenerates the taxonomy modules (see below).

### Taxonomy modules

`src/taxonomies/*.ts` and `src/generated/enumerations.ts` are generated, never edited. To add a model or take a new January release:

```bash
curl -O https://www.nbb.be/doc/ba/xbrl/taxo2026/nbb-cbso-26.0.15.zip
unzip -q nbb-cbso-26.0.15.zip -d taxo
bun run generate taxo/nbb-cbso-26.0.15 26.0.15 m87-f m04-f m05-f m08-f
```

Each `<model>-<part>` becomes `src/taxonomies/<model>-<part>.ts`, which tsdown builds to its own entry under `dist/taxonomies/`, published through the `./taxonomies/*` export pattern — no `package.json` change per model. The generator formats what it writes, so a re-run against the same release is a no-op in git. Pass every model you want in one run or in several; each file stands alone and there is no index to keep in step.

### Test fixture

`test/fixtures/m87-micro-example.xbrl` is a real accepted micro filing that has been anonymised by `scripts/anonymize-nbb-instance.ts`. The script replaces every identifying value while preserving the structure the fixture exists to exercise: context ids, fact ids and dimensional signatures are unchanged, dates are shifted by whole years so their relations still hold, and amounts are scaled by a single integer so the statutory arithmetic still balances exactly.

## License

MIT
