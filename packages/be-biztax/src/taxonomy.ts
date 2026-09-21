/**
 * The shape of a generated taxonomy module.
 *
 * FPS Finance publishes the be-tax taxonomy once per assessment year, and one
 * entry point per kind of return. A module is one entry point of one release,
 * read out of the published schemas and linkbases by
 * `scripts/generate-taxonomy.ts`: nothing in it is hand-written, so a new
 * April release is a re-run.
 */

/** Which return an entry point declares. */
export type ReturnType = "rcorp" | "nrcorp" | "rle";

/** The languages the taxonomy labels its concepts in. */
export type LabelLanguage = "nl" | "fr" | "de" | "en";

/** A concept's name with its namespace prefix, like `tax-inc:Prepayments`. */
export type QualifiedName = string;

/** One slot in a tuple's content model, in schema order. */
export interface TupleChild {
	/** The concept that fills the slot, or the head of a code list. */
	name: QualifiedName;
	minOccurs: number;
	/** `null` for unbounded. */
	maxOccurs: number | null;
}

/** A fact that carries a value. */
export interface ItemConcept {
	kind: "item";
	name: QualifiedName;
	periodType: "instant" | "duration";
	/** Key into {@link TaxonomyModule.dataTypes}. */
	dataType: string;
	/**
	 * The hypercubes the concept may be reported in, as indexes into
	 * {@link TaxonomyModule.cubes}. Absent when the taxonomy places the concept
	 * in none, which means it is reported without dimensions.
	 */
	cubes?: readonly number[];
	labels: Partial<Record<LabelLanguage, string>>;
}

/** A tuple: an ordered group of child facts, with no value of its own. */
export interface TupleConcept {
	kind: "tuple";
	name: QualifiedName;
	/** `sequence` fills the slots in order; `choice` fills exactly one. */
	model: "sequence" | "choice";
	children: readonly TupleChild[];
	labels: Partial<Record<LabelLanguage, string>>;
}

export type Concept = ItemConcept | TupleConcept;

/** The lexical rules of a datatype, as far as a builder can check them. */
export interface DataType {
	base:
		| "monetary"
		| "decimal"
		| "integer"
		| "string"
		| "token"
		| "boolean"
		| "date"
		| "base64";
	minInclusive?: number;
	maxInclusive?: number;
	fractionDigits?: number;
	totalDigits?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}

/** An axis a fact can be qualified along. */
export interface Dimension {
	name: QualifiedName;
	/**
	 * For a typed dimension, the element that carries the member's value and the
	 * rules that value obeys. The filer names the members.
	 */
	typed?: { element: QualifiedName; type: DataType };
	/** For an explicit dimension, the members the taxonomy defines. */
	members?: readonly QualifiedName[];
}

/**
 * A closed hypercube: the exact set of dimensions a fact in it carries. An
 * empty list is the cube of the non-dimensional part of a mixed section.
 */
export interface Cube {
	role: string;
	dimensions: readonly QualifiedName[];
}

/**
 * A closed list of codes, reported as an element per code: the legal form
 * `014` is the element `pfs-vl:XCode_LegalFormCode_014`, whose value is the code.
 */
export interface CodeList {
	/** The abstract head a tuple slot names. */
	head: QualifiedName;
	/** Code to the element that reports it. */
	codes: Readonly<Record<string, QualifiedName>>;
}

export interface TaxonomyModule {
	returnType: ReturnType;
	assessmentYear: number;
	/** Release date, which every namespace of the release ends in. */
	release: string;
	/** Package version the module was generated from, like `1.0.2`. */
	version: string;
	/** What `link:schemaRef` points at. */
	schemaRef: string;
	/** Prefix to namespace URI, for every schema the entry point reaches. */
	namespaces: Readonly<Record<string, string>>;
	/** Every reportable concept of the entry point, by qualified name. */
	concepts: Readonly<Record<QualifiedName, Concept>>;
	dataTypes: Readonly<Record<string, DataType>>;
	dimensions: Readonly<Record<QualifiedName, Dimension>>;
	cubes: readonly Cube[];
	codeLists: Readonly<Record<QualifiedName, CodeList>>;
	/**
	 * The constants the release's validation rules are written against: the
	 * window the period end falls in (`AssessmentYearEndFirst`, `…Last`), rates
	 * and thresholds. Only the ones given as a literal; values are kept as text.
	 */
	parameters: Readonly<Record<string, string>>;
}
