import { XMLParser } from "fast-xml-parser";
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
 * Parse an XBRL 2.1 instance document.
 * Returns `null` if the input cannot be parsed or is not a valid XBRL instance.
 */
export function parseXbrl(xml: string): XbrlInstance | null {
	try {
		const parsed = xmlParser.parse(xml) as unknown[];
		if (!Array.isArray(parsed) || parsed.length === 0) return null;

		// Find the xbrl root element (may be prefixed)
		const root = findXbrlRoot(parsed);
		if (!root) return null;

		const { element: rootEl, attrs: rootAttrs } = root;

		// Build namespace map from root attributes
		const namespaces = buildNamespaceMap(rootAttrs);

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
						if (ctx) contexts[ctx.id] = ctx;
						break;
					}
					case "unit": {
						const unit = parseUnit(child, tag, namespaces);
						if (unit) units[unit.id] = unit;
						break;
					}
				}
			} else {
				// Everything else is a potential fact
				const fact = parseFact(child, tag, namespaces);
				if (fact) facts.push(fact);
			}
		}

		if (schemaRefs.length === 0 && facts.length === 0) return null;

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
	} catch {
		return null;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────

type ParsedNode = Record<string, unknown>;

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
		return {
			namespace: namespaces[""] ?? "",
			localName: prefixed,
		};
	}
	const prefix = prefixed.substring(0, colon);
	const localName = prefixed.substring(colon + 1);
	return {
		namespace: namespaces[prefix] ?? "",
		localName,
		prefix,
	};
}

// ── Root finding ──────────────────────────────────────────────────────

function findXbrlRoot(
	parsed: unknown[],
): { element: unknown[]; attrs: Record<string, string> } | null {
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
				return { element: children, attrs };
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
	return {
		href: attrs["xlink:href"] ?? "",
		role: attrs["xlink:role"] || undefined,
		arcrole: attrs["xlink:arcrole"] || undefined,
	};
}

function parseUriRef<K extends "roleURI" | "arcroleURI">(
	node: unknown,
	tag: string,
	uriAttr: K,
): Record<K, string> & { href: string } {
	const attrs = getAttrs(node, tag);
	return {
		[uriAttr]: attrs[uriAttr] ?? "",
		href: attrs["xlink:href"] ?? "",
	} as Record<K, string> & { href: string };
}

// ── Context parsing ───────────────────────────────────────────────────

function parseContext(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlContext | null {
	const attrs = getAttrs(node, tag);
	const id = attrs["id"];
	if (!id) return null;

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

	if (!entity || !period) return null;
	return { id, entity, period, scenario };
}

function parseEntity(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlEntity | undefined {
	const children = getChildren(node, tag);
	let scheme = "";
	let value = "";
	let segment: XbrlDimensionMember[] | undefined;

	for (const child of children) {
		const childTag = getTagName(child);
		if (!childTag) continue;
		const resolved = resolveQName(childTag, namespaces);

		if (resolved.namespace === NS_XBRLI) {
			if (resolved.localName === "identifier") {
				const idAttrs = getAttrs(child, childTag);
				scheme = idAttrs["scheme"] ?? "";
				value = getTextContent(child, childTag);
			} else if (resolved.localName === "segment") {
				segment = parseDimensionMembers(child, childTag, namespaces);
			}
		}
	}

	if (!scheme && !value) return undefined;
	return { scheme, value, segment };
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
			members.push({
				dimension: dimName ? resolveQName(dimName, namespaces) : undefined,
				member: memberText ? resolveQName(memberText, namespaces) : undefined,
				elementName: childTag,
			});
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
			members.push({
				dimension: dimName ? resolveQName(dimName, namespaces) : undefined,
				typedValue: text || undefined,
				typedElement: valueTag ? resolveQName(valueTag, namespaces) : undefined,
				elementName: childTag,
			});
		} else {
			// Unknown extension element -- preserve as-is
			members.push({
				elementName: childTag,
				textContent: getTextContent(child, childTag) || undefined,
			});
		}
	}

	return members;
}

// ── Unit parsing ──────────────────────────────────────────────────────

function parseUnit(
	node: unknown,
	tag: string,
	namespaces: Record<string, string>,
): XbrlUnit | null {
	const attrs = getAttrs(node, tag);
	const id = attrs["id"];
	if (!id) return null;

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
	if (attrs["contextRef"]) {
		return parseItem(node, tag, attrs, namespaces);
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

	return {
		type: "item",
		name,
		id: attrs["id"] || undefined,
		contextRef: attrs["contextRef"] ?? "",
		unitRef: attrs["unitRef"] || undefined,
		precision,
		decimals,
		value,
		isNil,
	};
}

function parseTuple(
	tag: string,
	attrs: Record<string, string>,
	children: unknown[],
	namespaces: Record<string, string>,
): XbrlTuple {
	const name = resolveQName(tag, namespaces);
	const childFacts = extractFacts(children, namespaces);

	return {
		type: "tuple",
		name,
		id: attrs["id"] || undefined,
		children: childFacts,
	};
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
	const role = attrs["xlink:role"] ?? "";
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
						label: locAttrs["xlink:label"] ?? "",
						href: locAttrs["xlink:href"] ?? "",
					});
					break;
				}
				case "footnote": {
					const fnAttrs = getAttrs(child, childTag);
					footnotes.push({
						label: fnAttrs["xlink:label"] ?? "",
						role: fnAttrs["xlink:role"] ?? "",
						lang: fnAttrs["xml:lang"] || undefined,
						content: getTextContent(child, childTag),
					});
					break;
				}
				case "footnoteArc": {
					const arcAttrs = getAttrs(child, childTag);
					const order = arcAttrs["order"]
						? Number(arcAttrs["order"])
						: undefined;
					arcs.push({
						from: arcAttrs["xlink:from"] ?? "",
						to: arcAttrs["xlink:to"] ?? "",
						arcrole: arcAttrs["xlink:arcrole"] ?? "",
						order:
							order !== undefined && Number.isFinite(order)
								? order
								: undefined,
					});
					break;
				}
			}
		}
	}

	return { role, locators, footnotes, arcs };
}
