/**
 * Shapes of the data generated from an NBB/CBSO taxonomy package.
 *
 * Nothing in here is hand-maintained. `scripts/generate-taxonomy.ts` reads a
 * taxonomy release and emits one module per model under `src/taxonomies/`,
 * conforming to these types, which is what keeps a new January release a data
 * change rather than a code change.
 */

import type { NbbFilingPart, NbbModel } from "./types.js";

/**
 * A reportable figure, identified the way the taxonomy identifies it: a metric
 * element plus the dimension members that pin it down.
 *
 * The NBB taxonomy is dimensional. There is no element per rubric — there are
 * fifteen metrics in the whole dictionary — so a datapoint is a metric such as
 * `am1` combined with an aspect set such as `dim:bas = bas:m25`.
 */
export interface Datapoint {
	/** Section of the model this datapoint belongs to, e.g. `"s.03.01.0.cdefhi"`. */
	section: string;
	/** Metric element's local name, e.g. `"am1"`. */
	metric: string;
	/**
	 * Namespace prefix of the metric element, where it is not `met`.
	 *
	 * Most metrics come from the one dictionary, but a value drawn from a
	 * closed list is reported as an element of that list's own namespace: the
	 * legal form is `lgf-enum:list2` carrying `lgf:m610`, and the postal code
	 * `pcd-enum:list1` carrying `pcd:m5000`. Writing those under `met` produces
	 * an element the entry point never declares.
	 */
	metricPrefix?: string;
	/**
	 * Explicit dimension members, keyed by dimension QName, excluding the
	 * period dimension. For example `{ "dim:bas": "bas:m25" }`.
	 */
	dimensions: Readonly<Record<string, string>>;
	/**
	 * Typed dimensions this datapoint is repeated over, as QNames. These are
	 * the open axes: a line number, or one block per director.
	 */
	openDimensions?: readonly string[];
	/** Statutory rubric code, where the model prints one. */
	code?: string;
	/** English label, for datapoints the model addresses by name rather than code. */
	label?: string;
	/** Period dimension member for the current exercise, e.g. `"prd:m1"`. */
	currentPeriod?: string;
	/** Period dimension member for the preceding exercise, e.g. `"prd:m2"`. */
	previousPeriod?: string;
}

/** Which body of rules a check comes from, and therefore how badly it bites. */
export type CheckKind =
	/**
	 * Statutory arithmetic and logical checks published in the Moniteur belge.
	 * Failing one is disqualifying: the filing is refused.
	 */
	| "legal"
	/**
	 * Complementary checks from Annex 1.2 of the filing protocol. Failing one
	 * is not disqualifying.
	 */
	| "nbb"
	/** Social balance sheet checks, from Annex 1.3. */
	| "social-balance";

/**
 * A fact variable in a check.
 *
 * A variable binds to every fact matching its filter, which is not always a
 * single datapoint: the statutory check that total assets equal total
 * liabilities is written as `$am1 eq $am12` where `$am12` is filtered only on
 * `dim:bas = bas:m25`, and so matches both sides of the balance sheet. The
 * filter is therefore kept as-is and matched at validation time, with
 * {@link codes} recording which rubrics it can reach.
 */
export interface CheckVariable {
	/** Variable name as it appears in the test expression, without the `$`. */
	name: string;
	metric: string;
	/** Dimension members the variable is filtered on, excluding the period. */
	dimensions: Readonly<Record<string, string>>;
	/** Rubric codes this filter can match, for reporting. */
	codes: readonly string[];
	/** Period member the variable is filtered to, where it is filtered at all. */
	period?: string;
	/** Value used when the fact is absent. The taxonomy almost always says 0. */
	fallback?: string;
}

/**
 * One assignment of rubric codes to a check's variables, keyed by variable
 * name. Every code named here exists in the model.
 */
export type CheckBinding = Readonly<Record<string, string>>;

/** Whether a datapoint's metric carries a monetary amount (`am…`). */
export function isMonetary(metric: string): boolean {
	return metric.startsWith("am");
}

/** One published check, as a test expression over named fact variables. */
export interface Check {
	/** The NBB's own identifier, e.g. `"va_03.01.0_0014"`. */
	id: string;
	kind: CheckKind;
	/** Section the check belongs to, e.g. `"03.01.0"`. */
	section: string;
	/**
	 * The test, in the taxonomy's own notation: `$am1 eq $am12 + $am13`.
	 * Supports `+ - eq ne lt le gt ge and or` and parentheses.
	 */
	test: string;
	variables: readonly CheckVariable[];
	/**
	 * The equation in rubric codes, as the taxonomy states it in the message it
	 * shows when the check fails: `9904 = 9903 + 780 - 680 - 67/77`. Absent for
	 * the checks whose message is prose rather than an equation.
	 */
	equation?: string;
	/**
	 * Every assignment of rubrics to variables the taxonomy's implicit
	 * filtering permits. The check has to hold for each of them.
	 *
	 * A check is rarely one equation over one set of rubrics. The statement of
	 * fixed assets writes `$am1 eq $am12 + $am13 - $am14 + $am2` once and means
	 * it once per asset class, so the variables are *correlated*: `8199` pairs
	 * with `8169` and `8179`, never with `8029`. Taking each variable's rubrics
	 * independently and testing the product would compare one class's total
	 * against another's movements and report a failure on a filing that is
	 * correct.
	 *
	 * Absent when the enumeration exceeded {@link MAX_CHECK_BINDINGS}, in which
	 * case the check is reported as skipped rather than guessed at.
	 */
	bindings?: readonly CheckBinding[];
	/**
	 * Variables read at the preceding exercise's column even though nothing in
	 * their own filter says so.
	 *
	 * A check can compare last year's figures with each other — `22/27P =
	 * 8199P + 8259P - 8329P` — and where the model does not number that column
	 * as a rubric of its own, only the stated equation says which year is
	 * meant.
	 */
	precedingColumn?: readonly string[];
	/**
	 * Set when the check is about a section this model does not have — the
	 * social balance sheet, for a micro filing — so none of the rubrics it
	 * names exist here. Such a check is not evaluated, and that is the
	 * taxonomy's doing rather than a gap in ours.
	 */
	notApplicable?: boolean;
}

/**
 * Cap on the assignments recorded for one check.
 *
 * A handful of checks in the taxonomy are written loosely enough to reach most
 * of the model. Enumerating those is neither useful nor cheap, and a check we
 * cannot pin down is reported as skipped rather than approximated.
 */
export const MAX_CHECK_BINDINGS = 512;

/** Everything generated for one model and part of one taxonomy release. */
export interface TaxonomyModule {
	/** Taxonomy version, e.g. `"26.0.15"`. */
	version: string;
	/** Model identifier, e.g. `"m87"`. */
	model: NbbModel;
	/** Filing part: `"f"`, `"a"` or `"o"`. */
	part: NbbFilingPart;
	/** Entry-point schema URI to write as the instance's `schemaRef`. */
	schemaRef: string;
	/** Namespace URI for the metric dictionary. */
	metricNamespace: string;
	/** Prefix-to-URI mappings for every namespace the instance needs. */
	namespaces: Readonly<Record<string, string>>;
	datapoints: readonly Datapoint[];
	checks: readonly Check[];
}

/**
 * One member of a closed list the filer picks from, such as a business court.
 *
 * The taxonomy publishes these as a domain of `nonnum:domainItemType` elements
 * with a label per language, which is what makes them presentable: a filer
 * chooses "Bruxelles, francophone", not `m31`.
 */
export interface EnumerationMember {
	/**
	 * Member code as it appears in the QName, `m` prefix included — `m31`, or
	 * `mBE` for a country. This is the value a caller passes.
	 */
	code: string;
	/** Label per language, keyed by the taxonomy's own `xml:lang`. */
	labels: Readonly<Record<string, string>>;
}

/**
 * The closed lists a filer chooses a member of, keyed by dictionary prefix
 * (`cct` for the business court, `lgf` for the legal form).
 *
 * Only the lists a human picks from are generated. `pcd` and `cty` are
 * enumerations too, but an address determines them, so carrying 1,146 postal
 * codes would be weight with no reader.
 */
export type Enumerations = Readonly<Record<string, readonly EnumerationMember[]>>;
