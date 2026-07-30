# @financica/nbb-cbso

Belgian annual-accounts filing for the National Bank of Belgium's Central Balance Sheet Office (Centrale des bilans / Balanscentrale).

This package builds, validates and renders the `.xbrl` instance document a filer uploads to the NBB Filing application. There is no submission API on the NBB side: the deliverable is a file.

Belgian knowledge lives here. The generic XBRL 2.1 reading and writing lives in [`@financica/xbrl`](https://github.com/financica/xbrl), which this package builds on.

> **Status: early but working end to end.** A micro filing builds, validates and renders to a `.xbrl` that round-trips through a parser. Read [Check coverage](#check-coverage) before relying on validation: the validator is sound but not yet complete.

## Scope

- Taxonomy **NBB-CBSO-26.0.15**, in use since 2 January 2026, with older and future versions selectable.
- All nine annual-accounts models: full, abbreviated and micro, for companies with capital, companies without capital, and associations and foundations. Since the CSA abolished company capital, a Belgian SRL/BV files a _without capital_ model — `m87` for a micro SRL.
- The statutory arithmetic and logical checks published in the Moniteur belge, which are disqualifying; the complementary checks from Annex 1.2 of the filing protocol, which are not; and the social balance sheet checks from Annex 1.3.

## The input contract

The full contract is in [`src/types.ts`](src/types.ts) and is the authority; this section explains the parts that are easy to get wrong.

```typescript
import type { NbbFilingInput } from "@financica/nbb-cbso";

const filing: NbbFilingInput = {
	model: "m87",
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

### Figures are keyed by statutory rubric code

You pass `"20/58"`, not a taxonomy element name. This is not sugar. The NBB taxonomy is dimensional: there are only fifteen metric elements in the whole dictionary, and a figure is a metric such as `met:am1` combined with a set of explicit dimension members that identify the rubric. Resolving a rubric code to that combination is this package's job. Element names never appear in the contract.

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

const filing = buildNbbFiling(input);
const { errors, warnings, skipped } = validateNbbFiling(filing);
if (errors.length === 0) {
	const xbrl = renderNbbFiling(filing); // write this to <name>.xbrl
}
```

`buildNbbFiling` resolves each rubric code against the taxonomy, so an unknown code throws rather than silently dropping a figure.

`validateNbbFiling` separates `errors` from `warnings` along the NBB's own line: statutory checks are disqualifying and land in `errors`, Annex 1.2 and social balance sheet checks are not and land in `warnings`. Each `Finding` carries the NBB's own check identifier, the rubric codes involved, and a message naming the figures that broke the rule. `skipped` lists checks that were not evaluated, which is deliberate — see below.

`renderNbbFiling` produces the instance document, following the conventions of accepted filings: one instant context per fact at the closing date, the preceding exercise as a period dimension, `decimals="INF"`, a single EUR unit, no segments, and none of the prohibited `linkbaseRef` / `roleRef` / `arcroleRef` / `footnoteLink` elements. Output is byte-stable across runs.

## Check coverage

The datapoint table and the check list are both generated from the taxonomy by `scripts/generate-taxonomy.ts`, which reads the table linkbases for rubric codes and the formula linkbases for the published assertions. For `m87-f` that yields **936 datapoints, 523 of them carrying a statutory rubric code, and 171 checks**.

Of those 171, **51 resolve unambiguously** to one rubric per variable and are evaluated. The rest are skipped and reported in `skipped`:

- **40 are ambiguous.** The taxonomy filters some variables loosely enough to match several rubrics, and disambiguates through `implicitFiltering`. The generator applies implicit filtering and an exact-match preference, which resolves many but not all.
- **80 have a variable that reaches no coded rubric** in this model.

Skipping is the deliberate choice. Guessing which rubric an ambiguous variable meant would invent failures on filings that are in fact correct, and the whole point of this package is to stop a filing being rejected — a validator that cries wolf is worse than one that says what it did not check.

Every statutory check that _is_ evaluated has been verified against the equations published in Appendix 2.1 of the technical guide. All six reproduce the published form exactly, for example `va_03.01.0_0014` → `20/58 = 20 + 21/28 + 29/58`.

Alongside the generated checks, these are asserted directly: the balance sheet balancing (`20/58 = 10/49`, stated too loosely in the taxonomy to resolve), DAT 26 date consistency, DAT 31 decimal places, the enterprise number's modulo-97 check digits, non-empty valuation rules, and the requirement that at least one balance sheet figure be reported for the exercise.

## Known gaps

- The software producer is **not** written into the annual accounts instance. Its section belongs to the `m101-r` module, which is a separate filing and is not published; only `m87-f` is generated so far.
- Directors (section 2.1) and the accountant declaration (section 2.2) are accepted by the contract but not yet rendered — they sit in open tables addressed by typed dimensions.
- DAT 39, duplicate filing, cannot be checked locally: it depends on what the NBB already holds.

## Filing facts worth knowing

- One annual account per file, `.xbrl` extension, 50 MB maximum.
- The entity identifier is the KBO/BCE enterprise number as ten digits, no `BE` prefix, under the scheme `http://www.fgov.be`.
- Filing is due within 30 days of approval by the general meeting, and at most 7 months after the close of the exercise.
- The fee must be paid within 6 working days of the filing reaching "ready for payment", or the filing is cancelled.

## Development

```bash
bun run test       # vitest
bun run lint       # oxlint
bun run typecheck  # tsc --noEmit
bun run build      # tsdown
bun run ci         # all of the above
```

### Test fixture

`test/fixtures/m87-micro-example.xbrl` is a real accepted micro filing that has been anonymised by `scripts/anonymize-nbb-instance.ts`. The script replaces every identifying value while preserving the structure the fixture exists to exercise: context ids, fact ids and dimensional signatures are unchanged, dates are shifted by whole years so their relations still hold, and amounts are scaled by a single integer so the statutory arithmetic still balances exactly.

## License

MIT
