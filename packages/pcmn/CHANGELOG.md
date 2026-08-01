# Changelog

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
