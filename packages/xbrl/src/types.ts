/** Top-level result of parsing an XBRL 2.1 instance document. */
export interface XbrlInstance {
	/** Namespace prefix-to-URI mappings declared on the root element. */
	namespaces: Record<string, string>;

	/** Taxonomy schema references (link:schemaRef). At least one required. */
	schemaRefs: XbrlSchemaRef[];

	/** Linkbase references (link:linkbaseRef). */
	linkbaseRefs: XbrlLinkbaseRef[];

	/** Role references (link:roleRef). */
	roleRefs: XbrlRoleRef[];

	/** Arc role references (link:arcroleRef). */
	arcroleRefs: XbrlArcroleRef[];

	/** Contexts, keyed by their id attribute. */
	contexts: Record<string, XbrlContext>;

	/** Units, keyed by their id attribute. */
	units: Record<string, XbrlUnit>;

	/** Top-level facts (items and tuples). */
	facts: XbrlFact[];

	/** Footnote links. */
	footnoteLinks: XbrlFootnoteLink[];
}

/** A simple XLink reference to a taxonomy schema. */
export interface XbrlSchemaRef {
	/** URI of the taxonomy schema (xlink:href). */
	href: string;
	/** XLink role, if specified. */
	role?: string;
	/** XLink arcrole, if specified. */
	arcrole?: string;
}

/** A simple XLink reference to a linkbase document. */
export interface XbrlLinkbaseRef {
	/** URI of the linkbase (xlink:href). */
	href: string;
	/** XLink role indicating the linkbase type. */
	role?: string;
	/** XLink arcrole. */
	arcrole?: string;
}

/** A reference to a custom role type definition. */
export interface XbrlRoleRef {
	/** The role URI being defined. */
	roleURI: string;
	/** URI of the schema defining this role (xlink:href). */
	href: string;
}

/** A reference to a custom arc role type definition. */
export interface XbrlArcroleRef {
	/** The arc role URI being defined. */
	arcroleURI: string;
	/** URI of the schema defining this arc role (xlink:href). */
	href: string;
}

/** A resolved QName with namespace URI and local name. */
export interface XbrlQName {
	/** Namespace URI. */
	namespace: string;
	/** Local name. */
	localName: string;
	/** Original prefixed form as it appeared in the document. */
	prefix?: string;
}

/** Reporting context: who reported, for what period, under what conditions. */
export interface XbrlContext {
	/** Context id. */
	id: string;

	/** Entity identification. */
	entity: XbrlEntity;

	/** Reporting period. */
	period: XbrlPeriod;

	/** Scenario dimensions (arbitrary XML from non-XBRL namespaces). */
	scenario?: XbrlDimensionMember[];
}

/** Entity identifier within a context. */
export interface XbrlEntity {
	/** Identifier scheme URI (e.g. "http://www.fgov.be"). */
	scheme: string;
	/** Identifier value (e.g. "BE0410682657"). */
	value: string;
	/** Segment dimensions (arbitrary XML from non-XBRL namespaces). */
	segment?: XbrlDimensionMember[];
}

/** A dimension member from a segment or scenario. */
export interface XbrlDimensionMember {
	/** Dimension QName, if this is an explicit or typed dimension. */
	dimension?: XbrlQName;
	/** Member QName for explicit dimensions. */
	member?: XbrlQName;
	/** Typed value for typed dimensions. */
	typedValue?: string;
	/** Raw element name if not a recognized dimension. */
	elementName?: string;
	/** Raw text content. */
	textContent?: string;
}

/** Reporting period: instant, duration, or forever. */
export type XbrlPeriod =
	| { type: "instant"; instant: string }
	| { type: "duration"; startDate: string; endDate: string }
	| { type: "forever" };

/** Measurement unit for numeric facts. */
export interface XbrlUnit {
	/** Unit id. */
	id: string;
	/**
	 * Simple unit: product of measures. Present when not a divide.
	 * Multiple measures imply multiplication.
	 */
	measures?: XbrlQName[];
	/** Complex unit: numerator/denominator (divide). */
	divide?: {
		numerator: XbrlQName[];
		denominator: XbrlQName[];
	};
}

/**
 * A fact in an XBRL instance document.
 * Items have a contextRef; tuples contain child facts.
 */
export type XbrlFact = XbrlItem | XbrlTuple;

/** A simple fact (item) with a value and context reference. */
export interface XbrlItem {
	/** Discriminator. */
	type: "item";
	/** Concept name as a resolved QName. */
	name: XbrlQName;
	/** Optional id attribute. */
	id?: string;
	/** Reference to a context id. Always present for items. */
	contextRef: string;
	/** Reference to a unit id. Present for numeric items. */
	unitRef?: string;
	/**
	 * Precision: number of significant digits, or "INF" for exact.
	 * Mutually exclusive with decimals.
	 */
	precision?: number | "INF";
	/**
	 * Decimals: number of reliable decimal places, or "INF" for exact.
	 * Mutually exclusive with precision.
	 */
	decimals?: number | "INF";
	/** Text value, or null if xsi:nil="true". */
	value: string | null;
	/** True if the item is nil (xsi:nil="true"). */
	isNil: boolean;
}

/** A compound fact (tuple) containing child facts. */
export interface XbrlTuple {
	/** Discriminator. */
	type: "tuple";
	/** Tuple element name as a resolved QName. */
	name: XbrlQName;
	/** Optional id attribute. */
	id?: string;
	/** Child facts (items and/or nested tuples). */
	children: XbrlFact[];
}

/** An extended link containing footnote associations. */
export interface XbrlFootnoteLink {
	/** Link role URI. */
	role: string;
	/** Locators pointing to facts. */
	locators: XbrlFootnoteLocator[];
	/** Footnote resources. */
	footnotes: XbrlFootnoteResource[];
	/** Arcs connecting locators to footnotes. */
	arcs: XbrlFootnoteArc[];
}

/** A locator in a footnote link, pointing to a fact. */
export interface XbrlFootnoteLocator {
	/** XLink label for arc referencing. */
	label: string;
	/** URI reference to a fact (e.g. "#factId"). */
	href: string;
}

/** A footnote resource containing explanatory text. */
export interface XbrlFootnoteResource {
	/** XLink label for arc referencing. */
	label: string;
	/** Footnote role URI. */
	role: string;
	/** Language (xml:lang). */
	lang?: string;
	/** Footnote text content (may contain XHTML). */
	content: string;
}

/** An arc connecting a locator to a footnote resource. */
export interface XbrlFootnoteArc {
	/** XLink label of the source (locator). */
	from: string;
	/** XLink label of the target (footnote resource). */
	to: string;
	/** Arc role URI. */
	arcrole: string;
	/** Ordering hint. */
	order?: number;
}
