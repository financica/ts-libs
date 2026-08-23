import type {
	XbrlContext,
	XbrlDimensionMember,
	XbrlFact,
	XbrlFootnoteLink,
	XbrlInstance,
	XbrlInstanceInput,
	XbrlItem,
	XbrlLinkbaseRef,
	XbrlQName,
	XbrlSchemaRef,
	XbrlSerializeOptions,
	XbrlUnit,
} from "./types.js";
import { NS_LINK, NS_XBRLI, NS_XSI } from "./namespaces.js";

// ── Namespaces ────────────────────────────────────────────────────────

const NS_XLINK = "http://www.w3.org/1999/xlink";
const NS_XBRLDI = "http://xbrl.org/2006/xbrldi";

/** Prefixes we fall back to when a namespace has none. */
const CONVENTIONAL_PREFIXES: Record<string, string> = {
	[NS_XBRLI]: "xbrli",
	[NS_LINK]: "link",
	[NS_XLINK]: "xlink",
	[NS_XSI]: "xsi",
	[NS_XBRLDI]: "xbrldi",
};

// ── Public API ────────────────────────────────────────────────────────

/**
 * Assemble a typed XBRL instance document from its parts.
 *
 * Normalises contexts and units into id-keyed records, fills in the namespace
 * declarations implied by the QNames actually used, and rejects documents that
 * could not be serialised into a well-formed instance: duplicate context or
 * unit ids, facts referring to a context or unit that is not there, numeric
 * items carrying both `decimals` and `precision`.
 *
 * @throws {Error} if the document is not internally consistent.
 */
export function buildXbrlInstance(input: XbrlInstanceInput): XbrlInstance {
	const contexts = indexById(input.contexts, "context");
	const units = indexById(input.units ?? [], "unit");
	const facts = input.facts ?? [];

	for (const item of eachItem(facts)) {
		if (!(item.contextRef in contexts)) {
			throw new Error(
				`fact ${item.name.localName} refers to unknown context "${item.contextRef}"`,
			);
		}
		if (item.unitRef !== undefined && !(item.unitRef in units)) {
			throw new Error(
				`fact ${item.name.localName} refers to unknown unit "${item.unitRef}"`,
			);
		}
		if (item.decimals !== undefined && item.precision !== undefined) {
			throw new Error(
				`fact ${item.name.localName} carries both decimals and precision`,
			);
		}
	}

	const instance: XbrlInstance = {
		namespaces: {},
		schemaRefs: input.schemaRefs,
		linkbaseRefs: input.linkbaseRefs ?? [],
		roleRefs: input.roleRefs ?? [],
		arcroleRefs: input.arcroleRefs ?? [],
		contexts,
		units,
		facts,
		footnoteLinks: input.footnoteLinks ?? [],
	};
	instance.namespaces = resolveNamespaces(instance, input.namespaces);
	return normalizeQNames(instance);
}

/**
 * Rewrite every QName to carry the prefix it will actually be written with.
 *
 * Callers may leave `prefix` off, or set one that collides with another
 * namespace, and the serialiser resolves that. Pinning the resolved prefix
 * onto the document keeps `parseXbrl(serializeXbrl(doc))` equal to `doc`
 * rather than merely equivalent to it.
 */
function normalizeQNames(doc: XbrlInstance): XbrlInstance {
	const prefixes = prefixLookup(doc.namespaces);
	const fix = (qname: XbrlQName): XbrlQName => {
		const prefix = prefixes.get(qname.namespace);
		return prefix
			? { namespace: qname.namespace, localName: qname.localName, prefix }
			: { namespace: qname.namespace, localName: qname.localName };
	};
	const xbrldi = prefixes.get(NS_XBRLDI) ?? "xbrldi";
	const fixMember = (member: XbrlDimensionMember): XbrlDimensionMember => {
		if (member.dimension && (member.member || member.typedElement)) {
			const kind = member.member ? "explicitMember" : "typedMember";
			return {
				...member,
				dimension: fix(member.dimension),
				member: member.member ? fix(member.member) : undefined,
				typedElement: member.typedElement
					? fix(member.typedElement)
					: undefined,
				elementName: xbrldi ? `${xbrldi}:${kind}` : kind,
			};
		}
		return member;
	};
	const fixContext = (context: XbrlContext): XbrlContext => ({
		...context,
		entity: context.entity.segment
			? { ...context.entity, segment: context.entity.segment.map(fixMember) }
			: context.entity,
		scenario: context.scenario?.map(fixMember),
	});
	const fixUnit = (unit: XbrlUnit): XbrlUnit =>
		unit.divide
			? {
					id: unit.id,
					divide: {
						numerator: unit.divide.numerator.map(fix),
						denominator: unit.divide.denominator.map(fix),
					},
				}
			: unit.measures
				? { id: unit.id, measures: unit.measures.map(fix) }
				: unit;
	const fixFact = (fact: XbrlFact): XbrlFact =>
		fact.type === "tuple"
			? { ...fact, name: fix(fact.name), children: fact.children.map(fixFact) }
			: { ...fact, name: fix(fact.name) };

	return {
		...doc,
		contexts: mapValues(doc.contexts, fixContext),
		units: mapValues(doc.units, fixUnit),
		facts: doc.facts.map(fixFact),
	};
}

function mapValues<T>(
	record: Record<string, T>,
	fn: (value: T) => T,
): Record<string, T> {
	const result: Record<string, T> = {};
	for (const [key, value] of Object.entries(record)) result[key] = fn(value);
	return result;
}

/**
 * Serialise an instance document to XBRL 2.1 XML.
 *
 * Output is deterministic: the same document always produces the same bytes,
 * with contexts, units and facts written in the order they appear in the
 * document. Filers regenerate and diff their filings, so stability matters
 * more than any particular ordering.
 */
export function serializeXbrl(
	doc: XbrlInstance,
	options: XbrlSerializeOptions = {},
): string {
	const indent = options.indent ?? "\t";
	const declaration = options.xmlDeclaration ?? true;

	const namespaces = resolveNamespaces(doc, doc.namespaces);
	const prefixes = prefixLookup(namespaces);
	const out: string[] = [];

	if (declaration) out.push(`<?xml version="1.0" encoding="UTF-8"?>`);

	const rootName = qnameToString(
		{ namespace: NS_XBRLI, localName: "xbrl" },
		prefixes,
	);
	const rootAttrs = Object.entries(namespaces)
		.sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a < b ? -1 : 1))
		.map(([prefix, uri]) =>
			prefix === ""
				? `xmlns="${escapeAttr(uri)}"`
				: `xmlns:${prefix}="${escapeAttr(uri)}"`,
		);
	if (options.lang) rootAttrs.push(`xml:lang="${escapeAttr(options.lang)}"`);

	out.push(`<${rootName} ${rootAttrs.join(" ")}>`);

	const write = (depth: number, line: string) =>
		out.push(indent.repeat(depth) + line);

	for (const ref of doc.schemaRefs) write(1, xlinkRef("schemaRef", ref, prefixes));
	for (const ref of doc.linkbaseRefs)
		write(1, xlinkRef("linkbaseRef", ref, prefixes));
	for (const ref of doc.roleRefs) {
		write(1, roleRef("roleRef", "roleURI", ref.roleURI, ref.href, prefixes));
	}
	for (const ref of doc.arcroleRefs) {
		write(
			1,
			roleRef("arcroleRef", "arcroleURI", ref.arcroleURI, ref.href, prefixes),
		);
	}

	for (const context of Object.values(doc.contexts)) {
		writeContext(out, context, prefixes, indent, 1);
	}
	for (const unit of Object.values(doc.units)) {
		writeUnit(out, unit, prefixes, indent, 1);
	}
	for (const fact of doc.facts) {
		writeFact(out, fact, prefixes, indent, 1);
	}
	for (const footnoteLink of doc.footnoteLinks) {
		writeFootnoteLink(out, footnoteLink, prefixes, indent, 1);
	}

	out.push(`</${rootName}>`);
	return out.join("\n") + "\n";
}

// ── Namespace resolution ──────────────────────────────────────────────

/**
 * Every prefix the document needs, starting from the declarations it already
 * carries and adding one for each namespace used by a QName that has none.
 */
function resolveNamespaces(
	doc: XbrlInstance,
	declared: Record<string, string> | undefined,
): Record<string, string> {
	const namespaces: Record<string, string> = { ...declared };
	const used = new Set<string>([NS_XBRLI]);

	if (
		doc.schemaRefs.length > 0 ||
		doc.linkbaseRefs.length > 0 ||
		doc.roleRefs.length > 0
	) {
		used.add(NS_LINK).add(NS_XLINK);
	}
	if (doc.arcroleRefs.length > 0 || doc.footnoteLinks.length > 0) {
		used.add(NS_LINK).add(NS_XLINK);
	}

	for (const context of Object.values(doc.contexts)) {
		for (const member of [
			...(context.scenario ?? []),
			...(context.entity.segment ?? []),
		]) {
			used.add(NS_XBRLDI);
			if (member.dimension) used.add(member.dimension.namespace);
			if (member.member) used.add(member.member.namespace);
			if (member.typedElement) used.add(member.typedElement.namespace);
		}
	}
	for (const unit of Object.values(doc.units)) {
		for (const measure of unitMeasures(unit)) used.add(measure.namespace);
	}
	for (const fact of eachFact(doc.facts)) {
		used.add(fact.name.namespace);
		if (fact.type === "item" && fact.isNil) used.add(NS_XSI);
	}

	const taken = new Set(Object.keys(namespaces));
	const byUri = new Map(
		Object.entries(namespaces).map(([prefix, uri]) => [uri, prefix]),
	);

	for (const uri of used) {
		if (!uri || byUri.has(uri)) continue;
		const preferred = CONVENTIONAL_PREFIXES[uri] ?? preferredPrefix(uri, doc);
		let prefix = preferred;
		let n = 2;
		while (taken.has(prefix)) prefix = `${preferred}${n++}`;
		namespaces[prefix] = uri;
		taken.add(prefix);
		byUri.set(uri, prefix);
	}
	return namespaces;
}

/** The prefix this namespace was written with in the document, if any. */
function preferredPrefix(uri: string, doc: XbrlInstance): string {
	for (const fact of eachFact(doc.facts)) {
		if (fact.name.namespace === uri && fact.name.prefix) return fact.name.prefix;
	}
	for (const context of Object.values(doc.contexts)) {
		for (const member of [
			...(context.scenario ?? []),
			...(context.entity.segment ?? []),
		]) {
			for (const qname of [
				member.dimension,
				member.member,
				member.typedElement,
			]) {
				if (qname?.namespace === uri && qname.prefix) return qname.prefix;
			}
		}
	}
	for (const unit of Object.values(doc.units)) {
		for (const measure of unitMeasures(unit)) {
			if (measure.namespace === uri && measure.prefix) return measure.prefix;
		}
	}
	return "ns";
}

/** Namespace URI to prefix, for writing QNames. */
function prefixLookup(namespaces: Record<string, string>): Map<string, string> {
	const lookup = new Map<string, string>();
	for (const [prefix, uri] of Object.entries(namespaces)) {
		// A later non-empty prefix should not displace the default namespace.
		if (!lookup.has(uri) || lookup.get(uri) === "") lookup.set(uri, prefix);
	}
	return lookup;
}

function qnameToString(qname: XbrlQName, prefixes: Map<string, string>): string {
	const prefix = prefixes.get(qname.namespace);
	return prefix ? `${prefix}:${qname.localName}` : qname.localName;
}

/** Name of an element in the XBRL instance namespace, e.g. `xbrli:context`. */
function xbrli(localName: string, prefixes: Map<string, string>): string {
	return qnameToString({ namespace: NS_XBRLI, localName }, prefixes);
}

/** Name of an element in the link namespace, e.g. `link:schemaRef`. */
function linkEl(localName: string, prefixes: Map<string, string>): string {
	return qnameToString({ namespace: NS_LINK, localName }, prefixes);
}

/** Name of an attribute in the xlink namespace, e.g. `xlink:href`. */
function xlink(localName: string, prefixes: Map<string, string>): string {
	const prefix = prefixes.get(NS_XLINK) ?? "xlink";
	return `${prefix || "xlink"}:${localName}`;
}

// ── Element writers ───────────────────────────────────────────────────

function xlinkRef(
	name: string,
	ref: XbrlSchemaRef | XbrlLinkbaseRef,
	prefixes: Map<string, string>,
): string {
	const attrs = [
		`${xlink("type", prefixes)}="simple"`,
		`${xlink("href", prefixes)}="${escapeAttr(ref.href)}"`,
	];
	if (ref.role) attrs.push(`${xlink("role", prefixes)}="${escapeAttr(ref.role)}"`);
	if (ref.arcrole)
		attrs.push(`${xlink("arcrole", prefixes)}="${escapeAttr(ref.arcrole)}"`);
	return `<${linkEl(name, prefixes)} ${attrs.join(" ")}/>`;
}

function roleRef(
	name: string,
	uriAttr: string,
	uri: string,
	href: string,
	prefixes: Map<string, string>,
): string {
	const attrs = [
		`${uriAttr}="${escapeAttr(uri)}"`,
		`${xlink("type", prefixes)}="simple"`,
		`${xlink("href", prefixes)}="${escapeAttr(href)}"`,
	];
	return `<${linkEl(name, prefixes)} ${attrs.join(" ")}/>`;
}

function writeContext(
	out: string[],
	context: XbrlContext,
	prefixes: Map<string, string>,
	indent: string,
	depth: number,
): void {
	const pad = indent.repeat(depth);
	out.push(`${pad}<${xbrli("context", prefixes)} id="${escapeAttr(context.id)}">`);

	out.push(`${pad}${indent}<${xbrli("entity", prefixes)}>`);
	out.push(
		`${pad}${indent}${indent}<${xbrli("identifier", prefixes)} scheme="${escapeAttr(
			context.entity.scheme,
		)}">${escapeText(context.entity.value)}</${xbrli("identifier", prefixes)}>`,
	);
	if (context.entity.segment?.length) {
		writeDimensionMembers(
			out,
			"segment",
			context.entity.segment,
			prefixes,
			indent,
			depth + 2,
		);
	}
	out.push(`${pad}${indent}</${xbrli("entity", prefixes)}>`);

	out.push(`${pad}${indent}<${xbrli("period", prefixes)}>`);
	const periodPad = pad + indent + indent;
	if (context.period.type === "instant") {
		out.push(
			`${periodPad}<${xbrli("instant", prefixes)}>${escapeText(
				context.period.instant,
			)}</${xbrli("instant", prefixes)}>`,
		);
	} else if (context.period.type === "duration") {
		out.push(
			`${periodPad}<${xbrli("startDate", prefixes)}>${escapeText(
				context.period.startDate,
			)}</${xbrli("startDate", prefixes)}>`,
		);
		out.push(
			`${periodPad}<${xbrli("endDate", prefixes)}>${escapeText(
				context.period.endDate,
			)}</${xbrli("endDate", prefixes)}>`,
		);
	} else {
		out.push(`${periodPad}<${xbrli("forever", prefixes)}/>`);
	}
	out.push(`${pad}${indent}</${xbrli("period", prefixes)}>`);

	if (context.scenario?.length) {
		writeDimensionMembers(
			out,
			"scenario",
			context.scenario,
			prefixes,
			indent,
			depth + 1,
		);
	}

	out.push(`${pad}</${xbrli("context", prefixes)}>`);
}

function writeDimensionMembers(
	out: string[],
	container: "segment" | "scenario",
	members: XbrlDimensionMember[],
	prefixes: Map<string, string>,
	indent: string,
	depth: number,
): void {
	const pad = indent.repeat(depth);
	out.push(`${pad}<${xbrli(container, prefixes)}>`);
	const xbrldi = prefixes.get(NS_XBRLDI) ?? "xbrldi";
	const qualify = (name: string) => (xbrldi ? `${xbrldi}:${name}` : name);

	for (const member of members) {
		if (member.dimension && member.member) {
			out.push(
				`${pad}${indent}<${qualify("explicitMember")} dimension="${escapeAttr(
					qnameToString(member.dimension, prefixes),
				)}">${escapeText(qnameToString(member.member, prefixes))}</${qualify(
					"explicitMember",
				)}>`,
			);
		} else if (member.dimension && member.typedElement) {
			const valueName = qnameToString(member.typedElement, prefixes);
			out.push(
				`${pad}${indent}<${qualify("typedMember")} dimension="${escapeAttr(
					qnameToString(member.dimension, prefixes),
				)}"><${valueName}>${escapeText(
					member.typedValue ?? "",
				)}</${valueName}></${qualify("typedMember")}>`,
			);
		} else if (member.elementName) {
			const text = member.textContent ?? "";
			out.push(
				text
					? `${pad}${indent}<${member.elementName}>${escapeText(text)}</${member.elementName}>`
					: `${pad}${indent}<${member.elementName}/>`,
			);
		}
	}
	out.push(`${pad}</${xbrli(container, prefixes)}>`);
}

function writeUnit(
	out: string[],
	unit: XbrlUnit,
	prefixes: Map<string, string>,
	indent: string,
	depth: number,
): void {
	const pad = indent.repeat(depth);
	out.push(`${pad}<${xbrli("unit", prefixes)} id="${escapeAttr(unit.id)}">`);
	const measure = (qname: XbrlQName, at: string) =>
		`${at}<${xbrli("measure", prefixes)}>${escapeText(
			qnameToString(qname, prefixes),
		)}</${xbrli("measure", prefixes)}>`;

	if (unit.divide) {
		out.push(`${pad}${indent}<${xbrli("divide", prefixes)}>`);
		out.push(`${pad}${indent}${indent}<${xbrli("unitNumerator", prefixes)}>`);
		for (const m of unit.divide.numerator)
			out.push(measure(m, pad + indent.repeat(3)));
		out.push(`${pad}${indent}${indent}</${xbrli("unitNumerator", prefixes)}>`);
		out.push(`${pad}${indent}${indent}<${xbrli("unitDenominator", prefixes)}>`);
		for (const m of unit.divide.denominator)
			out.push(measure(m, pad + indent.repeat(3)));
		out.push(`${pad}${indent}${indent}</${xbrli("unitDenominator", prefixes)}>`);
		out.push(`${pad}${indent}</${xbrli("divide", prefixes)}>`);
	} else {
		for (const m of unit.measures ?? []) out.push(measure(m, pad + indent));
	}
	out.push(`${pad}</${xbrli("unit", prefixes)}>`);
}

function writeFact(
	out: string[],
	fact: XbrlFact,
	prefixes: Map<string, string>,
	indent: string,
	depth: number,
): void {
	const pad = indent.repeat(depth);
	const name = qnameToString(fact.name, prefixes);

	if (fact.type === "tuple") {
		const attrs = fact.id ? ` id="${escapeAttr(fact.id)}"` : "";
		if (fact.children.length === 0) {
			out.push(`${pad}<${name}${attrs}/>`);
			return;
		}
		out.push(`${pad}<${name}${attrs}>`);
		for (const child of fact.children)
			writeFact(out, child, prefixes, indent, depth + 1);
		out.push(`${pad}</${name}>`);
		return;
	}

	out.push(`${pad}${itemElement(fact, name, prefixes)}`);
}

function itemElement(
	item: XbrlItem,
	name: string,
	prefixes: Map<string, string>,
): string {
	const attrs = [`contextRef="${escapeAttr(item.contextRef)}"`];
	if (item.id) attrs.push(`id="${escapeAttr(item.id)}"`);
	if (item.unitRef) attrs.push(`unitRef="${escapeAttr(item.unitRef)}"`);
	if (item.decimals !== undefined) attrs.push(`decimals="${item.decimals}"`);
	if (item.precision !== undefined) attrs.push(`precision="${item.precision}"`);
	if (item.isNil) {
		const xsi = prefixes.get(NS_XSI) ?? "xsi";
		attrs.push(`${xsi}:nil="true"`);
		return `<${name} ${attrs.join(" ")}/>`;
	}
	return `<${name} ${attrs.join(" ")}>${escapeText(item.value ?? "")}</${name}>`;
}

function writeFootnoteLink(
	out: string[],
	footnoteLink: XbrlFootnoteLink,
	prefixes: Map<string, string>,
	indent: string,
	depth: number,
): void {
	const pad = indent.repeat(depth);
	const name = linkEl("footnoteLink", prefixes);
	out.push(
		`${pad}<${name} ${xlink("type", prefixes)}="extended" ${xlink(
			"role",
			prefixes,
		)}="${escapeAttr(footnoteLink.role)}">`,
	);
	for (const loc of footnoteLink.locators) {
		out.push(
			`${pad}${indent}<${linkEl("loc", prefixes)} ${xlink(
				"type",
				prefixes,
			)}="locator" ${xlink("href", prefixes)}="${escapeAttr(loc.href)}" ${xlink(
				"label",
				prefixes,
			)}="${escapeAttr(loc.label)}"/>`,
		);
	}
	for (const note of footnoteLink.footnotes) {
		const lang = note.lang ? ` xml:lang="${escapeAttr(note.lang)}"` : "";
		out.push(
			`${pad}${indent}<${linkEl("footnote", prefixes)} ${xlink(
				"type",
				prefixes,
			)}="resource" ${xlink("label", prefixes)}="${escapeAttr(note.label)}" ${xlink(
				"role",
				prefixes,
			)}="${escapeAttr(note.role)}"${lang}>${escapeText(note.content)}</${linkEl(
				"footnote",
				prefixes,
			)}>`,
		);
	}
	for (const arc of footnoteLink.arcs) {
		const order = arc.order !== undefined ? ` order="${arc.order}"` : "";
		out.push(
			`${pad}${indent}<${linkEl("footnoteArc", prefixes)} ${xlink(
				"type",
				prefixes,
			)}="arc" ${xlink("arcrole", prefixes)}="${escapeAttr(arc.arcrole)}" ${xlink(
				"from",
				prefixes,
			)}="${escapeAttr(arc.from)}" ${xlink("to", prefixes)}="${escapeAttr(
				arc.to,
			)}"${order}/>`,
		);
	}
	out.push(`${pad}</${name}>`);
}

// ── Helpers ───────────────────────────────────────────────────────────

function indexById<T extends { id: string }>(
	values: T[] | Record<string, T>,
	kind: string,
): Record<string, T> {
	const list = Array.isArray(values) ? values : Object.values(values);
	const result: Record<string, T> = {};
	for (const value of list) {
		if (value.id in result) throw new Error(`duplicate ${kind} id "${value.id}"`);
		result[value.id] = value;
	}
	return result;
}

/** Every fact in the document, including those nested inside tuples. */
function* eachFact(facts: XbrlFact[]): Generator<XbrlFact> {
	for (const fact of facts) {
		yield fact;
		if (fact.type === "tuple") yield* eachFact(fact.children);
	}
}

function* eachItem(facts: XbrlFact[]): Generator<XbrlItem> {
	for (const fact of eachFact(facts)) {
		if (fact.type === "item") yield fact;
	}
}

function unitMeasures(unit: XbrlUnit): XbrlQName[] {
	if (unit.divide) return [...unit.divide.numerator, ...unit.divide.denominator];
	return unit.measures ?? [];
}

function escapeText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
	return escapeText(value).replace(/"/g, "&quot;");
}
