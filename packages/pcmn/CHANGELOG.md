# Changelog

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
