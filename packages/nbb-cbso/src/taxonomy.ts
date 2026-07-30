/**
 * Shapes of the data generated from an NBB/CBSO taxonomy package.
 *
 * Nothing in here is hand-maintained. `scripts/generate-taxonomy.ts` reads a
 * taxonomy release and emits modules under `src/generated/` that conform to
 * these types, which is what keeps a new January release a data change rather
 * than a code change.
 */

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
	/** Metric element's local name, e.g. `"am1"`. Namespace is the metric dictionary. */
	metric: string;
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
}

/** Everything generated for one model and part of one taxonomy release. */
export interface TaxonomyModule {
	/** Taxonomy version, e.g. `"26.0.15"`. */
	version: string;
	/** Model identifier, e.g. `"m87"`. */
	model: string;
	/** Filing part: `"f"`, `"a"` or `"o"`. */
	part: string;
	/** Entry-point schema URI to write as the instance's `schemaRef`. */
	schemaRef: string;
	/** Namespace URI for the metric dictionary. */
	metricNamespace: string;
	/** Prefix-to-URI mappings for every namespace the instance needs. */
	namespaces: Readonly<Record<string, string>>;
	datapoints: readonly Datapoint[];
	checks: readonly Check[];
}
