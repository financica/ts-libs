# @financica/nbb-cbso

Belgian annual-accounts filing for the National Bank of Belgium's Central Balance Sheet Office (Centrale des bilans / Balanscentrale).

This package builds, validates and renders the `.xbrl` instance document a filer uploads to the NBB Filing application. There is no submission API on the NBB side: the deliverable is a file.

Belgian knowledge lives here. The generic XBRL 2.1 reading and writing lives in [`@financica/xbrl`](https://github.com/financica/xbrl), which this package builds on.

> **Status: early.** This release publishes the typed input contract below, so consumers can code against it. The taxonomy code generation, the instance writer and the validator are in progress.

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
buildNbbFiling(input: NbbFilingInput): NbbFiling
validateNbbFiling(filing: NbbFiling): ValidationResult
renderNbbFiling(filing: NbbFiling): string
```

`validateNbbFiling` separates `errors` from `warnings` along the NBB's own line: statutory checks are disqualifying and land in `errors`, Annex 1.2 checks are not and land in `warnings`. Each `Finding` carries the NBB's own check identifier, the rubric codes involved, and expected versus actual.

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
