import { parseXbrl, type XbrlFact, type XbrlPeriod } from "@financica/xbrl";
import { BiztaxParseError } from "./errors.js";
import type { LabelLanguage, QualifiedName, TaxonomyModule } from "./taxonomy.js";

type Labels = Partial<Record<LabelLanguage, string>>;

/** A dimension a fact is qualified by, like the Belgian origin of a profit. */
export interface BiztaxReadMember {
	dimension: QualifiedName;
	member: QualifiedName;
	labels: Labels;
}

/** A fact with a value, as the form states it. */
export interface BiztaxReadItem {
	kind: "item";
	concept: QualifiedName;
	/** The form code, like `1872`; absent for a concept the form does not number. */
	code?: string | undefined;
	labels: Labels;
	value: string;
	/** `EUR` for an amount, `pure` for a count or a rate, absent for text. */
	unit?: string | undefined;
	period: XbrlPeriod;
	dimensions: BiztaxReadMember[];
}

/** A value reported through a code list, like legal form `610`. */
export interface BiztaxReadCode {
	kind: "code";
	/** The code list head, like `pfs-vl:LegalFormCodeHead`. */
	list: QualifiedName;
	code: string;
	/** What the code means, like an SRL. */
	labels: Labels;
}

/** A group of facts, like the address or the entity's identification. */
export interface BiztaxReadTuple {
	kind: "tuple";
	concept: QualifiedName;
	labels: Labels;
	children: (BiztaxReadItem | BiztaxReadCode | BiztaxReadTuple)[];
}

/** A document the return carries, like the annual accounts or the minutes. */
export interface BiztaxReadAnnex {
	concept: QualifiedName;
	labels: Labels;
	/** The document itself, base64 as the file holds it. */
	base64: string;
}

/** One return of a `.biztax` file. */
export interface BiztaxReadReturn {
	taxonomy: TaxonomyModule;
	/** The enterprise number the contexts name, like `BE0123456789`. */
	entity: string;
	/** The groups the return opens with: identification, address, document. */
	identification: BiztaxReadTuple[];
	/** Every stated figure, in document order. */
	items: BiztaxReadItem[];
	annexes: BiztaxReadAnnex[];
}

const XML_DECLARATION = /^﻿?\s*<\?xml[^?]*\?>\s*/;
const INSTANCE = /<((?:[\w.-]+:)?xbrl)[\s>][\s\S]*?<\/\1>/g;

/**
 * Read a `.biztax` file back into its returns, with each fact named, coded and
 * labelled from the taxonomy it was written against.
 *
 * Each return picks the module whose `schemaRef` it points at, so pass every
 * module the file may use. A bare XBRL instance is read as a one-return file.
 *
 * @returns `null` when the document is neither a `.biztax` file nor an XBRL instance.
 * @throws {BiztaxParseError} on malformed XML, or a return under none of `taxonomies`.
 */
export function parseBiztaxFile(
	xml: string,
	taxonomies: readonly TaxonomyModule[],
): BiztaxReadReturn[] | null {
	const body = xml.replace(XML_DECLARATION, "").trimStart();
	if (!/^<biztax[\s>]/.test(body) && !/^<(?:[\w.-]+:)?xbrl[\s>]/.test(body)) {
		return null;
	}
	const instances = [...body.matchAll(INSTANCE)].map((match) => match[0]);
	if (instances.length === 0) {
		throw new BiztaxParseError("the file holds no XBRL instance");
	}
	return instances.map((instance, index) => readReturn(instance, index, taxonomies));
}

function readReturn(
	xml: string,
	index: number,
	taxonomies: readonly TaxonomyModule[],
): BiztaxReadReturn {
	let instance;
	try {
		instance = parseXbrl(xml);
	} catch (error) {
		throw new BiztaxParseError(`return ${index + 1} is not well-formed XML`, {
			cause: error,
		});
	}
	if (!instance) {
		throw new BiztaxParseError(`return ${index + 1} is not an XBRL instance`);
	}
	const schemaRef = instance.schemaRefs[0]?.href;
	const taxonomy = taxonomies.find((module) => module.schemaRef === schemaRef);
	if (!taxonomy) {
		throw new BiztaxParseError(
			`return ${index + 1} uses the taxonomy ${schemaRef ?? "(none)"}, which is not loaded`,
		);
	}

	const prefixOf = new Map(
		Object.entries(taxonomy.namespaces).map(([prefix, uri]) => [uri, prefix]),
	);
	const nameOf = (qname: { namespace: string; localName: string }): QualifiedName =>
		`${prefixOf.get(qname.namespace) ?? qname.namespace}:${qname.localName}`;
	const codeOf = new Map<QualifiedName, { list: QualifiedName; code: string }>();
	for (const list of Object.values(taxonomy.codeLists)) {
		for (const [code, element] of Object.entries(list.codes)) {
			codeOf.set(element, { list: list.head, code });
		}
	}
	const memberLabels = (dimension: QualifiedName, member: QualifiedName): Labels =>
		taxonomy.dimensions[dimension]?.memberLabels?.[member] ?? {};
	const isBinary = (concept: QualifiedName): boolean => {
		const found = taxonomy.concepts[concept];
		return (
			found?.kind === "item" &&
			taxonomy.dataTypes[found.dataType]?.base === "base64"
		);
	};

	const entity = Object.values(instance.contexts)[0]?.entity.value ?? "";
	const readItem = (fact: Extract<XbrlFact, { type: "item" }>): BiztaxReadItem => {
		const concept = nameOf(fact.name);
		const found = taxonomy.concepts[concept];
		const context = instance.contexts[fact.contextRef];
		const unit = fact.unitRef ? instance.units[fact.unitRef] : undefined;
		return {
			kind: "item",
			concept,
			code: found?.code,
			labels: found?.labels ?? {},
			value: fact.value ?? "",
			unit: unit?.measures?.[0]?.localName,
			period: context?.period ?? { type: "forever" },
			dimensions: (context?.scenario ?? []).flatMap((part) => {
				if (!part.dimension || !part.member) return [];
				const dimension = nameOf(part.dimension);
				const member = nameOf(part.member);
				return [{ dimension, member, labels: memberLabels(dimension, member) }];
			}),
		};
	};
	const readChild = (
		fact: XbrlFact,
	): BiztaxReadItem | BiztaxReadCode | BiztaxReadTuple => {
		const concept = nameOf(fact.name);
		if (fact.type === "tuple") {
			return {
				kind: "tuple",
				concept,
				labels: taxonomy.concepts[concept]?.labels ?? {},
				children: fact.children.map(readChild),
			};
		}
		const coded = codeOf.get(concept);
		if (coded) {
			const list = taxonomy.codeLists[coded.list];
			return {
				kind: "code",
				list: coded.list,
				code: coded.code,
				labels: list?.labels[coded.code] ?? {},
			};
		}
		return readItem(fact);
	};

	const identification: BiztaxReadTuple[] = [];
	const items: BiztaxReadItem[] = [];
	const annexes: BiztaxReadAnnex[] = [];
	for (const fact of instance.facts) {
		const read = readChild(fact);
		if (read.kind === "tuple") identification.push(read);
		else if (read.kind === "item" && isBinary(read.concept)) {
			annexes.push({
				concept: read.concept,
				labels: read.labels,
				base64: read.value.replace(/\s+/g, ""),
			});
		} else if (read.kind === "item") items.push(read);
	}
	return { taxonomy, entity, identification, items, annexes };
}
