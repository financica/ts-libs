# Changelog

## 0.6.1

### Fixed

- **Taxonomy checks using `and` / `or` now evaluate instead of throwing.** The expression parser short-circuited `logical()`, so when the left side decided the result the right side was never consumed and `$a eq 1 or $b eq 3` was rejected as "unexpected trailing input". Every published check with a logical operator hit this; both sides are now parsed before they are combined (the grammar has no side effects, so evaluating both is free).

## 0.6.0

Breaking: `NbbFilingInput.taxonomy` is the taxonomy module itself, imported
from `@financica/nbb-cbso/taxonomies/<model>-<part>`, and replaces the
`model`, `part` and `taxonomy` (version) strings. `TAXONOMY_MODULES` and
`DEFAULT_TAXONOMY` are gone with the registry they served. A registry that is
looked up by string at runtime cannot be tree-shaken — a bundler has to keep
every model behind it — and at 3 MB for the full association model alone that
was going to be the whole package. With the module passed in, the main entry
carries no taxonomy data at all and a caller ships the models it imports.
`NbbFilingPart` is now the entry-point suffix, `"f"` / `"a"` / `"o"`.

- The association and foundation models are generated: `m04-f` (abbreviated),
  `m05-f` (full) and `m08-f` (micro), alongside `m87-f`. They carry the
  association's own passif spine — `10` is the association's funds, `13` the
  allocated funds — the class-73 income rubric for contributions, gifts,
  legacies and grants, and their own check lists (179, 415 and 160), which
  do not share the company appropriation identity. An association files only
  the `-f` part, and there is no other module to import.
- The generator emits each model to `src/taxonomies/` and formats its output,
  and no longer writes an index that a partial run could leave short.

## 0.5.0

Breaking: a filing with no `entity.businessCourt` is now an error. The business
court is a mandatory mention, and the filing application refuses the deposit
over it ("Le tribunal d'entreprise est une mention obligatoire") without any
taxonomy formula stating so, which meant a filing could pass validation here
and be refused on upload.

- `ENUMERATIONS` exports the closed lists a filer picks a member of, generated
  from the taxonomy's own domains with the label the NBB publishes in each of
  the four filing languages. `cct` (29 business courts) and `lgf` (83 legal
  forms). Only the lists a human chooses from: an address determines `pcd` and
  `cty`, so their 1,396 members are not carried.

## 0.4.0

Breaking: `validateNbbFiling` returns `evaluated`, `notApplicable` and
`unresolved` alongside `skipped`, which now means only "the filing reported
nothing to check". A check that could not be pinned to its rubrics is
`unresolved`, and one belonging to a section the model does not have is
`notApplicable`; lumping the three together made a validator running four
rules look like one running a hundred and seventy.

- Checks are pinned to the rubrics the taxonomy says they are about. The
  formula linkbases ship the message shown when an assertion fails, and for
  the arithmetic checks that message is the equation in rubric codes —
  `9904 = 9903 + 780 - 680 - 67/77`. Read as the anchor, with dimensional
  inference supplying the repetitions of an equation the model applies once
  per asset class. 4 checks evaluated against the reference filing before,
  69 now, and 1 unresolved.
- The metric is inherited down a breakdown, so the detail rows a model
  aggregates are no longer dropped: 1027 datapoints, 586 with a rubric code.
- Section 1 reports the legal form, postal code, country, business court and
  date of the articles of association. All five were accepted and none were
  written. Four are members of a closed list, reported in an element of that
  list's own namespace (`lgf-enum:list2` carrying `lgf:m610`), so `Datapoint`
  gained `metricPrefix`.
- An opening balance such as `8199P` is reported only in the preceding
  exercise's column. The current-exercise cell the table walk also produced
  is an artifact, and reporting it is what the NBB refuses as dimensionally
  invalid.
- One fact per datapoint, however many rubrics name it. `(14)` and `14` are
  one figure the model prints twice; giving them different values now raises
  instead of emitting a contradiction.

## 0.3.0

- `previousExercise` is optional. A first exercise has no comparative column,
  and declaring one it never had is a misstatement the date checks exist to
  catch. The preceding-exercise dates are not reported when it is absent, and
  the DAT 26 checks that compare against it only run once one is declared.
- Stop warning about the page count: the taxonomy has no datapoint for it.

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
