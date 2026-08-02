/**
 * Generates typed datapoint and check tables from an NBB/CBSO taxonomy release.
 *
 * The NBB taxonomy is dimensional: a figure is not an element but a metric
 * plus a set of dimension members, and the statutory rubric code that a filer
 * thinks in is a generic label hung off a rule node in the table linkbase. The
 * published arithmetic checks are likewise machine-readable, as XBRL formula
 * value assertions. All of that is read here and emitted as data, so that
 * neither the rubric map nor the check list is ever hand-written and a new
 * January release is a re-run rather than an edit.
 *
 * Usage:
 *   bun run scripts/generate-taxonomy.ts <taxonomy-root> <version> [model-part…]
 *
 * where <taxonomy-root> is an unpacked taxonomy package (the directory holding
 * `META-INF` and `www.nbb.be`), and each model-part is like `m87-f`. With no
 * model-part given, every entry point in the package is generated.
 *
 *   curl -O https://www.nbb.be/doc/ba/xbrl/taxo2026/nbb-cbso-26.0.15.zip
 *   unzip -q nbb-cbso-26.0.15.zip -d taxo
 *   bun run scripts/generate-taxonomy.ts taxo/nbb-cbso-26.0.15 26.0.15 m87-f
 */

import {
	readdirSync,
	readFileSync,
	mkdirSync,
	writeFileSync,
	existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type {
	Check,
	CheckBinding,
	CheckVariable,
	Datapoint,
	EnumerationMember,
	TaxonomyModule,
} from "../src/taxonomy.ts";
import { MAX_CHECK_BINDINGS } from "../src/taxonomy.ts";

// ── Constants ─────────────────────────────────────────────────────────

const RUBRIC_LABEL_ROLE = "http://www.nbb.be/fr/xbrl/rub";
const STANDARD_LABEL_ROLE = "http://www.xbrl.org/2008/role/label";
const ELEMENT_LABEL = "http://xbrl.org/arcrole/2008/element-label";
const VARIABLE_SET = "http://xbrl.org/arcrole/2008/variable-set";
const VARIABLE_FILTER = "http://xbrl.org/arcrole/2008/variable-filter";
const UNSATISFIED_MESSAGE =
	"http://xbrl.org/arcrole/2010/assertion-unsatisfied-message";

/** Which formula linkbase carries which body of rules. */
const CHECK_KINDS = {
	legal: "legal",
	nbb: "nbb",
	sb: "social-balance",
} as const;

// ── XML plumbing ──────────────────────────────────────────────────────

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	textNodeName: "#text",
	parseTagValue: false,
	parseAttributeValue: false,
	trimValues: true,
	isArray: (_name, _jpath, _isLeafNode, isAttribute) => !isAttribute,
});

type Node = Record<string, unknown>;

function attr(node: Node, name: string): string | undefined {
	const value = node[`@_${name}`];
	if (value === undefined) return undefined;
	return String(Array.isArray(value) ? value[0] : value);
}

function children(node: Node, name: string): Node[] {
	const value = node[name];
	return Array.isArray(value) ? (value as Node[]) : [];
}

/**
 * Child elements with the given local name, whatever prefix they carry.
 *
 * The linkbases are not consistent about prefixes — a locator is `link:loc` in
 * the formula files and bare `loc` in some label files — so matching on the
 * local name is the only thing that holds across the taxonomy.
 */
function byLocalName(node: Node, name: string): Node[] {
	return Object.keys(node)
		.filter(
			(key) => !key.startsWith("@_") && key !== "#text" && local(key) === name,
		)
		.flatMap((key) => children(node, key));
}

/**
 * Text content of an element.
 *
 * An element with nothing but text parses to a bare string rather than to an
 * object with a `#text` key, so both shapes have to be handled.
 */
function text(node: unknown): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.length > 0 ? text(node[0]) : "";
	if (typeof node === "object" && node !== null) {
		return text((node as Node)["#text"]);
	}
	return "";
}

/** Local name of a tag, dropping any prefix. */
function local(tag: string): string {
	const colon = tag.indexOf(":");
	return colon === -1 ? tag : tag.slice(colon + 1);
}

/** Namespace prefix of a tag, or `"met"` where it carries none. */
function prefixOf(tag: string): string {
	const colon = tag.indexOf(":");
	return colon === -1 ? "met" : tag.slice(0, colon);
}

/** Every descendant element, with its tag name. */
function* walk(node: Node, tag = ""): Generator<{ tag: string; node: Node }> {
	if (tag) yield { tag, node };
	for (const [key, value] of Object.entries(node)) {
		if (key.startsWith("@_") || key === "#text") continue;
		if (!Array.isArray(value)) continue;
		for (const child of value as Node[]) {
			if (typeof child === "object" && child !== null) yield* walk(child, key);
		}
	}
}

function readXml(path: string): Node {
	return parser.parse(readFileSync(path, "utf-8")) as Node;
}

// ── Table linkbase ────────────────────────────────────────────────────

interface RuleNode {
	/** xlink:label, which arcs refer to. */
	label: string;
	/** id attribute, which label locators refer to. */
	id?: string;
	abstract: boolean;
	concept?: string;
	dimensions: Record<string, string>;
}

interface Axis {
	axis: string;
	/** Leaf nodes, each carrying the aspects accumulated from its ancestors. */
	leaves: { node: RuleNode; dimensions: Record<string, string> }[];
	/** Typed dimensions introduced by aspect nodes on this axis. */
	openDimensions: string[];
}

/** Reads one section's table linkbase into its axes. */
function readTable(path: string): Axis[] {
	const doc = readXml(path);
	const links: Node[] = [];
	for (const { tag, node } of walk(doc)) {
		if (local(tag) === "link" && tag.startsWith("gen:")) links.push(node);
	}

	const axes: Axis[] = [];
	for (const link of links) {
		const nodes = new Map<string, RuleNode>();
		const aspectNodes = new Map<string, string>();

		for (const node of children(link, "table:ruleNode")) {
			const label = attr(node, "xlink:label");
			if (!label) continue;
			const dimensions: Record<string, string> = {};
			for (const dim of children(node, "formula:explicitDimension")) {
				const dimension = attr(dim, "dimension");
				const member = children(dim, "formula:member")
					.flatMap((m) => children(m, "formula:qname"))
					.map(text)[0];
				if (dimension && member) dimensions[dimension] = member;
			}
			const concept = children(node, "formula:concept")
				.flatMap((c) => children(c, "formula:qname"))
				.map(text)[0];
			nodes.set(label, {
				label,
				id: attr(node, "id"),
				abstract: attr(node, "abstract") === "true",
				concept,
				dimensions,
			});
		}
		for (const node of children(link, "table:aspectNode")) {
			const label = attr(node, "xlink:label");
			const dimension = children(node, "table:dimensionAspect").map(text)[0];
			if (label && dimension) aspectNodes.set(label, dimension);
		}

		// breakdown label -> axis, and the tree of nodes beneath each breakdown.
		const breakdownAxis = new Map<string, string>();
		for (const arc of children(link, "table:tableBreakdownArc")) {
			const to = attr(arc, "xlink:to");
			const axis = attr(arc, "axis");
			if (to && axis) breakdownAxis.set(to, axis);
		}
		const roots = new Map<string, string[]>();
		for (const arc of children(link, "table:breakdownTreeArc")) {
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			if (!from || !to) continue;
			roots.set(from, [...(roots.get(from) ?? []), to]);
		}
		const subtree = new Map<string, string[]>();
		for (const arc of children(link, "table:definitionNodeSubtreeArc")) {
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			if (!from || !to) continue;
			subtree.set(from, [...(subtree.get(from) ?? []), to]);
		}

		for (const [breakdown, axis] of breakdownAxis) {
			const leaves: Axis["leaves"] = [];
			const openDimensions: string[] = [];

			const visit = (
				label: string,
				inherited: Record<string, string>,
				inheritedConcept: string | undefined,
			) => {
				const open = aspectNodes.get(label);
				if (open) {
					if (!openDimensions.includes(open)) openDimensions.push(open);
					return;
				}
				const node = nodes.get(label);
				if (!node) return;
				const dimensions = { ...inherited, ...node.dimensions };
				// The metric is inherited exactly like the dimensions are. A
				// breakdown states it once on the line that introduces it and
				// leaves the detail beneath silent: `10/11` carries `met:am1`
				// and its children `110` and `111` carry none. Dropping those
				// for want of a metric loses every rubric a model aggregates,
				// which is most of them — and with them the statutory checks
				// that read the detail, since a variable that resolves to no
				// rubric cannot be evaluated.
				const concept = node.concept ?? inheritedConcept;
				const resolved = concept ? { ...node, concept } : node;
				const kids = subtree.get(label) ?? [];
				// A node with children contributes its aspects to them; only
				// the leaves are datapoints in their own right.
				if (kids.length > 0) {
					for (const kid of kids) visit(kid, dimensions, concept);
					if (node.abstract) return;
				}
				if (!node.abstract) leaves.push({ node: resolved, dimensions });
			};

			for (const label of roots.get(breakdown) ?? []) visit(label, {}, undefined);
			axes.push({ axis, leaves, openDimensions });
		}
	}
	return axes;
}

/** Reads a section's generic labels, keyed by the id they are attached to. */
function readLabels(path: string): Map<string, { rubric?: string; english?: string }> {
	const result = new Map<string, { rubric?: string; english?: string }>();
	if (!existsSync(path)) return result;
	const doc = readXml(path);

	for (const { tag, node: link } of walk(doc)) {
		if (local(tag) !== "link" || !tag.startsWith("gen:")) continue;

		// Locators point at "<file>#<id>"; arcs join their labels to resources.
		const locatorTarget = new Map<string, string>();
		for (const loc of children(link, "loc")) {
			const label = attr(loc, "xlink:label");
			const href = attr(loc, "xlink:href");
			if (!label || !href) continue;
			const hash = href.indexOf("#");
			if (hash !== -1) locatorTarget.set(label, href.slice(hash + 1));
		}
		const resources = new Map<
			string,
			{ role?: string; lang?: string; value: string }
		>();
		for (const label of children(link, "label:label")) {
			const key = attr(label, "xlink:label");
			if (!key) continue;
			resources.set(key, {
				role: attr(label, "xlink:role"),
				lang: attr(label, "xml:lang"),
				value: text(label),
			});
		}
		for (const arc of children(link, "gen:arc")) {
			if (attr(arc, "xlink:arcrole") !== ELEMENT_LABEL) continue;
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			if (!from || !to) continue;
			const target = locatorTarget.get(from);
			const resource = resources.get(to);
			if (!target || !resource) continue;
			const entry = result.get(target) ?? {};
			if (resource.role === RUBRIC_LABEL_ROLE) {
				entry.rubric = resource.value;
			} else if (
				resource.role === STANDARD_LABEL_ROLE &&
				resource.lang === "en"
			) {
				entry.english ??= resource.value;
			}
			result.set(target, entry);
		}
	}
	return result;
}

// ── Formula linkbases ─────────────────────────────────────────────────

interface RawCheck {
	id: string;
	test: string;
	variables: {
		name: string;
		metric?: string;
		dimensions: Record<string, string>;
		fallback?: string;
	}[];
}

/** Metric element names declared by the metric dictionary, longest first. */
function readMetrics(options: Options): string[] {
	const path = join(
		options.root,
		"www.nbb.be",
		"be",
		"fr",
		"cbso",
		"dict",
		"met",
		"met.xsd",
	);
	const xml = readFileSync(path, "utf-8");
	return [...xml.matchAll(/<xsd:element[^>]*\bname="([^"]+)"/g)]
		.map((match) => match[1]!)
		.sort((a, b) => b.length - a.length);
}

/**
 * The metric a variable reports on, derived from its name.
 *
 * Only one concept filter exists per extended link, shared by a handful of
 * variables; the rest carry their metric in their name, which is the metric
 * followed by a sequence number — `am12` is the second `am1` variable, `am22`
 * the second `am2`. Matching against the declared metrics longest-first keeps
 * `am12` from being read as a metric in its own right.
 */
function metricFromName(name: string, metrics: string[]): string | undefined {
	return metrics.find((metric) => name === metric || name.startsWith(metric));
}

/** Reads value assertions and the aspects each of their variables binds to. */
function readFormulas(path: string, metrics: string[]): RawCheck[] {
	if (!existsSync(path)) return [];
	const doc = readXml(path);
	const checks: RawCheck[] = [];

	for (const { tag, node: link } of walk(doc)) {
		if (local(tag) !== "link" || !tag.startsWith("gen:")) continue;

		const variables = new Map<
			string,
			{
				name?: string;
				fallback?: string;
				metric?: string;
				dimensions: Record<string, string>;
			}
		>();
		for (const node of children(link, "variable:factVariable")) {
			const label = attr(node, "xlink:label");
			if (!label) continue;
			variables.set(label, {
				fallback: attr(node, "fallbackValue"),
				dimensions: {},
			});
		}

		const conceptFilters = new Map<string, string>();
		for (const node of children(link, "cf:conceptName")) {
			const label = attr(node, "xlink:label");
			const qname = children(node, "cf:concept")
				.flatMap((c) => children(c, "cf:qname"))
				.map(text)[0];
			if (label && qname) conceptFilters.set(label, qname);
		}
		const dimensionFilters = new Map<
			string,
			{ dimension: string; member: string }
		>();
		for (const node of children(link, "df:explicitDimension")) {
			const label = attr(node, "xlink:label");
			const dimension = children(node, "df:dimension")
				.flatMap((d) => children(d, "df:qname"))
				.map(text)[0];
			const member = children(node, "df:member")
				.flatMap((m) => children(m, "df:qname"))
				.map(text)[0];
			if (label && dimension && member) {
				dimensionFilters.set(label, { dimension, member });
			}
		}

		for (const arc of children(link, "variable:variableFilterArc")) {
			if (attr(arc, "xlink:arcrole") !== VARIABLE_FILTER) continue;
			// A complemented filter excludes rather than selects; skip it.
			if (attr(arc, "complement") === "true") continue;
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			if (!from || !to) continue;
			const variable = variables.get(from);
			if (!variable) continue;
			const concept = conceptFilters.get(to);
			if (concept) variable.metric = concept;
			const dimension = dimensionFilters.get(to);
			if (dimension) variable.dimensions[dimension.dimension] = dimension.member;
		}

		const assertionVariables = new Map<string, string[]>();
		for (const arc of children(link, "variable:variableArc")) {
			if (attr(arc, "xlink:arcrole") !== VARIABLE_SET) continue;
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			const name = attr(arc, "name");
			if (!from || !to) continue;
			const variable = variables.get(to);
			if (variable && name) variable.name = name;
			assertionVariables.set(from, [...(assertionVariables.get(from) ?? []), to]);
		}

		for (const assertion of children(link, "va:valueAssertion")) {
			const id = attr(assertion, "id");
			const test = attr(assertion, "test");
			const label = attr(assertion, "xlink:label");
			if (!id || !test || !label) continue;
			const bound = (assertionVariables.get(label) ?? [])
				.map((key) => variables.get(key))
				.filter((v) => v?.name)
				.map((v) => ({
					name: v!.name!,
					metric: v!.metric
						? local(v!.metric)
						: metricFromName(v!.name!, metrics),
					dimensions: v!.dimensions,
					fallback: v!.fallback,
				}));
			checks.push({ id, test, variables: bound });
		}
	}
	return checks;
}

/**
 * The equation each assertion states, in rubric codes, keyed by assertion id.
 *
 * Alongside the formulas the taxonomy ships the message shown when an
 * assertion fails, and for the arithmetic checks that message is the equation
 * written out: `9904 = 9903 + 780 - 680 - 67/77`. That is the NBB saying in
 * its own words which rubrics a check is about, so it settles what inferring
 * from dimension filters can only approximate.
 */
function readAssertionEquations(path: string): Map<string, string> {
	const equations = new Map<string, string>();
	if (!existsSync(path)) return equations;
	const doc = readXml(path);

	for (const { tag, node: link } of walk(doc)) {
		if (local(tag) !== "link" || !tag.startsWith("gen:")) continue;

		const locatorTarget = new Map<string, string>();
		for (const loc of byLocalName(link, "loc")) {
			const label = attr(loc, "xlink:label");
			const href = attr(loc, "xlink:href");
			if (!label || !href) continue;
			const hash = href.indexOf("#");
			if (hash !== -1) locatorTarget.set(label, href.slice(hash + 1));
		}
		const messages = new Map<string, string>();
		for (const message of byLocalName(link, "message")) {
			const label = attr(message, "xlink:label");
			if (!label || attr(message, "xml:lang") !== "en") continue;
			messages.set(label, text(message).trim());
		}
		for (const arc of byLocalName(link, "arc")) {
			if (attr(arc, "xlink:arcrole") !== UNSATISFIED_MESSAGE) continue;
			const from = attr(arc, "xlink:from");
			const to = attr(arc, "xlink:to");
			if (!from || !to) continue;
			const target = locatorTarget.get(from);
			const message = messages.get(to);
			if (target && message && !equations.has(target)) {
				equations.set(target, message);
			}
		}
	}
	return equations;
}

/**
 * Rubric codes an equation message names, in the order it names them.
 *
 * A conditional message states its premise before the consequent — "If 1102 is
 * not completed then 1103 = 1101" — and only the consequent is the test the
 * formula evaluates, so the premise is dropped before reading positions off.
 *
 * Everything that is not a rubric of this model is dropped too: operators, the
 * words of the prose, and the numeric literals a test compares against. What
 * remains lines up with the test's variables, which is checked rather than
 * assumed by {@link statedBinding}.
 */
function equationCodes(message: string, known: Set<string>): ResolvedCode[] {
	const consequent = message.split(/\bthen\b/i).pop() ?? message;
	return consequent
		.split(/[\s,()]+/)
		.filter(Boolean)
		.map((token) => resolveCode(token, known))
		.filter((code): code is ResolvedCode => code !== undefined);
}

/** A rubric a message names, and which column it names it in. */
interface ResolvedCode {
	code: string;
	/** Set when the message asked for the preceding exercise's column. */
	preceding?: boolean;
}

/**
 * The rubric a message token names, if it names one.
 *
 * A message writes the preceding exercise's column of a rubric as the rubric
 * with a `P` appended. Sometimes the model numbers that column as a rubric in
 * its own right, and `8199P` is simply a code; where it does not, as in
 * `22/27P`, the `P` is the column and has to be carried separately, because
 * nothing in the variable's own filter says which year is meant.
 */
function resolveCode(token: string, known: Set<string>): ResolvedCode | undefined {
	if (known.has(token)) return { code: token };
	if (token.endsWith("P")) {
		const base = token.slice(0, -1);
		if (known.has(base)) return { code: base, preceding: true };
	}
	return undefined;
}

/** Whether a message names at least one rubric the model carries. */
function namesAnyRubric(message: string, known: Set<string>): boolean {
	return message
		.split(/[\s,()]+/)
		.filter(Boolean)
		.some((token) => resolveCode(token, known) !== undefined);
}

/** Variable names the test refers to, in the order it refers to them. */
function testVariableOrder(test: string): string[] {
	return [...test.matchAll(/\$([A-Za-z]\w*)/g)].map((match) => match[1]!);
}

/**
 * The binding the assertion's own message states, read off position by
 * position against the test.
 *
 * `$am2 eq $am22 + $am1 - $am12 - $am23` and `9904 = 9903 + 780 - 680 - 67/77`
 * are the same equation written twice, so the nth variable is the nth rubric.
 * Only accepted when the two line up exactly: a message naming a different
 * number of rubrics than the test has variables is prose, or a check whose
 * shape we have not understood, and either way guessing is not allowed.
 */
function statedBinding(
	test: string,
	message: string,
	known: Set<string>,
): { binding: CheckBinding; preceding: string[] } | undefined {
	const codes = equationCodes(message, known);
	if (codes.length === 0) return undefined;
	const order = testVariableOrder(test);
	if (order.length !== codes.length) return undefined;
	const binding: Record<string, string> = {};
	const preceding = new Set<string>();
	for (const [position, name] of order.entries()) {
		const { code, preceding: prior } = codes[position]!;
		// A variable used twice has to mean the same rubric both times.
		if (binding[name] !== undefined && binding[name] !== code) return undefined;
		binding[name] = code;
		if (prior) preceding.add(name);
	}
	return { binding, preceding: [...preceding].sort() };
}

/**
 * The assignments to evaluate, anchored on what the taxonomy states outright.
 *
 * Inference alone over-generates. Where a variable's filter reaches several
 * rubrics it will pair them every way the dimensions allow, and most of those
 * pairings are not equations the NBB means: alongside `44 = 440/4 + 441` it
 * offers `441 = 440/4 + 441`, which fails on a filing that is correct.
 *
 * The stated equation settles one assignment, and the rest are judged against
 * it. A check really can repeat — the statement of fixed assets writes one
 * equation and means it once per asset class — but a repetition is the same
 * equation somewhere else in the model, so it names an entirely different set
 * of rubrics. An assignment that instead reshuffles the rubrics of the stated
 * one is a permutation, and is dropped.
 */
function mergeBindings(
	stated: CheckBinding | undefined,
	inferred: CheckBinding[] | undefined,
): CheckBinding[] | undefined {
	if (!stated) return inferred;
	if (!inferred) return [stated];
	const key = (binding: CheckBinding) =>
		Object.entries(binding)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, code]) => `${name}=${code}`)
			.join(",");
	const wanted = key(stated);
	if (!inferred.some((binding) => key(binding) === wanted)) return [stated];
	// A one-variable check states which rubric it is about and there is no
	// shape left to repeat, so nothing joins it.
	if (Object.keys(stated).length < 2) return [stated];
	const anchored = new Set(Object.values(stated));
	return inferred.filter(
		(binding) =>
			key(binding) === wanted ||
			(Object.keys(binding).length === Object.keys(stated).length &&
				Object.values(binding).every((code) => !anchored.has(code))),
	);
}

/**
 * Removes the current-exercise cell of an opening-balance rubric.
 *
 * The annexes number their opening balance as a rubric of its own, `8199P`
 * beside `8199`, and it exists only in the preceding exercise's column: it is
 * last year's closing figure. The rendering table crosses every row with every
 * column, so walking it also yields a current-exercise cell that no filing may
 * report. Three things say so — the NBB's own accepted filings carry `8199P`
 * only against `prd:m2`, the checks that read it filter on the `rut:m1` member
 * that only the preceding-exercise cell carries, and an instance reporting the
 * other one is refused as dimensionally invalid.
 */
function dropOpeningBalanceArtifacts(datapoints: Datapoint[]): void {
	const variants = new Map<string, Datapoint[]>();
	for (const datapoint of datapoints) {
		if (!datapoint.code?.endsWith("P")) continue;
		variants.set(datapoint.code, [
			...(variants.get(datapoint.code) ?? []),
			datapoint,
		]);
	}
	for (const group of variants.values()) {
		if (group.length !== 2) continue;
		const preceding = group.find((d) => d.previousPeriod && !d.currentPeriod);
		const current = group.find((d) => d.currentPeriod && !d.previousPeriod);
		if (!preceding || !current) continue;
		datapoints.splice(datapoints.indexOf(current), 1);
	}
}

// ── Generation ────────────────────────────────────────────────────────

interface Options {
	root: string;
	version: string;
	/** Directory holding the framework, e.g. `<root>/www.nbb.be/be/fr/cbso/fws/26.0`. */
	fws: string;
	fwsVersion: string;
}

/** Section names imported by a model entry point, in document order. */
function readSections(entryPoint: string): string[] {
	const xml = readFileSync(entryPoint, "utf-8");
	const sections: string[] = [];
	for (const match of xml.matchAll(/schemaLocation="[^"]*\/sect\/([^"]+)\.xsd"/g)) {
		if (match[1] && match[1] !== "sect") sections.push(match[1]);
	}
	return sections;
}

/** Namespace declarations used across a set of section schemas. */
function readNamespaces(options: Options, sections: string[]): Record<string, string> {
	const namespaces: Record<string, string> = {};
	for (const section of sections) {
		const path = join(options.fws, "sect", `${section}.xsd`);
		if (!existsSync(path)) continue;
		const head = readFileSync(path, "utf-8").slice(0, 8000);
		for (const match of head.matchAll(/xmlns:([\w.-]+)="([^"]+)"/g)) {
			if (match[1] && match[2]) namespaces[match[1]] ??= match[2];
		}
	}
	return namespaces;
}

function generateModule(options: Options, model: string, part: string) {
	const entryPoint = join(options.fws, "mod", model, `${model}-${part}.xsd`);
	if (!existsSync(entryPoint)) throw new Error(`no entry point at ${entryPoint}`);

	const sections = readSections(entryPoint);
	const datapoints: Datapoint[] = [];

	for (const section of sections) {
		const rend = join(options.fws, "sect", `${section}-rend.xml`);
		if (!existsSync(rend)) continue;
		const axes = readTable(rend);
		const labels = readLabels(join(options.fws, "sect", `${section}-lab.xml`));

		const xAxes = axes.filter((a) => a.axis === "x");
		const yAxes = axes.filter((a) => a.axis === "y");
		const zAxes = axes.filter((a) => a.axis === "z");
		const openDimensions = [
			...new Set(axes.flatMap((a) => a.openDimensions)),
		].sort();

		// Rows carry the rubric; columns carry the metric and the period.
		const rows = yAxes.flatMap((a) => a.leaves);
		const columns = xAxes.flatMap((a) => a.leaves);
		const layers = zAxes.flatMap((a) => a.leaves);
		if (rows.length === 0 || columns.length === 0) continue;

		for (const row of rows) {
			const label = row.node.id ? labels.get(row.node.id) : undefined;
			for (const column of columns) {
				const metric = column.node.concept ?? row.node.concept;
				if (!metric) continue;
				const merged: Record<string, string> = {
					...row.dimensions,
					...column.dimensions,
				};
				for (const layer of layers) Object.assign(merged, layer.dimensions);

				const period = merged["dim:prd"];
				delete merged["dim:prd"];

				const existing = datapoints.find(
					(d) =>
						d.section === section &&
						d.metric === local(metric) &&
						sameDimensions(d.dimensions, merged),
				);
				const target =
					existing ??
					({
						section,
						metric: local(metric),
						...(prefixOf(metric) === "met"
							? {}
							: { metricPrefix: prefixOf(metric) }),
						dimensions: merged,
						...(openDimensions.length ? { openDimensions } : {}),
						...(label?.rubric ? { code: label.rubric } : {}),
						...(label?.english ? { label: label.english } : {}),
					} satisfies Datapoint);
				if (!existing) datapoints.push(target);

				if (period === "prd:m1") target.currentPeriod = period;
				else if (period === "prd:m2") target.previousPeriod = period;
				else if (period) target.currentPeriod ??= period;
			}
		}
	}

	dropOpeningBalanceArtifacts(datapoints);

	const metrics = readMetrics(options);
	const knownCodes = new Set(
		datapoints
			.map((d) => d.code)
			.filter((code): code is string => code !== undefined),
	);
	const checks: Check[] = [];
	for (const [suffix, kind] of Object.entries(CHECK_KINDS)) {
		const path = join(
			options.fws,
			"mod",
			model,
			`${model}-${part}-${suffix}-formula.xml`,
		);
		const equations = readAssertionEquations(path);
		for (const raw of readFormulas(path, metrics)) {
			const candidatesByVariable = new Map<string, Datapoint[]>();
			const variables: CheckVariable[] = raw.variables.map((variable) => {
				const dimensions = stripDefaultMembers(variable.dimensions);
				const period = variable.dimensions["dim:prd"];
				delete dimensions["dim:prd"];
				const candidates = datapoints.filter(
					(d) =>
						d.metric === variable.metric &&
						d.code !== undefined &&
						matchesFilter(dimensions, d.dimensions),
				);
				// A filter naming exactly the dimensions a datapoint carries
				// means that datapoint and no other. Only when nothing matches
				// exactly is the filter genuinely open, as in "total assets
				// equals total liabilities", where both sides share the one
				// member the filter names.
				const exact = candidates.filter((d) =>
					sameDimensions(d.dimensions as Record<string, string>, dimensions),
				);
				const narrowed = exact.length > 0 ? exact : candidates;
				candidatesByVariable.set(variable.name, narrowed);
				const codes = [...new Set(narrowed.map((d) => d.code!))].sort();
				return {
					name: variable.name,
					metric: variable.metric ?? "",
					dimensions,
					codes,
					...(period ? { period } : {}),
					...(variable.fallback ? { fallback: variable.fallback } : {}),
				};
			});
			const narrowed = applyImplicitFiltering(variables, candidatesByVariable);
			const inferred = narrowed && consistentBindings(variables, narrowed);
			const equation = equations.get(raw.id);
			const stated = equation && statedBinding(raw.test, equation, knownCodes);
			const bindings = mergeBindings(stated?.binding, inferred);
			const preceding = stated?.preceding ?? [];
			// A check whose equation names no rubric this model carries is about
			// a section the model does not have. Saying so is not the same as
			// failing to work it out, and the two must not be reported alike.
			const notApplicable =
				!bindings && !namesAnyRubric(equation ?? raw.test, knownCodes);
			checks.push({
				id: raw.id,
				kind,
				section: sectionOfCheck(raw.id),
				test: raw.test,
				variables,
				...(equation ? { equation } : {}),
				...(bindings ? { bindings } : {}),
				...(preceding.length ? { precedingColumn: preceding } : {}),
				...(notApplicable ? { notApplicable: true } : {}),
			});
		}
	}

	const namespaces = readNamespaces(options, sections);
	return {
		version: options.version,
		model,
		part,
		schemaRef: `http://www.nbb.be/be/fr/cbso/fws/${options.fwsVersion}/mod/${model}/${model}-${part}.xsd`,
		metricNamespace: namespaces["met"] ?? "http://www.nbb.be/be/fr/cbso/dict/met",
		namespaces,
		datapoints,
		checks,
	} satisfies TaxonomyModule;
}

/**
 * Narrows each variable to the datapoints consistent with the others.
 *
 * Assertions are written with `implicitFiltering="true"`, which means that an
 * aspect a variable does not filter on must nonetheless take the same value
 * across every variable in the set. That is how the taxonomy tells `789` from
 * `780` in `9905 = 9904 + 789 - 689`: the filters name only the movement
 * dimension, and the statement dimension — uncovered there, but pinned by
 * another variable — decides it.
 *
 * Applied here rather than at validation time so the generated table records
 * one rubric per variable wherever the taxonomy determines one.
 *
 * The constraint is one per dimension — every variable not filtering on it
 * agrees on it — so the narrowing is a fixpoint over those, not a walk of the
 * assignments. A walk is exponential in the number of variables, and the
 * checks that most need pinning are exactly the ones with the widest
 * candidate sets, so it used to hit its cap and give up on them.
 *
 * Removing a candidate is sound: a datapoint dropped here disagrees on some
 * dimension with every remaining choice for another variable, so no consistent
 * assignment could have used it. Where the fixpoint leaves several, the
 * taxonomy genuinely does not decide between them and the variable stays open.
 */
function applyImplicitFiltering(
	variables: CheckVariable[],
	candidates: Map<string, Datapoint[]>,
): Datapoint[][] | undefined {
	const sets = variables.map((variable) => [
		...(candidates.get(variable.name) ?? []),
	]);
	if (sets.some((set) => set.length === 0)) return undefined;

	// Aspects a variable does filter on are covered for it; the rest must agree.
	const covered = variables.map(
		(variable) => new Set(Object.keys(variable.dimensions)),
	);
	const dimensions = new Set(
		sets.flatMap((set) => set.flatMap((d) => Object.keys(d.dimensions))),
	);
	// A datapoint that does not carry a dimension reports it at its default,
	// which is the same thing as another datapoint that also omits it.
	const memberOf = (datapoint: Datapoint, dimension: string) =>
		datapoint.dimensions[dimension] ?? "";

	for (let pass = 0; pass < dimensions.size + 1; pass++) {
		let narrowed = false;
		for (const dimension of dimensions) {
			const open = sets
				.map((set, index) => ({ set, index }))
				.filter(({ index }) => !covered[index]!.has(dimension));
			if (open.length < 2) continue;
			// Only members every open variable can still take are reachable.
			let agreed: Set<string> | undefined;
			for (const { set } of open) {
				const members = new Set(set.map((d) => memberOf(d, dimension)));
				agreed = agreed
					? new Set([...agreed].filter((member) => members.has(member)))
					: members;
			}
			if (!agreed || agreed.size === 0) return undefined;
			for (const { set, index } of open) {
				const kept = set.filter((d) => agreed.has(memberOf(d, dimension)));
				if (kept.length === set.length) continue;
				if (kept.length === 0) return undefined;
				sets[index] = kept;
				narrowed = true;
			}
		}
		if (!narrowed) break;
	}

	variables.forEach((variable, index) => {
		const codes = [...new Set(sets[index]!.map((d) => d.code!))].sort();
		if (codes.length > 0 && codes.length < variable.codes.length) {
			(variable as { codes: readonly string[] }).codes = codes;
		}
	});
	return sets;
}

/**
 * Every assignment of one candidate per variable that implicit filtering
 * allows, as rubric codes.
 *
 * Narrowing each variable on its own is not enough: it says `8199` and `8169`
 * are both reachable, not that they go together. The assignments say which
 * combinations the taxonomy actually means, which is what the check has to be
 * evaluated over.
 *
 * @returns the assignments, or `undefined` where there are more than
 * {@link MAX_CHECK_BINDINGS} of them and the check is better left unevaluated.
 */
function consistentBindings(
	variables: CheckVariable[],
	sets: Datapoint[][],
): CheckBinding[] | undefined {
	const covered = variables.map(
		(variable) => new Set(Object.keys(variable.dimensions)),
	);
	const dimensions = [
		...new Set(
			sets.flatMap((set) => set.flatMap((d) => Object.keys(d.dimensions))),
		),
	];
	const memberOf = (datapoint: Datapoint, dimension: string) =>
		datapoint.dimensions[dimension] ?? "";

	// Cheapest variables first, so a contradiction surfaces before the wide
	// sets are ever walked.
	const order = sets
		.map((_, index) => index)
		.sort((a, b) => sets[a]!.length - sets[b]!.length);

	const bindings: CheckBinding[] = [];
	const chosen: (Datapoint | undefined)[] = sets.map(() => undefined);

	const agrees = (index: number, candidate: Datapoint): boolean =>
		dimensions.every((dimension) => {
			if (covered[index]!.has(dimension)) return true;
			const member = memberOf(candidate, dimension);
			return chosen.every((other, position) => {
				if (!other || position === index) return true;
				if (covered[position]!.has(dimension)) return true;
				return memberOf(other, dimension) === member;
			});
		});

	let overflowed = false;
	const walk = (position: number): void => {
		if (overflowed) return;
		if (position === order.length) {
			if (bindings.length >= MAX_CHECK_BINDINGS) {
				overflowed = true;
				return;
			}
			bindings.push(
				Object.fromEntries(
					variables.map((variable, index) => [
						variable.name,
						chosen[index]!.code!,
					]),
				),
			);
			return;
		}
		const index = order[position]!;
		for (const candidate of sets[index]!) {
			if (!agrees(index, candidate)) continue;
			chosen[index] = candidate;
			walk(position + 1);
			chosen[index] = undefined;
			if (overflowed) return;
		}
	};
	walk(0);
	if (overflowed || bindings.length === 0) return undefined;

	// Assignments differing only in which alias of one rubric they name are the
	// same equation written twice.
	const seen = new Set<string>();
	return bindings.filter((binding) => {
		const key = JSON.stringify(binding);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Drops the `m0` member of each domain.
 *
 * Formula filters pin every dimension, using `m0` — "no member" — for the ones
 * that do not apply. Instances leave those out, and so do datapoints, so they
 * have to come off before the two can be compared.
 */
function stripDefaultMembers(
	dimensions: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [dimension, member] of Object.entries(dimensions)) {
		if (!member.endsWith(":m0")) result[dimension] = member;
	}
	return result;
}

function sameDimensions(a: Record<string, string>, b: Record<string, string>): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => a[key] === b[key]);
}

/**
 * True when the datapoint satisfies every member the filter requires.
 *
 * The filter may name fewer dimensions than the datapoint carries, in which
 * case it matches every datapoint agreeing on the ones it does name. A filter
 * naming none — every member it stated was `m0`, which strips away — matches
 * every datapoint of the metric and is left for implicit filtering to pin
 * against the other variables. Treating it as matching nothing instead is what
 * silenced the checks whose variables are written that way.
 */
function matchesFilter(
	filter: Record<string, string>,
	candidate: Readonly<Record<string, string>>,
): boolean {
	return Object.keys(filter).every((key) => candidate[key] === filter[key]);
}

/** `va_03.01.0_0014` describes section 03.01.0. */
function sectionOfCheck(id: string): string {
	const match = /^[a-z]+_([\d.]+)_/.exec(id);
	return match?.[1] ?? "";
}

// ── Emission ──────────────────────────────────────────────────────────

function emit(module: TaxonomyModule): string {
	const header = `// Generated by scripts/generate-taxonomy.ts from NBB-CBSO ${module.version}.
// Do not edit. Re-run the generator against a new taxonomy release instead.

import type { TaxonomyModule } from "../taxonomy.js"

const module: TaxonomyModule = `;
	return `${header}${JSON.stringify(module, null, "\t")}\n\nexport default module\n`;
}

// ── Entry point ───────────────────────────────────────────────────────

function main(): void {
	const [root, version, ...requested] = process.argv.slice(2);
	if (!root || !version) {
		console.error(
			"usage: generate-taxonomy.ts <taxonomy-root> <version> [model-part…]",
		);
		process.exit(1);
	}

	const cbso = join(root, "www.nbb.be", "be", "fr", "cbso");
	const fwsRoot = join(cbso, "fws");
	const fwsVersion =
		readdirSync(fwsRoot)
			.filter((name) => /^\d+\.\d+$/.test(name))
			.sort((a, b) => Number(b) - Number(a))[0] ?? "";
	const options: Options = {
		root,
		version,
		fws: join(fwsRoot, fwsVersion),
		fwsVersion,
	};

	const targets = requested.length > 0 ? requested : discoverEntryPoints(options);
	const outDir = join(dirname(import.meta.dirname), "src", "generated");
	mkdirSync(outDir, { recursive: true });

	const written: string[] = [];
	for (const target of targets) {
		const match = /^(m\d+)-([afo])$/.exec(target);
		if (!match) {
			console.error(`skipping "${target}": expected something like m87-f`);
			continue;
		}
		const [, model, part] = match as unknown as [string, string, string];
		const generated = generateModule(options, model, part);
		writeFileSync(join(outDir, `${target}.ts`), emit(generated));
		written.push(target);
		const coded = generated.datapoints.filter((d) => d.code).length;
		console.log(
			`${target}: ${generated.datapoints.length} datapoints (${coded} with a rubric code), ${generated.checks.length} checks`,
		);
	}

	writeFileSync(join(outDir, "enumerations.ts"), emitEnumerations(options));
	writeFileSync(join(outDir, "index.ts"), emitIndex(written, version));
	console.log(`wrote ${written.length} module(s) to ${outDir}`);
}

/** Every `<model>-<part>` entry point present in the package. */
function discoverEntryPoints(options: Options): string[] {
	const modDir = join(options.fws, "mod");
	const found: string[] = [];
	for (const model of readdirSync(modDir)) {
		for (const file of readdirSync(join(modDir, model))) {
			const match = /^(m\d+)-([afo])\.xsd$/.exec(file);
			if (match) found.push(`${match[1]}-${match[2]}`);
		}
	}
	return found.sort();
}

/**
 * The closed lists a filer picks a member of, by dictionary prefix.
 *
 * Deliberately not every domain in `dict/dom`. Most are dimension domains that
 * address a datapoint and are never shown to anyone; these two are the ones a
 * human chooses from. An address determines `pcd` and `cty`, so they stay out.
 */
const PICKABLE_ENUMERATIONS = ["cct", "lgf"] as const;

/**
 * Reads one domain's members and their labels.
 *
 * Members are the `nonnum:domainItemType` elements of `dom/<name>.xsd`; the
 * labels come from the sibling `<name>-label.xml`, which is a plain label
 * linkbase rather than the generic one the tables use.
 */
function readEnumeration(options: Options, name: string): EnumerationMember[] {
	const domDir = join(options.root, "www.nbb.be", "be", "fr", "cbso", "dict", "dom");
	const schema = join(domDir, `${name}.xsd`);
	if (!existsSync(schema)) return [];

	const codes: string[] = [];
	for (const { node } of walk(readXml(schema))) {
		if (attr(node, "type") !== "nonnum:domainItemType") continue;
		const code = attr(node, "name");
		if (code) codes.push(code);
	}

	// locator label -> element id, then arcs join each label resource to it.
	const labels = new Map<string, Record<string, string>>();
	const labelPath = join(domDir, `${name}-label.xml`);
	if (existsSync(labelPath)) {
		for (const { tag, node: link } of walk(readXml(labelPath))) {
			if (local(tag) !== "labelLink") continue;
			const target = new Map<string, string>();
			for (const loc of children(link, "link:loc")) {
				const key = attr(loc, "xlink:label");
				const href = attr(loc, "xlink:href");
				const hash = href?.indexOf("#") ?? -1;
				// "cct.xsd#cct_m31" identifies the element as "<prefix>_<code>".
				if (key && href && hash !== -1) {
					target.set(key, href.slice(hash + 1).replace(`${name}_`, ""));
				}
			}
			const resources = new Map<string, { lang?: string; value: string }>();
			for (const label of children(link, "link:label")) {
				const key = attr(label, "xlink:label");
				if (key) {
					resources.set(key, {
						lang: attr(label, "xml:lang"),
						value: text(label),
					});
				}
			}
			for (const arc of children(link, "link:labelArc")) {
				const from = attr(arc, "xlink:from");
				const to = attr(arc, "xlink:to");
				const code = from ? target.get(from) : undefined;
				const resource = to ? resources.get(to) : undefined;
				if (!code || !resource?.lang) continue;
				const entry = labels.get(code) ?? {};
				entry[resource.lang] ??= resource.value;
				labels.set(code, entry);
			}
		}
	}

	return codes.map((code) => ({ code, labels: labels.get(code) ?? {} }));
}

function emitEnumerations(options: Options): string {
	const entries = PICKABLE_ENUMERATIONS.map((name) => {
		const members = readEnumeration(options, name);
		console.log(`${name}: ${members.length} members`);
		return `\t${JSON.stringify(name)}: ${JSON.stringify(members, null, "\t").replace(/\n/g, "\n\t")},`;
	}).join("\n");
	return `// Generated by scripts/generate-taxonomy.ts from NBB-CBSO ${options.version}.
// Do not edit. Re-run the generator against a new taxonomy release instead.

import type { Enumerations } from "../taxonomy.js"

/** Closed lists a filer picks a member of, keyed by dictionary prefix. */
export const ENUMERATIONS: Enumerations = {
${entries}
}
`;
}

function emitIndex(modules: string[], version: string): string {
	const imports = modules
		.map((name) => `import ${identifier(name)} from "./${name}.js"`)
		.join("\n");
	const entries = modules
		.map((name) => `\t"${version}/${name}": ${identifier(name)},`)
		.join("\n");
	return `// Generated by scripts/generate-taxonomy.ts. Do not edit.

import type { TaxonomyModule } from "../taxonomy.js"
${imports}

/** Generated taxonomy modules, keyed by "<version>/<model>-<part>". */
export const TAXONOMY_MODULES: Record<string, TaxonomyModule> = {
${entries}
}
`;
}

function identifier(name: string): string {
	return name.replace(/[^a-zA-Z0-9]/g, "_");
}

main();
