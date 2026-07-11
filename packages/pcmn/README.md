# @financica/pcmn

Zero-dependency Belgian **PCMN** (Plan Comptable Minimum Normalisé) class
taxonomy. It maps income-statement and fixed-asset account classes to a small
set of economic categories, so any app in the suite classifies revenue, costs
and assets the same way. It is deliberately class-level (not a full chart of
accounts): the shared thing is the *meaning* of each PCMN class.

```ts
import { plCategoryForCode, isCashClass, fixedAssetGroupForCode } from "@financica/pcmn";

plCategoryForCode("700000"); // "revenue"
plCategoryForCode("610000"); // "services"
plCategoryForCode("620200"); // "personnel"
plCategoryForCode("618000"); // "services"  <- the director-remuneration rule
isCashClass("550000");       // true
fixedAssetGroupForCode("23"); // "tangible"
```

## The director-remuneration rule (618)

In the PCMN, the remuneration of a company director/manager who is **not**
employed under a contract of employment (a self-employed *dirigeant
d'entreprise*, the usual case for an SRL/SA founder paying themselves) is booked
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

Account codes may be passed at any length (2-digit class up to a full leaf
code); classification uses the leading digits.

## License

MIT
