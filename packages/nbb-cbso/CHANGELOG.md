# Changelog

## 0.2.1

- Report the valuation rules. `validateNbbFiling` made the field mandatory, but
  `buildNbbFiling` never wrote it, so section 6.5 was filed empty.

## 0.2.0

End-to-end filing generation and validation for the micro model without capital (`m87-f`).

- `scripts/generate-taxonomy.ts` reads a taxonomy release and emits typed datapoint and check tables: rubric code to metric plus dimension members, from the table linkbases, and the published assertions, from the formula linkbases. Neither is hand-written. Committed output for NBB-CBSO 26.0.15: 936 datapoints, 523 with a rubric code, 171 checks.
- `buildNbbFiling` resolves an input against a taxonomy release; `validateNbbFiling` runs the checks; `renderNbbFiling` writes the instance document.
- The validator evaluates the 51 checks that resolve unambiguously and reports the rest in `skipped` rather than guessing. Every evaluated statutory check reproduces the equation published in Appendix 2.1.
- Structural checks for DAT 26, DAT 31, the enterprise number's check digits, mandatory valuation rules, and the balance sheet balancing.

## 0.1.0

Initial release.

- Typed input contract for an NBB/CBSO annual-accounts filing (`NbbFilingInput`), keyed by statutory rubric code, after appropriation, with the prior exercise as a column rather than a period.
- Anonymiser for turning a real accepted filing into a committable test fixture, preserving context and fact structure, date relations and the exactness of the statutory arithmetic.
