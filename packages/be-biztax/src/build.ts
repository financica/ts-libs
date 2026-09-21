import { BiztaxBuildError } from "./errors.js";
import type {
	DataType,
	ItemConcept,
	QualifiedName,
	TaxonomyModule,
	TupleConcept,
} from "./taxonomy.js";
import type { BiztaxReturnInput, FactInput } from "./types.js";

/** Which of the return's three periods a fact is reported for. */
export type FactMoment = "period" | "start" | "end";

/** A value bound to its concept, in the lexical form the taxonomy expects. */
export interface BiztaxItem {
	kind: "item";
	/** The element written, which for a coded value is the code's own element. */
	name: QualifiedName;
	/** The concept's datatype, absent for a code, which is plain text. */
	dataType?: DataType;
	value: string;
	moment: FactMoment;
	/** Dimension to member, empty for the non-dimensional part of the return. */
	dimensions: Readonly<Record<QualifiedName, string>>;
}

export interface BiztaxTuple {
	kind: "tuple";
	name: QualifiedName;
	children: readonly BiztaxNode[];
}

export type BiztaxNode = BiztaxItem | BiztaxTuple;

/** A return, resolved against a taxonomy and ready to validate or render. */
export interface BiztaxReturn {
	input: BiztaxReturnInput;
	module: TaxonomyModule;
	/** The enterprise number as the taxonomy wants it: `BE` and ten digits. */
	entityIdentifier: string;
	/** Top-level facts in document order: identification first, then the lines. */
	facts: readonly BiztaxNode[];
}

/** How the return names itself, by filing language (rule `f-rcorp-2011`). */
const RETURN_NAME = { fr: "ISoc", nl: "VenB", de: "GSt" } as const;

/** What the identifier is called in the identification block, by language. */
const IDENTIFIER_NAME = {
	fr: "Numéro d'entreprise",
	nl: "Ondernemingsnummer",
	de: "Unternehmensnummer",
} as const;

/** The registered office, in the NBB's list of address types. */
const REGISTERED_OFFICE = "001";

const CORE_PREFIX = "tax-inc";

/** `BE` and ten digits, from whatever punctuation the caller's copy carries. */
export function normalizeEnterpriseNumber(value: string): string {
	const digits = value.replace(/^\s*BE/i, "").replace(/[\s.-]/g, "");
	return `BE${digits.length === 9 ? `0${digits}` : digits}`;
}

function base64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunk) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
	}
	return btoa(binary);
}

/**
 * A caller's value in the lexical form of the concept's datatype.
 *
 * Only the JavaScript type is policed here: a string where an amount belongs
 * is a bug in the caller. Whether the amount fits the datatype's range is a
 * finding, which `validateBiztaxReturn` reports rather than throws.
 */
function lexical(
	concept: ItemConcept,
	type: DataType,
	value: FactInput["value"],
): string {
	const reject = (expected: string): never => {
		throw new BiztaxBuildError(
			`${concept.name} takes ${expected}, got ${typeof value}`,
		);
	};
	switch (type.base) {
		case "monetary":
			if (typeof value !== "number" || !Number.isFinite(value))
				return reject("a number");
			return value.toFixed(2);
		case "decimal":
			if (typeof value !== "number" || !Number.isFinite(value))
				return reject("a number");
			return type.fractionDigits === undefined
				? String(value)
				: value.toFixed(type.fractionDigits);
		case "integer":
			if (typeof value !== "number" || !Number.isInteger(value))
				return reject("an integer");
			return String(value);
		case "boolean":
			if (typeof value !== "boolean") return reject("a boolean");
			return String(value);
		case "base64":
			if (!(value instanceof Uint8Array)) return reject("bytes");
			return base64(value);
		case "date":
			if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
				return reject("a YYYY-MM-DD date");
			}
			return value;
		case "string":
		case "token":
			if (typeof value !== "string") return reject("text");
			return type.base === "token" ? value.trim().replace(/\s+/g, " ") : value;
	}
}

const sortedKeys = (record: Readonly<Record<string, unknown>>): string[] =>
	Object.keys(record).sort();

/** What makes two inputs the same fact. */
function factKey(item: BiztaxItem): string {
	const dimensions = sortedKeys(item.dimensions)
		.map((dimension) => `${dimension}=${item.dimensions[dimension]}`)
		.join(",");
	return `${item.name}|${item.moment}|${dimensions}`;
}

/**
 * Assemble a return from the caller's input and a taxonomy module.
 *
 * Everything is resolved against the generated module, so a concept the entry
 * point does not declare, or a dimension the concept cannot carry, is an error
 * here rather than a fact Biztax silently refuses.
 *
 * @throws {BiztaxBuildError}
 */
export function buildBiztaxReturn(input: BiztaxReturnInput): BiztaxReturn {
	const module = input.taxonomy;

	const itemConcept = (name: QualifiedName): ItemConcept => {
		const concept = module.concepts[name];
		if (!concept) {
			throw new BiztaxBuildError(
				`"${name}" is not a concept of the ${module.returnType} return for assessment year ${module.assessmentYear}`,
			);
		}
		if (concept.kind !== "item") {
			throw new BiztaxBuildError(`"${name}" is a tuple and carries no value`);
		}
		return concept;
	};

	const item = (fact: FactInput): BiztaxItem => {
		const concept = itemConcept(
			fact.concept.includes(":")
				? fact.concept
				: `${CORE_PREFIX}:${fact.concept}`,
		);
		const dataType = module.dataTypes[concept.dataType];
		if (!dataType) {
			throw new BiztaxBuildError(
				`${concept.name} has the unknown type ${concept.dataType}`,
			);
		}
		const dimensions = fact.dimensions ?? {};
		checkDimensions(module, concept, dimensions);
		return {
			kind: "item",
			name: concept.name,
			dataType,
			value: lexical(concept, dataType, fact.value),
			moment: concept.periodType === "duration" ? "period" : (fact.at ?? "end"),
			dimensions,
		};
	};

	/** A value from a closed list, which is reported as the code's own element. */
	const coded = (head: QualifiedName, code: string): BiztaxItem => {
		const element = module.codeLists[head]?.codes[code];
		if (!element) throw new BiztaxBuildError(`"${code}" is not a code of ${head}`);
		return {
			kind: "item",
			name: element,
			value: code,
			moment: "period",
			dimensions: {},
		};
	};

	/**
	 * A tuple, with its children put in the order its content model gives
	 * them. Slots are named as the model names them, so a coded value goes
	 * under the head of its list.
	 */
	const tuple = (
		name: QualifiedName,
		slots: Readonly<Record<QualifiedName, BiztaxNode | undefined>>,
	): BiztaxTuple | undefined => {
		const concept = module.concepts[name] as TupleConcept | undefined;
		if (concept?.kind !== "tuple") {
			throw new BiztaxBuildError(`"${name}" is not a tuple of this taxonomy`);
		}
		for (const slot of Object.keys(slots)) {
			if (!concept.children.some((candidate) => candidate.name === slot)) {
				throw new BiztaxBuildError(`${name} has no slot for ${slot}`);
			}
		}
		const children = concept.children.flatMap((slot) => slots[slot.name] ?? []);
		if (children.length === 0) return undefined;
		if (concept.model === "choice" && children.length > 1) {
			throw new BiztaxBuildError(`${name} takes exactly one of its children`);
		}
		if (concept.model === "sequence") {
			for (const slot of concept.children) {
				if (slot.minOccurs > 0 && !slots[slot.name]) {
					throw new BiztaxBuildError(`${name} requires ${slot.name}`);
				}
			}
		}
		return { kind: "tuple", name, children };
	};

	const text = (
		concept: QualifiedName,
		value: string | undefined,
	): BiztaxItem | undefined =>
		value === undefined || value === "" ? undefined : item({ concept, value });

	const entityIdentifier = normalizeEnterpriseNumber(input.entity.enterpriseNumber);
	const address = input.entity.address;

	const entityInformation = tuple("pfs-gcd:EntityInformation", {
		"pfs-gcd:EntityName": tuple("pfs-gcd:EntityName", {
			"pfs-gcd:EntityCurrentLegalName": text(
				"pfs-gcd:EntityCurrentLegalName",
				input.entity.name,
			),
		}),
		"pfs-gcd:EntityIdentifier": tuple("pfs-gcd:EntityIdentifier", {
			"pfs-gcd:IdentifierName": text(
				"pfs-gcd:IdentifierName",
				IDENTIFIER_NAME[input.language],
			),
			"pfs-gcd:IdentifierValue": text(
				"pfs-gcd:IdentifierValue",
				entityIdentifier,
			),
		}),
		"pfs-gcd:EntityForm": input.entity.legalForm
			? tuple("pfs-gcd:EntityForm", {
					"pfs-vl:LegalFormCodeHead": coded(
						"pfs-vl:LegalFormCodeHead",
						input.entity.legalForm,
					),
				})
			: undefined,
		"pfs-gcd:EntityAddress": address
			? tuple("pfs-gcd:EntityAddress", {
					"pfs-gcd:AddressType": tuple("pfs-gcd:AddressType", {
						"pfs-vl:AddressTypeCodeHead": coded(
							"pfs-vl:AddressTypeCodeHead",
							REGISTERED_OFFICE,
						),
					}),
					"pfs-gcd:Street": text("pfs-gcd:Street", address.street),
					"pfs-gcd:Number": text("pfs-gcd:Number", address.houseNumber),
					"pfs-gcd:Box": text("pfs-gcd:Box", address.box),
					"pfs-gcd:PostalCodeCity": tuple("pfs-gcd:PostalCodeCity", {
						"pfs-vl:PostalCodeHead": coded(
							"pfs-vl:PostalCodeHead",
							address.postalCode,
						),
					}),
					"pfs-gcd:CountryCode": tuple("pfs-gcd:CountryCode", {
						"pfs-vl:CountryCodeHead": coded(
							"pfs-vl:CountryCodeHead",
							address.country ?? "BE",
						),
					}),
				})
			: undefined,
	});

	// The document block is mandatory and names the file and its language; who
	// to contact about it, and what wrote it, are optional.
	const contact = input.contact;
	const documentInformation = tuple("pfs-gcd:DocumentInformation", {
		"pfs-gcd:DocumentIdentifier": text(
			"pfs-gcd:DocumentIdentifier",
			`${RETURN_NAME[input.language]} ${module.assessmentYear}`,
		),
		"pfs-gcd:DocumentLanguage": tuple("pfs-gcd:DocumentLanguage", {
			"pfs-vl:LanguageCodeHead": coded(
				"pfs-vl:LanguageCodeHead",
				input.language.toUpperCase(),
			),
		}),
		"pfs-gcd:DocumentContact": contact
			? tuple("pfs-gcd:DocumentContact", {
					"pfs-gcd:ContactName": text("pfs-gcd:ContactName", contact.name),
					"pfs-gcd:ContactFirstName": text(
						"pfs-gcd:ContactFirstName",
						contact.firstName,
					),
					"pfs-gcd:ContactTitlePosition": text(
						"pfs-gcd:ContactTitlePosition",
						contact.function,
					),
					"pfs-gcd:ContactPhoneFaxNumber": contact.phone
						? tuple("pfs-gcd:ContactPhoneFaxNumber", {
								"pfs-gcd:LocalPhoneNumber": text(
									"pfs-gcd:LocalPhoneNumber",
									contact.phone,
								),
							})
						: undefined,
					"pfs-gcd:ContactEmail": contact.email
						? tuple("pfs-gcd:ContactEmail", {
								"pfs-gcd:EmailAddress": text(
									"pfs-gcd:EmailAddress",
									contact.email,
								),
							})
						: undefined,
				})
			: undefined,
		"pfs-gcd:SoftwareVendor": text("pfs-gcd:SoftwareVendor", input.softwareVendor),
	});

	const identification: BiztaxNode[] = [
		entityInformation,
		item({
			concept: "PeriodStartDate",
			value: input.period.startDate,
			at: "start",
		}),
		item({ concept: "PeriodEndDate", value: input.period.endDate, at: "end" }),
		item({ concept: "AssessmentYear", value: String(module.assessmentYear) }),
		item({ concept: "TaxReturnType", value: RETURN_NAME[input.language] }),
		documentInformation,
	].filter((node) => node !== undefined);

	// One fact per concept, moment and set of members.
	const reported = new Set<string>();
	const lines = input.facts.map((fact) => {
		const built = item(fact);
		const key = factKey(built);
		if (reported.has(key)) {
			throw new BiztaxBuildError(
				`${built.name} is given more than once for the same context`,
			);
		}
		reported.add(key);
		return built;
	});

	return { input, module, entityIdentifier, facts: [...identification, ...lines] };
}

/**
 * The hypercubes of the taxonomy are closed: a fact carries exactly the
 * dimensions of one of its concept's cubes, no more and no fewer.
 */
function checkDimensions(
	module: TaxonomyModule,
	concept: ItemConcept,
	dimensions: Readonly<Record<QualifiedName, string>>,
): void {
	const given = sortedKeys(dimensions);
	const allowed = (concept.cubes ?? []).map(
		(index) => module.cubes[index]?.dimensions ?? [],
	);
	if (allowed.length === 0) allowed.push([]);
	const fits = allowed.some(
		(cube) =>
			cube.length === given.length && cube.every((name, i) => name === given[i]),
	);
	if (!fits) {
		const options = allowed
			.map((cube) => (cube.length ? cube.join(" + ") : "none"))
			.join(", or ");
		throw new BiztaxBuildError(
			`${concept.name} was given the dimensions [${given.join(", ")}] but takes ${options}`,
		);
	}
	for (const name of given) {
		const dimension = module.dimensions[name];
		const member = dimensions[name];
		if (
			dimension?.members &&
			(member === undefined || !dimension.members.includes(member))
		) {
			throw new BiztaxBuildError(`"${member}" is not a member of ${name}`);
		}
	}
}

/** Every item of a return, tuples flattened away. */
export function biztaxItems(nodes: readonly BiztaxNode[]): BiztaxItem[] {
	return nodes.flatMap((node) =>
		node.kind === "item" ? [node] : biztaxItems(node.children),
	);
}
