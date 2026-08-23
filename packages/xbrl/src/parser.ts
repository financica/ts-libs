import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
	XbrlInstance,
	XbrlSchemaRef,
	XbrlLinkbaseRef,
	XbrlRoleRef,
	XbrlArcroleRef,
	XbrlContext,
	XbrlEntity,
	XbrlPeriod,
	XbrlDimensionMember,
	XbrlUnit,
	XbrlFact,
	XbrlItem,
	XbrlTuple,
	XbrlQName,
	XbrlFootnoteLink,
	XbrlFootnoteLocator,
	XbrlFootnoteResource,
	XbrlFootnoteArc,
} from "./types.js";
import { NS_LINK, NS_XBRLI } from "./namespaces.js";

/** Namespace bound to the reserved `xml` prefix. */
const XML_NS = "http://www.w3.org/XML/1998/namespace";

// Prefixes used by fast-xml-parser
const ATTR = "@_";
const TEXT = "#text";

// ── XML parser config ─────────────────────────────────────────────────

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: ATTR,
	textNodeName: TEXT,
	parseTagValue: false,
	preserveOrder: true,
	allowBooleanAttributes: true,
	processEntities: true,
	trimValues: true,
});

// ── Public API ────────────────────────────────────────────────────────

/**
 * Thrown when the input is an XBRL instance but cannot be read: malformed
 * XML, an undeclared namespace prefix, or a mandatory element or attribute
 * (context `id`, `entity`, `period`, `link:schemaRef`, …) missing.
 */
export class XbrlParseError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = "XbrlParseError";
		if (options && "cause" in options) this.cause = options.cause;
	}
}

/**
 * Parse an XBRL 2.1 instance document.
 *
 * Returns `null` when the input is not an XBRL instance (no `xbrli:xbrl` root
 * element); throws {@link XbrlParseError} when it is one but is malformed or
 * lacks a mandatory element.
 */
export function parseXbrl(xml: string): XbrlInstance | null {
	const validation = XMLValidator.validate(xml);
	if (validation !== true)
		throw new XbrlParseError(`Malformed XML: ${validation.err.msg}`, {
			cause: validation.err,
		});
	const parsed: unknown = xmlParser.parse(xml);
	if (!Array.isArray(parsed) || parsed.length === 0) return null;

	// Find the xbrl root element (may be prefixed)
	const root = findXbrlRoot(parsed);
	if (!root) return null;

	const { element: rootEl, attrs: rootAttrs } = root;

	// Build namespace map from root attributes
	const namespaces = buildNamespaceMap(rootAttrs);
	if (resolveQName(root.tag, namespaces).namespace !== NS_XBRLI) return null;
	{
		// Parse all children
		const schemaRefs: XbrlSchemaRef[] = [];
		const linkbaseRefs: XbrlLinkbaseRef[] = [];
		const roleRefs: XbrlRoleRef[] = [];
		const arcroleRefs: XbrlArcroleRef[] = [];
		const contexts: Record<string, XbrlContext> = {};
		const units: Record<string, XbrlUnit> = {};
		const facts: XbrlFact[] = [];
		const footnoteLinks: XbrlFootnoteLink[] = [];

		for (const child of rootEl) {
			const tag = getTagName(child);
			if (!tag) continue;

			const resolved = resolveQName(tag, namespaces);

			if (resolved.namespace === NS_LINK) {
				switch (resolved.localName) {
					case "schemaRef":
						schemaRefs.push(parseSimpleLinkRef(child, tag));
						break;
					case "linkbaseRef":
						linkbaseRefs.push(parseSimpleLinkRef(child, tag));
						break;
					case "roleRef":
						roleRefs.push(parseUriRef(child, tag, "roleURI"));
						break;
					case "arcroleRef":
						arcroleRefs.push(parseUriRef(child, tag, "arcroleURI"));
						break;
					case "footnoteLink":
						footnoteLinks.push(parseFootnoteLink(child, tag, namespaces));
						break;
				}
			} else if (resolved.namespace === NS_XBRLI) {
				switch (resolved.localName) {
					case "context": {
						const ctx = parseContext(child, tag, namespaces);
						contexts[ctx.id] = ctx;
						break;
					}
					case "unit": {
						const unit = parseUnit(child, tag, namespaces);
						units[unit.id] = unit;
						break;
					}
				}
			} else {
				// Everything else is a potential fact
				const fact = parseFact(child, tag, namespaces);
				if (fact) facts.push(fact);
			}
		}

		if (schemaRefs.length === 0)
			throw new XbrlParseError("Missing mandatory element link:schemaRef");

		return {
			namespaces,
			schemaRefs,
			linkbaseRefs,
			roleRefs,
			arcroleRefs,
			contexts,
			units,
			facts,
			footnoteLinks,
		};
	}
}

// ── Helpers ───────────────────────────────────────────────────────────

type ParsedNode = Record<string, unknown>;

/** Drop `undefined`-valued keys so an absent field is an absent key. */
function compact<T extends object>(obj: T): T {
	for (const key of Object.keys(obj)) {
		if ((obj as Record<string, unknown>)[key] === undefined)
			delete (obj as Record<string, unknown>)[key];
	}
	return obj;
}

/** A mandatory attribute: throws when absent. */
function requireAttr(attrs: Record<string, string>, name: string, on: string): string {
	const v = attrs[name];
	if (v === undefined)
		throw new XbrlParseError(`Missing mandatory attribute ${name} on ${on}`);
	return v;
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
	if (val === undefined || val === null) return [];
	return Array.isArray(val) ? val : [val];
}

function getTagName(node: unknown): string | undefined {
	if (typeof node !== "object" || node === null) return undefined;
	const keys = Object.keys(node);
	return keys.find((k) => !k.startsWith(":") && !k.startsWith("@"));
}

function getAttrs(node: unknown, tag: string): Record<string, string> {
	const result: Record<string, string> = {};
	const n = node as ParsedNode;
	const attrArr = asArray(n[`:@`] as ParsedNode | ParsedNode[]);
	for (const attrObj of attrArr) {
		for (const [k, v] of Object.entries(attrObj)) {
			if (k.startsWith(ATTR)) {
				result[k.slice(ATTR.length)] = String(v);
			}
		}
	}
	// Also check tag-level attrs
	const tagVal = n[tag];
	// preserveOrder mode: an array holds children, not attrs
	if (!Array.isArray(tagVal) && typeof tagVal === "object" && tagVal !== null) {
		for (const [k, v] of Object.entries(tagVal as Record<string, unknown>)) {
			if (k.startsWith(ATTR)) {
				result[k.slice(ATTR.length)] = String(v);
			}
		}
	}
	return result;
}

function getChildren(node: unknown, tag: string): unknown[] {
	const n = node as ParsedNode;
	const val = n[tag];
	if (Array.isArray(val)) return val;
	return [];
}

function getTextContent(node: unknown, tag: string): string {
	const children = getChildren(node, tag);
	for (const child of children) {
		if (typeof child === "object" && child !== null) {
			const c = child as ParsedNode;
			if (TEXT in c) return String(c[TEXT]);
		}
	}
	// Direct text
	const n = node as ParsedNode;
	const val = n[tag];
	if (typeof val === "string") return val;
	if (typeof val === "number") return String(val);
	return "";
}

// ── Namespace handling ────────────────────────────────────────────────

function buildNamespaceMap(attrs: Record<string, string>): Record<string, string> {
	const map: Record<string, string> = {};
	for (const [key, value] of Object.entries(attrs)) {
		if (key === "xmlns") {
			map[""] = value;
		} else if (key.startsWith("xmlns:")) {
			map[key.slice(6)] = value;
		}
	}
	return map;
}

function resolveQName(prefixed: string, namespaces: Record<string, string>): XbrlQName {
	const colon = prefixed.indexOf(":");
	if (colon === -1) {
		// No default namespace declared means the null namespace.
		return {
			namespace: namespaces[""] ?? "",
			localName: prefixed,
		};
	}
	const prefix = prefixed.substring(0, colon);
	const localName = prefixed.substring(colon + 1);
	const namespace = prefix === "xml" ? XML_NS : namespaces[prefix];
	if (namespace === undefined)
		throw new XbrlParseError(
			`Undeclared namespace prefix "${prefix}" in ${prefixed}`,
		);
	return { namespace, localName, prefix };
}

// ── Root finding ──────────────────────────────────────────────────────

function findXbrlRoot(
	parsed: unknown[],
): { tag: string; element: unknown[]; attrs: Record<string, string> } | null {
	for (const node of parsed) {
		if (typeof node !== "object" || node === null) continue;
		const n = node as ParsedNode;
		for (const key of Object.keys(n)) {
			if (key.startsWith(":") || key.startsWith("?")) continue;
			// Check if this is the xbrl root (tag ends with :xbrl or is just "xbrl")
			const localName = key.includes(":") ? key.split(":")[1] : key;
			if (localName === "xbrl") {
				const children = Array.isArray(n[key]) ? (n[key] as unknown[]) : [];
				const attrs = getAttrs(node, key);
				return { tag: key, element: children, attrs };
			}
		}
	}
	return null;
}

// ── Schema/Linkbase refs ──────────────────────────────────────────────

/** schemaRef and linkbaseRef carry the same simple-link attributes. */
function parseSimpleLinkRef(
	node: unknown,
	tag: string,
): XbrlSchemaRef | XbrlLinkbaseRef {
	const attrs = getAttrs(node, tag);
	return compact({
		href: requireAttr(attrs, "xlink:href", tag),
		role: attrs["xlink:role"] || undefined,
		arcrole: attrs["xlink:arcrole"] || undefined,
	});
}

function parseUriRef<K extends "roleURI" | "arcroleURI">(
	node: unknown,
	tag: string,
	uriAttr: K,
): Record<K, string> & { href: string } {
	const attrs = getAttrs(node, tag);
	return {
		[uriAttr]: requireAttr(attrs, uriAttr, tag),
		href: requireAttr(attrs, "xlink:href", tag),
	} as Record<K, string> & { href: string };
}

// ── Context parsing ───────────────────────────────────────────────────

function parseContext(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlContext {
	const attrs = getAttrs(node, tag);
	const id = requireAttr(attrs, "id", tag);

	const children = getChildren(node, tag);
	let entity: XbrlEntity | undefined;
	let period: XbrlPeriod | undefined;
	let scenario: XbrlDimensionMember[] | undefined;

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			switch (resolved.localName) {
				case "entity":
					entity = parseEntity(child, childTag, namespaces);
					break;
				case "period":
					period = parsePeriod(child, childTag, namespaces);
					break;
				case "scenario":
					scenario = parseDimensionMembers(child, childTag, namespaces);
					break;
			}
		}
	}

	if (!entity) throw new XbrlParseError(`Context "${id}" has no entity`);
	if (!period) throw new XbrlParseError(`Context "${id}" has no valid period`);
	return compact({ id, entity, period, scenario });
}

function parseEntity(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlEntity | undefined {
	const children = getChildren(node, tag);
	let scheme: string | undefined;
	let value: string | undefined;
	let segment: XbrlDimensionMember[] | undefined;

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			if (resolved.localName === "identifier") {
				const idAttrs = getAttrs(child, childTag);
				scheme = requireAttr(idAttrs, "scheme", childTag);
				value = getTextContent(child, childTag);
			} else if (resolved.localName === "segment") {
				segment = parseDimensionMembers(child, childTag, namespaces);
			}
		}
	}

	if (scheme === undefined || value === undefined)
		throw new XbrlParseError(`${tag} has no identifier`);
	return compact({ scheme, value, segment });
}

function parsePeriod(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlPeriod | undefined {
	const children = getChildren(node, tag);
	let startDate: string | undefined;
	let endDate: string | undefined;
	let instant: string | undefined;
	let forever = false;

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			switch (resolved.localName) {
				case "startDate":
					startDate = getTextContent(child, childTag);
					break;
				case "endDate":
					endDate = getTextContent(child, childTag);
					break;
				case "instant":
					instant = getTextContent(child, childTag);
					break;
				case "forever":
					forever = true;
					break;
			}
		}
	}

	if (instant) return { type: "instant", instant };
	if (startDate && endDate) return { type: "duration", startDate, endDate };
	if (forever) return { type: "forever" };
	return undefined;
}

function parseDimensionMembers(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlDimensionMember[] {
	const children = getChildren(node, tag);
	const members: XbrlDimensionMember[] = [];

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		// XBRL Dimensions: xbrldi:explicitMember and xbrldi:typedMember
		if (resolved.localName === "explicitMember") {
			const dimAttrs = getAttrs(child, childTag);
			const dimName = dimAttrs["dimension"];
			const memberText = getTextContent(child, childTag);
			members.push(
				compact({
					dimension: dimName ? resolveQName(dimName, namespaces) : undefined,
					member: memberText
						? resolveQName(memberText, namespaces)
						: undefined,
					elementName: childTag,
				}),
			);
		} else if (resolved.localName === "typedMember") {
			const dimAttrs = getAttrs(child, childTag);
			const dimName = dimAttrs["dimension"];
			// A typed dimension's value lives in a child element declared by
			// its typed domain, so read that rather than this element's text.
			const valueEl = getChildren(child, childTag).find((c) => getTagName(c));
			const valueTag = valueEl ? getTagName(valueEl) : undefined;
			const text = valueTag
				? getTextContent(valueEl, valueTag)
				: getTextContent(child, childTag);
			members.push(
				compact({
					dimension: dimName ? resolveQName(dimName, namespaces) : undefined,
					typedValue: text || undefined,
					typedElement: valueTag
						? resolveQName(valueTag, namespaces)
						: undefined,
					elementName: childTag,
				}),
			);
		} else {
			// Unknown extension element -- preserve as-is
			members.push(
				compact({
					elementName: childTag,
					textContent: getTextContent(child, childTag) || undefined,
				}),
			);
		}
	}

	return members;
}

// ── Unit parsing ──────────────────────────────────────────────────────

function parseUnit(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlUnit {
	const attrs = getAttrs(node, tag);
	const id = requireAttr(attrs, "id", tag);

	const children = getChildren(node, tag);
	const measures: XbrlQName[] = [];
	let divide: { numerator: XbrlQName[]; denominator: XbrlQName[] } | undefined;

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			if (resolved.localName === "measure") {
				const text = getTextContent(child, childTag);
				if (text) measures.push(resolveQName(text, namespaces));
			} else if (resolved.localName === "divide") {
				divide = parseDivide(child, childTag, namespaces);
			}
		}
	}

	if (divide) return { id, divide };
	if (measures.length > 0) return { id, measures };
	return { id };
}

function parseDivide(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): { numerator: XbrlQName[]; denominator: XbrlQName[] } {
	const children = getChildren(node, tag);
	const numerator: XbrlQName[] = [];
	const denominator: XbrlQName[] = [];

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			if (resolved.localName === "unitNumerator") {
				numerator.push(...parseMeasures(child, childTag, namespaces));
			} else if (resolved.localName === "unitDenominator") {
				denominator.push(...parseMeasures(child, childTag, namespaces));
			}
		}
	}

	return { numerator, denominator };
}

function parseMeasures(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlQName[] {
	const children = getChildren(node, tag);
	const measures: XbrlQName[] = [];

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI && resolved.localName === "measure") {
			const text = getTextContent(child, childTag);
			if (text) measures.push(resolveQName(text, namespaces));
		}
	}

	return measures;
}

// ── Fact parsing ──────────────────────────────────────────────────────

function parseFact(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlFact | null {
	const attrs = getAttrs(node, tag);

	// Items have contextRef, tuples do not
	const contextRef = attrs["contextRef"];
	if (contextRef) {
		return parseItem(node, tag, attrs, contextRef, namespaces);
	}

	// Check if this looks like a tuple (has children with contextRef)
	const children = getChildren(node, tag);
	if (children.length > 0 && hasFacts(children)) {
		return parseTuple(tag, attrs, children, namespaces);
	}

	// If it has child elements, it might still be a tuple with nested tuples
	if (children.length > 0) {
		const tuple = parseTuple(tag, attrs, children, namespaces);
		if (tuple.children.length > 0) return tuple;
	}

	return null;
}

function parseItem(
	node: unknown,
	tag: string,
	attrs: Record<string, string>,
	contextRef: string,
	namespaces: Record<string, string>,
): XbrlItem {
	const name = resolveQName(tag, namespaces);
	const isNil = attrs["xsi:nil"] === "true";
	const value = isNil ? null : getTextContent(node, tag) || "";

	let precision: number | "INF" | undefined;
	let decimals: number | "INF" | undefined;

	if (attrs["precision"]) {
		precision = attrs["precision"] === "INF" ? "INF" : Number(attrs["precision"]);
		if (typeof precision === "number" && !Number.isFinite(precision)) {
			precision = undefined;
		}
	}

	if (attrs["decimals"]) {
		decimals = attrs["decimals"] === "INF" ? "INF" : Number(attrs["decimals"]);
		if (typeof decimals === "number" && !Number.isFinite(decimals)) {
			decimals = undefined;
		}
	}

	return compact({
		type: "item",
		name,
		id: attrs["id"] || undefined,
		contextRef,
		unitRef: attrs["unitRef"] || undefined,
		precision,
		decimals,
		value,
		isNil,
	});
}

function parseTuple(
	tag: string,
	attrs: Record<string, string>,
	children: unknown[],
	namespaces: Record<string, string>,
): XbrlTuple {
	const name = resolveQName(tag, namespaces);
	const childFacts = extractFacts(children, namespaces);

	return compact({
		type: "tuple",
		name,
		id: attrs["id"] || undefined,
		children: childFacts,
	});
}

function hasFacts(children: unknown[]): boolean {
	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;

		const attrs = getAttrs(child, childTag);
		if (attrs["contextRef"]) return true;

		// Check nested children recursively
		const grandChildren = getChildren(child, childTag);
		if (grandChildren.length > 0 && hasFacts(grandChildren)) {
			return true;
		}
	}
	return false;
}

function extractFacts(
	children: unknown[],
	namespaces: Record<string, string>,
): XbrlFact[] {
	const facts: XbrlFact[] = [];
	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;

		const resolved = resolveQName(childTag, namespaces);
		// Skip XBRL structural elements
		if (resolved.namespace === NS_XBRLI || resolved.namespace === NS_LINK) {
			continue;
		}

		const fact = parseFact(child, childTag, namespaces);
		if (fact) facts.push(fact);
	}
	return facts;
}

// ── Footnote link parsing ─────────────────────────────────────────────

function parseFootnoteLink(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlFootnoteLink {
	const attrs = getAttrs(node, tag);
	const role = requireAttr(attrs, "xlink:role", tag);
	const children = getChildren(node, tag);

	const locators: XbrlFootnoteLocator[] = [];
	const footnotes: XbrlFootnoteResource[] = [];
	const arcs: XbrlFootnoteArc[] = [];

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_LINK) {
			switch (resolved.localName) {
				case "loc": {
					const locAttrs = getAttrs(child, childTag);
					locators.push({
						label: requireAttr(locAttrs, "xlink:label", childTag),
						href: requireAttr(locAttrs, "xlink:href", childTag),
					});
					break;
				}
				case "footnote": {
					const fnAttrs = getAttrs(child, childTag);
					footnotes.push(
						compact({
							label: requireAttr(fnAttrs, "xlink:label", childTag),
							role: requireAttr(fnAttrs, "xlink:role", childTag),
							lang: fnAttrs["xml:lang"] || undefined,
							content: getTextContent(child, childTag),
						}),
					);
					break;
				}
				case "footnoteArc": {
					const arcAttrs = getAttrs(child, childTag);
					const order = arcAttrs["order"]
						? Number(arcAttrs["order"])
						: undefined;
					arcs.push(
						compact({
							from: requireAttr(arcAttrs, "xlink:from", childTag),
							to: requireAttr(arcAttrs, "xlink:to", childTag),
							arcrole: requireAttr(arcAttrs, "xlink:arcrole", childTag),
							order:
								order !== undefined && Number.isFinite(order)
									? order
									: undefined,
						}),
					);
					break;
				}
			}
		}
	}

	return { role, locators, footnotes, arcs };
}
