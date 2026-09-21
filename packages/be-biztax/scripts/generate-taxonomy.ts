/**
 * Generates a typed taxonomy module from a be-tax release of FPS Finance.
 *
 * The be-tax taxonomy is a classic XBRL 2.1 one: a line of the return is a
 * concept, a table with an open number of rows is a typed dimension, and the
 * identification block is the NBB's tuples. Everything a builder needs to
 * know about an entry point is read here from the published schemas and
 * linkbases and emitted as data, so that a new April release is a re-run
 * rather than an edit.
 *
 * Usage:
 *   bun run scripts/generate-taxonomy.ts <taxonomy-dir> <version> [return-type…]
 *
 * where <taxonomy-dir> is the unpacked release (the directory holding
 * `be-tax-inc-rcorp-YYYY-04-30.xsd`) and each return-type is one of `rcorp`,
 * `nrcorp`, `rle`. With none given, `rcorp` is generated.
 *
 *   curl -O https://financien.belgium.be/sites/default/files/downloads/be-tax-2026-04-30_V1.0.2.zip
 *   unzip -q be-tax-2026-04-30_V1.0.2.zip -d taxo
 *   bun run generate taxo/be-tax-2026-04-30_V1.0.2 1.0.2 rcorp
 *
 * Each entry point becomes `src/taxonomies/ay<year>-<return-type>.ts`,
 * published as the subpath `@financica/be-biztax/taxonomies/ay<year>-<type>`.
 *
 * Not read: the formula linkbases (the assertions FPS Finance validates
 * with) and the `notAll` exclusion hypercubes.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type {
	CodeList,
	Concept,
	Cube,
	DataType,
	Dimension,
	LabelLanguage,
	ReturnType,
	TaxonomyModule,
	TupleChild,
} from "../src/taxonomy.ts";

// ── Constants ─────────────────────────────────────────────────────────

const RETURN_TYPES: ReadonlySet<string> = new Set<ReturnType>([
	"rcorp",
	"nrcorp",
	"rle",
]);
const LANGUAGES: ReadonlySet<string> = new Set<LabelLanguage>(["nl", "fr", "de", "en"]);

const ARC = {
	all: "http://xbrl.org/int/dim/arcrole/all",
	hypercubeDimension: "http://xbrl.org/int/dim/arcrole/hypercube-dimension",
	dimensionDomain: "http://xbrl.org/int/dim/arcrole/dimension-domain",
	domainMember: "http://xbrl.org/int/dim/arcrole/domain-member",
} as const;

const LABEL_ROLE = "http://www.xbrl.org/2003/role/label";
const VERBOSE_LABEL_ROLE = "http://www.xbrl.org/2003/role/verboseLabel";

/** The XBRL item types the taxonomy uses without restricting them. */
const BUILT_IN_TYPES: Readonly<Record<string, DataType>> = {
	"xbrli:monetaryItemType": { base: "monetary" },
	"xbrli:decimalItemType": { base: "decimal" },
	"xbrli:integerItemType": { base: "integer" },
	"xbrli:nonNegativeIntegerItemType": { base: "integer", minInclusive: 0 },
	"xbrli:positiveIntegerItemType": { base: "integer", minInclusive: 1 },
	"xbrli:sharesItemType": { base: "decimal" },
	"xbrli:stringItemType": { base: "string" },
	"xbrli:tokenItemType": { base: "token" },
	"xbrli:anyURIItemType": { base: "token" },
	"xbrli:normalizedStringItemType": { base: "string" },
	"xbrli:booleanItemType": { base: "boolean" },
	"xbrli:dateItemType": { base: "date" },
	"xbrli:base64BinaryItemType": { base: "base64" },
};

// ── XML reading ───────────────────────────────────────────────────────

type Node = Record<string, unknown>;

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@",
	removeNSPrefix: true,
	parseTagValue: false,
	parseAttributeValue: false,
	trimValues: true,
	isArray: (name) =>
		[
			"element",
			"import",
			"linkbaseRef",
			"complexType",
			"loc",
			"label",
			"labelArc",
			"labelLink",
			"presentationLink",
			"definitionLink",
			"definitionArc",
			"pattern",
		].includes(name),
});

const list = (value: unknown): Node[] =>
	Array.isArray(value) ? (value as Node[]) : value ? [value as Node] : [];

const child = (node: Node | undefined, name: string): Node | undefined =>
	node?.[name] as Node | undefined;

const attr = (node: Node | undefined, name: string): string | undefined => {
	const value = node?.[`@${name}`];
	return typeof value === "string" ? value : undefined;
};

/** The value of a facet child like `<minLength value="3"/>`. */
const facet = (restriction: Node | undefined, name: string): string | undefined =>
	attr(child(restriction, name), "value");

// ── The discoverable taxonomy set ─────────────────────────────────────

interface ElementInfo {
	/** `prefix:LocalName`. */
	name: string;
	id: string;
	type?: string;
	abstract: boolean;
	substitutionGroup?: string;
	periodType?: "instant" | "duration";
	fixed?: string;
	typedDomainRef?: string;
	tuple?: { model: "sequence" | "choice"; children: TupleChild[] };
	/** An anonymous simple type, as typed-dimension elements declare. */
	inlineType?: DataType;
}

interface Dts {
	namespaces: Record<string, string>;
	/** Elements by `file#id`, which is how every linkbase addresses them. */
	byHref: Map<string, ElementInfo>;
	byName: Map<string, ElementInfo>;
	dataTypes: Map<string, DataType>;
	linkbases: { presentation: string[]; definition: string[]; label: string[] };
}

function restrictionToDataType(
	restriction: Node | undefined,
	resolveBase: (base: string) => DataType | undefined,
): DataType | undefined {
	const baseName = attr(restriction, "base");
	if (!restriction || !baseName) return undefined;
	const base: DataType | undefined =
		resolveBase(baseName) ??
		(baseName === "string" ? { base: "string" } : undefined) ??
		(baseName === "date" ? { base: "date" } : undefined);
	if (!base) return undefined;
	const type: DataType = { ...base };
	const number = (name: string): number | undefined => {
		const value = facet(restriction, name);
		return value === undefined ? undefined : Number(value);
	};
	const numeric = ["monetary", "decimal", "integer"].includes(type.base);
	for (const name of [
		"minInclusive",
		"maxInclusive",
		"fractionDigits",
		"totalDigits",
		"minLength",
		"maxLength",
	] as const) {
		// A date's bounds are dates, and nothing downstream checks them.
		if (name.endsWith("Inclusive") && !numeric) continue;
		const value = number(name);
		if (value !== undefined && !Number.isNaN(value)) type[name] = value;
	}
	const pattern = list(restriction["pattern"])
		.map((node) => attr(node, "value"))
		.find((value) => value !== undefined);
	if (pattern) type.pattern = pattern;
	return type;
}

function readDts(root: string, entry: string): Dts {
	const dts: Dts = {
		namespaces: {},
		byHref: new Map(),
		byName: new Map(),
		dataTypes: new Map(Object.entries(BUILT_IN_TYPES)),
		linkbases: { presentation: [], definition: [], label: [] },
	};
	const seen = new Set<string>();
	const pendingTypes: { prefix: string; node: Node }[] = [];

	const visit = (file: string): void => {
		if (seen.has(file)) return;
		seen.add(file);
		const path = join(root, file);
		if (!existsSync(path)) throw new Error(`schema not in the release: ${file}`);
		const text = readFileSync(path, "utf-8");
		const schema = child(parser.parse(text) as Node, "schema");
		const namespace = attr(schema, "targetNamespace");
		if (!schema || !namespace) throw new Error(`not a schema: ${file}`);
		const escaped = namespace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const prefix = new RegExp(`xmlns:([\\w-]+)\\s*=\\s*"${escaped}"`).exec(
			text,
		)?.[1];
		if (!prefix) throw new Error(`no prefix declared for ${namespace} in ${file}`);
		dts.namespaces[prefix] = namespace;

		for (const ref of list(
			child(child(schema, "annotation"), "appinfo")?.["linkbaseRef"],
		)) {
			const href = attr(ref, "href");
			if (!href || href.startsWith("http")) continue;
			for (const kind of ["presentation", "definition", "label"] as const) {
				if (href.endsWith(`-${kind}.xml`)) dts.linkbases[kind].push(href);
			}
		}

		for (const node of list(schema["complexType"]))
			pendingTypes.push({ prefix, node });

		for (const node of list(schema["element"])) {
			const localName = attr(node, "name");
			if (!localName) continue;
			const info: ElementInfo = {
				name: `${prefix}:${localName}`,
				id: attr(node, "id") ?? localName,
				abstract: attr(node, "abstract") === "true",
			};
			const type = attr(node, "type");
			if (type) info.type = type;
			const group = attr(node, "substitutionGroup");
			if (group) info.substitutionGroup = group;
			const periodType = attr(node, "periodType");
			if (periodType === "instant" || periodType === "duration") {
				info.periodType = periodType;
			}
			const fixed = attr(node, "fixed");
			if (fixed !== undefined) info.fixed = fixed;
			const typedDomainRef = attr(node, "typedDomainRef");
			if (typedDomainRef) info.typedDomainRef = typedDomainRef;

			const inline = restrictionToDataType(
				child(child(node, "simpleType"), "restriction"),
				() => undefined,
			);
			if (inline) info.inlineType = inline;

			if (group === "xbrli:tuple") {
				const content = child(
					child(list(node["complexType"])[0], "complexContent"),
					"restriction",
				);
				const model = content?.["sequence"] ? "sequence" : "choice";
				const contentGroup = child(content, model);
				if (!contentGroup)
					throw new Error(`tuple ${info.name} has no content model`);
				if (contentGroup["sequence"] || contentGroup["choice"]) {
					throw new Error(
						`tuple ${info.name} nests content groups; extend the generator`,
					);
				}
				info.tuple = {
					model,
					children: list(contentGroup["element"]).map((slot) => {
						const max = attr(slot, "maxOccurs");
						return {
							name: attr(slot, "ref") ?? "",
							minOccurs: Number(attr(slot, "minOccurs") ?? "1"),
							maxOccurs: max === "unbounded" ? null : Number(max ?? "1"),
						};
					}),
				};
			}
			dts.byHref.set(`${file}#${info.id}`, info);
			dts.byName.set(info.name, info);
		}

		for (const node of list(schema["import"])) {
			const location = attr(node, "schemaLocation");
			// The XBRL specification's own schemas are named relatively by some
			// files but are not part of the release, and declare no concepts.
			if (/^http:\/\/(www\.)?xbrl\.org\//.test(attr(node, "namespace") ?? ""))
				continue;
			if (location && !location.startsWith("http")) visit(location);
		}
	};
	visit(entry);

	// Named types restrict one another, so resolve until nothing new lands.
	let progressed = true;
	while (progressed) {
		progressed = false;
		for (const { prefix, node } of pendingTypes) {
			const name = `${prefix}:${attr(node, "name")}`;
			if (dts.dataTypes.has(name)) continue;
			const type = restrictionToDataType(
				child(child(node, "simpleContent"), "restriction"),
				(base) => dts.dataTypes.get(base),
			);
			if (!type) continue;
			dts.dataTypes.set(name, type);
			progressed = true;
		}
	}
	return dts;
}

// ── Linkbases ─────────────────────────────────────────────────────────

/** `file.xsd#id` of a locator, which is the key of {@link Dts.byHref}. */
const hrefKey = (href: string): string => href.replace(/^.*\//, "");

function locators(link: Node): Map<string, string> {
	const result = new Map<string, string>();
	for (const loc of list(link["loc"])) {
		const label = attr(loc, "label");
		const href = attr(loc, "href");
		if (label && href) result.set(label, hrefKey(href));
	}
	return result;
}

function readLinkbase(root: string, file: string): Node {
	const parsed = parser.parse(readFileSync(join(root, file), "utf-8")) as Node;
	const linkbase = child(parsed, "linkbase");
	if (!linkbase) throw new Error(`not a linkbase: ${file}`);
	return linkbase;
}

/** Every concept a presentation linkbase of the entry point places somewhere. */
function presented(root: string, dts: Dts): Set<string> {
	const names = new Set<string>();
	for (const file of dts.linkbases.presentation) {
		for (const link of list(readLinkbase(root, file)["presentationLink"])) {
			for (const href of locators(link).values()) {
				const element = dts.byHref.get(href);
				if (element) names.add(element.name);
			}
		}
	}
	return names;
}

function readLabels(
	root: string,
	dts: Dts,
): Map<string, Partial<Record<LabelLanguage, string>>> {
	const chosen = new Map<string, Partial<Record<LabelLanguage, string>>>();
	const verbose = new Set<string>();
	for (const file of dts.linkbases.label) {
		for (const link of list(readLinkbase(root, file)["labelLink"])) {
			const locs = locators(link);
			const targets = new Map<string, string>();
			for (const arc of list(link["labelArc"])) {
				const from = locs.get(attr(arc, "from") ?? "");
				const to = attr(arc, "to");
				const element = from ? dts.byHref.get(from) : undefined;
				if (element && to) targets.set(to, element.name);
			}
			for (const label of list(link["label"])) {
				const concept = targets.get(attr(label, "label") ?? "");
				const lang = attr(label, "lang") as LabelLanguage | undefined;
				const role = attr(label, "role");
				const text = label["#text"];
				if (!concept || !lang || !LANGUAGES.has(lang)) continue;
				if (typeof text !== "string" || text === "") continue;
				if (role !== LABEL_ROLE && role !== VERBOSE_LABEL_ROLE) continue;
				// The standard label of a detail line is a bare "Explanation";
				// the verbose one says what it explains, so it wins.
				const key = `${concept}|${lang}`;
				if (verbose.has(key)) continue;
				if (role === VERBOSE_LABEL_ROLE) verbose.add(key);
				else if (chosen.get(concept)?.[lang] !== undefined) continue;
				chosen.set(concept, { ...chosen.get(concept), [lang]: text });
			}
		}
	}
	return chosen;
}

interface DefinitionArc {
	arcrole: string;
	from: string;
	to: string;
	targetRole?: string;
}

function readDefinitionArcs(root: string, dts: Dts): Map<string, DefinitionArc[]> {
	const byRole = new Map<string, DefinitionArc[]>();
	for (const file of dts.linkbases.definition) {
		for (const link of list(readLinkbase(root, file)["definitionLink"])) {
			const role = attr(link, "role") ?? "";
			const locs = locators(link);
			const arcs = byRole.get(role) ?? [];
			for (const arc of list(link["definitionArc"])) {
				const from = dts.byHref.get(locs.get(attr(arc, "from") ?? "") ?? "");
				const to = dts.byHref.get(locs.get(attr(arc, "to") ?? "") ?? "");
				const arcrole = attr(arc, "arcrole");
				if (!from || !to || !arcrole) continue;
				const targetRole = attr(arc, "targetRole");
				arcs.push({
					arcrole,
					from: from.name,
					to: to.name,
					...(targetRole ? { targetRole } : {}),
				});
			}
			byRole.set(role, arcs);
		}
	}
	return byRole;
}

/** Everything reachable from `start` over domain-member arcs of one role. */
function descendants(arcs: readonly DefinitionArc[], start: string): string[] {
	const found: string[] = [];
	const queue = [start];
	const seen = new Set(queue);
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const arc of arcs) {
			if (arc.arcrole !== ARC.domainMember || arc.from !== current) continue;
			if (seen.has(arc.to)) continue;
			seen.add(arc.to);
			found.push(arc.to);
			queue.push(arc.to);
		}
	}
	return found;
}

/** The literal constants of `be-tax-f-parameters`, which every rule reads. */
function readParameters(root: string, release: string): Record<string, string> {
	const file = join(root, `be-tax-f-parameters-${release}.xml`);
	if (!existsSync(file)) return {};
	const parameters: Record<string, string> = {};
	const text = readFileSync(file, "utf-8");
	for (const match of text.matchAll(/<variable:parameter\b[^>]*>/g)) {
		const name = /\bname="([^"]+)"/.exec(match[0])?.[1];
		const select = /\bselect="([^"]*)"/.exec(match[0])?.[1];
		if (!name || select === undefined) continue;
		const literal =
			/^'([^']*)'$/.exec(select)?.[1] ??
			(/^-?[\d.]+$/.test(select) ? select : undefined);
		if (literal !== undefined) parameters[name] = literal;
	}
	return Object.fromEntries(
		Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)),
	);
}

// ── Assembly ──────────────────────────────────────────────────────────

function generate(
	root: string,
	version: string,
	returnType: ReturnType,
): TaxonomyModule {
	const entry = readdirSync(root).find((file) =>
		new RegExp(`^be-tax-inc-${returnType}-\\d{4}-\\d{2}-\\d{2}\\.xsd$`).test(file),
	);
	if (!entry) throw new Error(`no ${returnType} entry point in ${root}`);
	const release = /(\d{4}-\d{2}-\d{2})\.xsd$/.exec(entry)![1]!;

	const dts = readDts(root, entry);
	const labels = readLabels(root, dts);
	const arcsByRole = readDefinitionArcs(root, dts);

	// Cubes, and which concepts sit in each.
	const cubes: Cube[] = [];
	const cubesOf = new Map<string, number[]>();
	const dimensionMembers = new Map<string, Set<string>>();
	for (const [role, arcs] of arcsByRole) {
		for (const all of arcs.filter((arc) => arc.arcrole === ARC.all)) {
			const cubeArcs = arcsByRole.get(all.targetRole ?? role) ?? [];
			const dimensions = cubeArcs
				.filter(
					(arc) =>
						arc.arcrole === ARC.hypercubeDimension && arc.from === all.to,
				)
				.map((arc) => {
					const domainArcs =
						arcsByRole.get(arc.targetRole ?? all.targetRole ?? role) ?? [];
					const members = dimensionMembers.get(arc.to) ?? new Set<string>();
					for (const domain of domainArcs) {
						if (
							domain.arcrole !== ARC.dimensionDomain ||
							domain.from !== arc.to
						)
							continue;
						const memberArcs =
							arcsByRole.get(domain.targetRole ?? "") ?? domainArcs;
						for (const member of [
							domain.to,
							...descendants(memberArcs, domain.to),
						]) {
							members.add(member);
						}
					}
					dimensionMembers.set(arc.to, members);
					return arc.to;
				})
				.sort();
			const index = cubes.push({ role: all.targetRole ?? role, dimensions }) - 1;
			for (const concept of [all.from, ...descendants(arcs, all.from)]) {
				cubesOf.set(concept, [...(cubesOf.get(concept) ?? []), index]);
			}
		}
	}

	// Reportable concepts: what the entry point presents, and what its tuples
	// hold, which the presentation does not always spell out.
	const reportable = presented(root, dts);
	const codeLists: Record<string, CodeList> = {};
	const queue = [...reportable];
	while (queue.length > 0) {
		const element = dts.byName.get(queue.pop()!);
		for (const slot of element?.tuple?.children ?? []) {
			if (reportable.has(slot.name)) continue;
			reportable.add(slot.name);
			queue.push(slot.name);
		}
	}

	const concepts: Record<string, Concept> = {};
	const usedTypes = new Set<string>();
	for (const name of [...reportable].sort()) {
		const element = dts.byName.get(name);
		if (!element) continue;
		if (element.tuple) {
			concepts[name] = {
				kind: "tuple",
				name,
				model: element.tuple.model,
				children: element.tuple.children,
				labels: labels.get(name) ?? {},
			};
			continue;
		}
		if (element.abstract) {
			// An abstract item that tuples name is the head of a code list.
			const members = [...dts.byName.values()].filter(
				(candidate) =>
					candidate.substitutionGroup === name &&
					candidate.fixed !== undefined,
			);
			if (members.length > 0) {
				codeLists[name] = {
					head: name,
					codes: Object.fromEntries(
						members
							.map((member) => [member.fixed!, member.name] as const)
							.sort(([a], [b]) => a.localeCompare(b)),
					),
				};
			}
			continue;
		}
		if (element.fixed !== undefined) continue; // a code, reached through its list
		if (!element.periodType || !element.type) continue;
		if (!dts.dataTypes.has(element.type)) {
			throw new Error(`${name} has the unknown type ${element.type}`);
		}
		usedTypes.add(element.type);
		const inCubes = cubesOf.get(name);
		concepts[name] = {
			kind: "item",
			name,
			periodType: element.periodType,
			dataType: element.type,
			...(inCubes ? { cubes: [...new Set(inCubes)].sort((a, b) => a - b) } : {}),
			labels: labels.get(name) ?? {},
		};
	}

	const dimensions: Record<string, Dimension> = {};
	for (const name of new Set(cubes.flatMap((cube) => cube.dimensions))) {
		const element = dts.byName.get(name);
		if (!element) continue;
		if (element.typedDomainRef) {
			const typed = dts.byHref.get(hrefKey(element.typedDomainRef));
			// Either an anonymous restriction, or a bare XSD type like `date`.
			const plain = { date: "date", string: "string" } as const;
			const type: DataType | undefined =
				typed?.inlineType ??
				(typed?.type && typed.type in plain
					? { base: plain[typed.type as keyof typeof plain] }
					: undefined);
			if (!typed || !type) {
				throw new Error(
					`typed domain of ${name} has a type the generator cannot read`,
				);
			}
			dimensions[name] = { name, typed: { element: typed.name, type } };
		} else {
			dimensions[name] = {
				name,
				members: [...(dimensionMembers.get(name) ?? [])].sort(),
			};
		}
	}

	return {
		returnType,
		assessmentYear: Number(release.slice(0, 4)),
		release,
		version,
		schemaRef: `be-tax-${release}/DTS/${entry}`,
		namespaces: Object.fromEntries(
			Object.entries(dts.namespaces).sort(([a], [b]) => a.localeCompare(b)),
		),
		concepts,
		dataTypes: Object.fromEntries(
			[...usedTypes].sort().map((type) => [type, dts.dataTypes.get(type)!]),
		),
		dimensions: Object.fromEntries(
			Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b)),
		),
		cubes,
		codeLists,
		parameters: readParameters(root, release),
	};
}

function main(): void {
	const [root, version, ...requested] = process.argv.slice(2);
	if (!root || !version) {
		console.error(
			"usage: bun run scripts/generate-taxonomy.ts <taxonomy-dir> <version> [return-type…]",
		);
		process.exit(2);
	}
	const returnTypes = requested.length > 0 ? requested : ["rcorp"];
	const outDir = join(dirname(import.meta.dirname), "src", "taxonomies");
	mkdirSync(outDir, { recursive: true });

	const written: string[] = [];
	for (const returnType of returnTypes) {
		if (!RETURN_TYPES.has(returnType)) {
			console.error(`unknown return type "${returnType}"`);
			process.exit(2);
		}
		const module = generate(root, version, returnType as ReturnType);
		const file = join(outDir, `ay${module.assessmentYear}-${returnType}.ts`);
		writeFileSync(
			file,
			[
				`// Generated by scripts/generate-taxonomy.ts from be-tax ${module.release} v${version}.`,
				"// Do not edit. Re-run the generator against a new taxonomy release instead.",
				"",
				'import type { TaxonomyModule } from "../taxonomy.js";',
				"",
				`const taxonomy: TaxonomyModule = ${JSON.stringify(module, null, "\t")};`,
				"",
				"export default taxonomy;",
				"",
			].join("\n"),
		);
		written.push(file);
		const items = Object.values(module.concepts).filter(
			(c) => c.kind === "item",
		).length;
		console.log(
			`${returnType}: ${items} items, ${Object.keys(module.concepts).length - items} tuples, ` +
				`${module.cubes.length} cubes, ${Object.keys(module.dimensions).length} dimensions, ` +
				`${Object.keys(module.codeLists).length} code lists`,
		);
	}

	// Formatted like the rest of the source, so that a re-run against the same
	// release is a no-op in git rather than a whitespace diff.
	const formatted = spawnSync("bunx", ["oxfmt", ...written], { stdio: "inherit" });
	if (formatted.status !== 0) {
		console.error("oxfmt failed; the generated files are unformatted");
		process.exit(formatted.status ?? 1);
	}
}

main();
