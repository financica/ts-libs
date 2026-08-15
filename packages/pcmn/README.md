# @financica/pcmn

Zero-dependency Belgian **PCMN** (Plan Comptable Minimum Normalisé). Two things
behind two entry points:

- `@financica/pcmn` — the **class taxonomy**. Maps income-statement and
  fixed-asset account classes to a small set of economic categories, so any app
  in the suite classifies revenue, costs and assets the same way.
- `@financica/pcmn/charts` — the **statutory charts themselves**, for
  enterprises and for associations, in all four languages the CNC publishes
  them in. Kept behind its own entry point because it is ~200 kB of data.

```ts
import {
	plCategoryForCode,
	isCashClass,
	fixedAssetGroupForCode,
} from "@financica/pcmn";

plCategoryForCode("700000"); // "revenue"
plCategoryForCode("610000"); // "services"
plCategoryForCode("620200"); // "personnel"
plCategoryForCode("618000"); // "services"  <- the director-remuneration rule
isCashClass("550000"); // true
fixedAssetGroupForCode("23"); // "tangible"
```

## The charts

```ts
import {
	accountByCode,
	labelFor,
	PCMN_ENTREPRISES,
	resolveCode,
} from "@financica/pcmn/charts";

labelFor(accountByCode(PCMN_ENTREPRISES, "440")!, "nl"); // "Leveranciers"
resolveCode(PCMN_ENTREPRISES, "5551")?.code; // "550" (the 550-559 range)
```

These are the annexe **verbatim**, which means they stop where the law stops:

- A range is one entry (`code` `"643"`, `codeTo` `"648"`), not six accounts.
- An account the law prints without wording — `669`, or the repealed `203` —
  has the **empty string** in every language. That is not a gap.
- A language is **absent** where that language's source does not have the
  account. Two such gaps exist and are the CNC's own: the French page omits the
  number of the `550`-`559` range, and the Dutch page prints `6701` twice where
  `6702` belongs. Neither is filled in from another language; `labelFor` falls
  back instead.
- Accounts the law leaves the entity to subdivide (`61` into `610`-`616`, say)
  are simply not here. An application seeds its own chart from this and adds
  what it needs.

The associations chart also carries `rubric`, the matching heading in the NBB
annual-accounts model, on the 155 accounts the annexe gives it for.

## The director-remuneration rule (618)

In the PCMN, the remuneration of a company director/manager who is **not**
employed under a contract of employment (a self-employed _dirigeant
d'entreprise_, the usual case for an SRL/SA founder paying themselves) is booked
in account **618**, which belongs to class **61 "Services et biens divers"** —
not class 62 "Rémunérations". `plCategoryForCode` encodes this so owner pay is
never miscounted as personnel, which is what lets a financial plan reconcile
against real bookkeeping.

## Exports

- `PlCategory`, `PCMN_PL_CLASSES`, `plCategoryForCode(code)` — income-statement
  classes (60-66 charges, 70-76 income) and the categories they map to.
- `DIRECTOR_REMUNERATION_ACCOUNT` (`"618"`).
- `CASH_CLASSES`, `isCashClass(code)` — liquidity classes 54/55/57.
- `FixedAssetGroup`, `PCMN_FIXED_ASSET_CLASSES`, `fixedAssetGroupForCode(code)`
  — balance-sheet fixed-asset classes 20-28.
- `ContraSide`, `contraSideForCode(code)`, `isContraCode(code)` — the rubrics
  the chart prints with a trailing "(–)", and the side their balance sits on.
  Uncalled capital (101) is debit-side equity, amounts written down (419) are
  credit-side assets, rebates allowed (708) are debit-side income. Covers the …9
  accumulated-depreciation convention, so 2409 resolves against a 240 cost
  account without being listed.

Account codes may be passed at any length (2-digit class up to a full leaf
code); classification uses the leading digits.

From `@financica/pcmn/charts`:

- `PCMN_ENTREPRISES` (478 accounts), `PCMN_ASSOCIATIONS` (449), `PCMN_CHARTS`,
  `chartById(id)`.
- `PcmnAccount`, `PcmnChart`, `PcmnChartId`, `PcmnLanguage`, `PCMN_LANGUAGES`.
- `accountByCode(chart, code)`, `coversCode(account, code)`,
  `resolveCode(chart, code)`, `labelFor(account, language, fallbacks?)`.

## Provenance

Recovered from the CNC's own four-language publication of the annexe to the
**AR/KB of 21 October 2018** (annexe 1re for enterprises, annexe 3 for
associations; CDE/WER art. III.84). German and English are the CNC's own
translations, reachable only through its multilingual comparison view. The four
renderings were extracted independently and reconciled against each other: they
agree on the enterprises chart exactly, and on the associations chart apart from
the two source defects noted above.

## License

MIT
