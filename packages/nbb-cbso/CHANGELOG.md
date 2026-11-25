# Changelog

## 0.10.1

### Fixed

- **Checks honour their preconditions.** The formula linkbases gate many assertions with a precondition (`$am1 != 0` is "if 9061 is completed"), which the generator dropped, so the check ran on every filing. `ca_08.00.0_0001` warned on any company with no debts, about a rubric it never filed; Arelle, like the NBB, does not run it there. `Check.preconditions` now carries them, and `validateNbbFiling` runs a check only where they hold. 312 preconditions across the four models, most in the social balance.
- The expression evaluator reads the preconditions' `exists($v)`, `not(...)`, `true()` and `false()`. `evaluateExpression` takes the variables bound to a reported fact as an optional third argument for `exists`.



Breaking: `Director` and `AccountantDeclaration` are reshaped (neither produced a fact before, so no filing changes), and a filing without `entity.statutesDate` now fails validation.

### Added

- **Sections 2.1 and 2.2 are filed.** `directors` takes natural and legal persons, their permanent representatives, the statutory auditors (`role: "auditor"`) and every mandate with its function and dates; `accountantDeclaration` takes the management body's answer and any number of practitioners, each with their missions (A–D). Rows are keyed by the typed name dimensions the taxonomy declares, mandates and missions by `dim:open`. Checked fact for fact, typed members included, against the people of an accepted m87 filing.
- **`disclosures`: the non-rubric parts of 6.3, 6.4, 6.6, 7.1 and 7.2.** Litigation, commitments to affiliates and other off-balance lines (text and amount per line), the pension descriptions, the terms of receivables from directors, the other annex information, participations with their rights and the investee's last accounts in its own currency, and unlimited-liability entities with their publication code.
- **The model's completeness rules the input can break are checked**, under the NBB's own identifiers: the deposit date of the last deed (`oa_01.00.2_0008`), a 12-month exercise (`oa_01.00.1_0011`, a warning), and in sections 2.1, 2.2, 7.1 and 7.2 the address, membership-number, enterprise-number, legal-form, rights-held and last-accounts rules. A row with nothing but its mandates or missions is reported once, as the NBB does, rather than field by field. Verified in CI against Arelle, which reports exactly the same rules on a filing broken once per row.
- `disclosureCapabilities(module)`, `MANDATE_FUNCTIONS`, `isEnterpriseNumber`, and `fct`, `nmc` and `pub` in `ENUMERATIONS`.
- `Finding.field`: a disclosure that cannot be filed is reported at its input path, not thrown and not dropped.
- `Address.city`, and foreign addresses for people and entities (the postal code as text).
- `test:arelle` and the `nbb-cbso (Arelle)` workflow: Arelle validation of rendered filings against the NBB taxonomy package.
- The generator adds the cells of typed hypercubes that the rendering table never lays out (mandate dates, a legal person's mandates, an expert firm's missions, the 6.3 and 7.1 rows), and keeps a text cell its cube declares without a period (the 6.3 pension descriptions).

### Changed

- **A filing without `entity.statutesDate` now fails validation** (`oa_01.00.2_0008`). The NBB requires the deposit date of the last deed in every model; it was silently left out before.

### Fixed

- Share counts (`int1`, `int2`) carry a `shares` unit and counts, decimals and percentages a `pure` one. They carried none, which is invalid XBRL for any numeric item.
- A missing identification cell throws instead of leaving the field out.

## 0.9.2

### Fixed

- **Datapoints are only the cells the definition linkbase declares.** The generator crossed every row of a rendering table with every column, which produced cells no hypercube allows: a text column against an amount row, a preceding-exercise column on a fixed-asset movement. Each cell is now checked against the section's closed hypercubes (dimension defaults included) and dropped, or loses the column, when none declares it. The same class of error as 0.9.1, at the source: rubric `9220` resolved to a `bas:m87 gtd:m3` cell the NBB would reject, and now resolves to `bas:m94 spec:m73`. No rubric code is lost from any model; every statutory check keeps its bindings, and the three m87 filings generated in production re-render fact for fact.
- `Datapoint.openDimensions` lists the typed dimensions of the datapoint's own hypercube instead of the union over its section, so a cell says which typed members a fact in it must carry.
- A preceding-exercise figure for a rubric with only a current column (`9072`, `9500`, …) throws `NbbBuildError` instead of being filed in the current column.

### Changed

- Social-balance checks that were bound to undeclared cells, and the m05 checks `ca_04.00.0_0005` / `0006` (which bound `70/76A` to `9145`), are now reported as skipped or not applicable rather than evaluated against the wrong rubric.

## 0.9.1

### Fixed

- **The preceding exercise's dates are reported in the `prd:m2` column of the exercise cells**, as accepted filings do, instead of under `dcl:m1`. That combination is a cross-product artifact of the rendering table, not a cell the definition linkbase allows: the NBB rejected every filing with a `previousExercise` as "not dimensionally valid" (`xbrldie:PrimaryItemDimensionallyInvalidError`). Applies to every model and both releases.

## 0.9.0

### Added

- **`@financica/nbb-cbso/ws`: a client for the CBSO's Authentic Data Query web service.** `NbbCbsoClient` lists a legal entity's published filings (`listDeposits`, optionally for the year an exercise closes) and fetches a filing's reference, PDF, XBRL or JSON. A 404 is mapped to `[]` or `null`, since the service uses it both for "no such entity" and for "no such representation"; other failures throw the new `NbbCbsoApiError` (`status`, `details`).

## 0.8.0

Breaking: taxonomy modules are published per release, at
`@financica/nbb-cbso/taxonomies/<release>/<model>-<part>`
(`taxonomies/26.0/m87-f`). The filing application validates a deposit against
the release valid for its closing date and refuses any other, so a late filing
for a 2024 year cannot be built against 26.0.

### Added

- Release **25.0.11** (`taxonomies/25.0/*`) for fiscal years closing in 2024,
  beside 26.0.15. The models carry the same datapoints and checks; only the
  version and schema reference differ.

### Changed

- The generator generates the release its version argument names rather than
  the newest framework in the package, writes it to its own folder, and
  leaves the enumerations to the newest release.

## 0.7.0

### Added

- **Every datapoint carries its label in the four filing languages.** `Datapoint.labels` is keyed by the taxonomy's `xml:lang` (`de`, `en`, `fr`, `nl`); `label` stays the English entry. A finding can now be presented in the language the accounts are filed in rather than in English.
- `NbbCbsoError` and `NbbBuildError` are exported.

### Changed

- **`NbbCbsoError` is the base class of every error the package throws.** `ExpressionError` now extends it and sets `name`; `buildNbbFiling` throws `NbbBuildError` (also an `NbbCbsoError`) instead of a plain `Error` for an unknown rubric code or a contradicted figure.

### Fixed

- `scripts/generate-taxonomy.ts` ran again: a rename in the lint cleanup left one call to the old `key` helper.

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
