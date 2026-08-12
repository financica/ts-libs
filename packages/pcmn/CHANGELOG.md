# Changelog

## 0.4.0

- Adds `@financica/pcmn/charts`: the statutory charts themselves, for
  enterprises (478 accounts) and for associations and foundations (449), in
  French, Dutch, German and English — every language the CNC publishes the
  annexe in. Behind its own entry point, so the class taxonomy stays as small
  as it was.
- The charts are the annexe verbatim. Ranges stay ranges, accounts the law
  prints unnamed keep an empty wording, and the two places where the CNC's own
  text has a gap (no French number for the 550-559 range; 6702 misnumbered as a
  second 6701 in Dutch) are left as gaps rather than filled in from another
  language. `labelFor` falls back across languages for callers that just want a
  name.
- `resolveCode` answers which entry of a chart governs an arbitrary account
  number, following ranges and falling back to the nearest ancestor.

## 0.3.1

- Reverts the `110901` / `111901` entries added in 0.3.0. They are the CNC's own
  numbering in advice 2019/14, not rubrics of the chart, which goes no deeper
  than `1119` under 11 — so a company that numbers its uncalled contribution
  differently was still reported, and the table stopped being what its contract
  says it is. The principle stands (the uncalled part of a contribution is a
  debit sub-account and the rubric reports net); it belongs on the account, not
  in a table of statutory rubrics.

## 0.3.0

- `110901` and `111901` are debit contras. The CSA left the SRL and the SC with
  a contribution rather than capital, and the balance sheet scheme for
  companies without capital has no uncalled line of its own — so the part not
  yet called is a debit sub-account of the contribution it belongs to, and the
  rubric is reported net. CNC/CBN advice 2019/14 numbers the unavailable one
  `111901` under `1119`; `110901` is its available counterpart. Without them a
  wrong-side check reports a correctly kept SRL as an anomaly, which `101`
  already covered for a company with capital.

## 0.2.0

- Add the contra-account taxonomy: `contraSideForCode` / `isContraCode` name the
  rubrics the PCMN prints with a trailing "(–)" and the side their balance
  actually sits on. A check that derives an expected side from the account class
  needs them, or it reports the chart's own design as an error (uncalled capital
  is debit-side equity, amounts written down are credit-side assets). Includes
  the …9 accumulated-depreciation convention, so an organization's own cost
  sub-accounts resolve without being listed.

## 0.1.1

- Rename the `otherOperatingCharges` / `otherOperatingIncome` categories to
  `otherCharges` / `otherIncome` to match the suite's existing bucket names, so
  aggregation is a direct category lookup with no adapter.

## 0.1.0

Initial release. Belgian PCMN class taxonomy:

- Income-statement classes (60-66, 70-76) to economic categories via
  `plCategoryForCode`, including the statutory director-remuneration rule
  (618 to "Services et biens divers").
- Liquidity classes (54/55/57) via `isCashClass`.
- Fixed-asset classes (20-28) via `fixedAssetGroupForCode`.
