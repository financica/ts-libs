import type { NbbFact } from "./build.js";
import type { Datapoint, TaxonomyModule } from "./taxonomy.js";
import type {
	Address,
	CommitmentLine,
	InvesteeAccounts,
	Director,
	LegalPerson,
	MissionNature,
	NaturalPerson,
	NbbFilingInput,
	RelatedEntity,
	Representative,
} from "./types.js";

/**
 * Sections 2.1, 2.2, 6.3, 6.4, 6.6, 7.1 and 7.2: the parts of a filing that are
 * people, rows and text rather than rubric amounts.
 *
 * The cells are addressed the way the definition linkbase declares them, as a
 * metric plus explicit members, and looked up in the model's own datapoint
 * table. A model without the section has no such cell, and the input is
 * refused with a finding on the field rather than filed into a cell the entry
 * point does not declare. Mapping verified against the m87 hypercubes of
 * releases 25.0 and 26.0, which are identical for these sections, and against
 * the typed members of an accepted m87 filing.
 *
 * Repeatable rows are typed dimensions. A person's facts are grouped by their
 * name (`dim:annp` + `dim:afnp` for a director who is a natural person), and a
 * list within a row — mandates, missions, lines — by `dim:open`, numbered
 * from 1.
 */

/** A disclosure the model cannot carry, or a value it cannot take. */
export interface DisclosureFinding {
	severity: "error" | "warning";
	/**
	 * The NBB's identifier for the rule, where the finding is one of the
	 * model's completeness rules (`oa_02.01.0_0017`); absent for this
	 * package's own checks on the input.
	 */
	check?: string;
	field: string;
	message: string;
}

/**
 * Identifiers of the m87 completeness rules (`m87-f-other-formula.xml`) a
 * person row can break, per block of section 2. The same in 25.0 and 26.0;
 * the Arelle parity test is what keeps them honest.
 */
interface PersonRules {
	/** No fact about the person at all: their mandates or missions dangle. */
	created: string;
	addressType: string;
	street: string;
	houseNumber: string;
	country: string;
	/** A legal person at a Belgian address without an enterprise number. */
	belgianNumber?: string;
	membership?: string;
}

/**
 * The functions a section 2.1 mandate may name: the `fct-enum:list1` members
 * of releases 25.0 and 26.0. Labels are in {@link ENUMERATIONS}`.fct`.
 */
export const MANDATE_FUNCTIONS = [
	"m10",
	"m11",
	"m13",
	"m14",
	"m20",
	"m30",
	"m40",
	"m60",
	"m61",
	"m63",
	"m70",
	"m71",
	"m72",
	"m73",
	"m80",
	"m81",
] as const;

const MISSIONS: ReadonlySet<MissionNature> = new Set(["A", "B", "C", "D"]);
const PUBLICATION_CODES = ["A", "B", "D"] as const;

/** The `psn` member and typed name dimensions of each block of persons. */
const PERSON_BLOCKS = {
	director: {
		natural: { psn: "psn:m12", typed: ["dim:annp", "dim:afnp"] },
		legal: { psn: "psn:m10", typed: ["dim:anlp"] },
		representative: { psn: "psn:m11", typed: ["dim:aprn", "dim:aprf"] },
	},
	auditor: {
		natural: { psn: "psn:m15", typed: ["dim:acnp", "dim:acfn"] },
		legal: { psn: "psn:m13", typed: ["dim:aclp"] },
		representative: { psn: "psn:m14", typed: ["dim:cprn", "dim:cprf"] },
	},
	practitioner: {
		natural: { psn: "psn:m19", typed: ["dim:sann", "dim:safn"] },
		legal: { psn: "psn:m17", typed: ["dim:sanl"] },
		representative: { psn: "psn:m18", typed: ["dim:sprn", "dim:sprf"] },
	},
} as const;

const PERSON_RULES: Readonly<
	Record<keyof typeof PERSON_BLOCKS, Record<"natural" | "legal", PersonRules>>
> = {
	director: {
		natural: {
			created: "oa_02.01.0_0059",
			addressType: "oa_02.01.0_0017",
			street: "oa_02.01.0_0019",
			houseNumber: "oa_02.01.0_0020",
			country: "oa_02.01.0_0022",
		},
		legal: {
			created: "oa_02.01.0_0058",
			belgianNumber: "oa_02.01.0_0003",
			addressType: "oa_02.01.0_0004",
			street: "oa_02.01.0_0006",
			houseNumber: "oa_02.01.0_0007",
			country: "oa_02.01.0_0009",
		},
	},
	auditor: {
		natural: {
			created: "oa_02.01.0_0062",
			addressType: "oa_02.01.0_0047",
			street: "oa_02.01.0_0049",
			houseNumber: "oa_02.01.0_0050",
			country: "oa_02.01.0_0052",
			membership: "oa_02.01.0_0054",
		},
		legal: {
			created: "oa_02.01.0_0061",
			belgianNumber: "oa_02.01.0_0028",
			addressType: "oa_02.01.0_0029",
			street: "oa_02.01.0_0031",
			houseNumber: "oa_02.01.0_0032",
			country: "oa_02.01.0_0034",
			membership: "oa_02.01.0_0036",
		},
	},
	practitioner: {
		natural: {
			created: "oa_02.02.0_0026",
			addressType: "oa_02.02.0_0016",
			street: "oa_02.02.0_0018",
			houseNumber: "oa_02.02.0_0019",
			country: "oa_02.02.0_0021",
			membership: "oa_02.02.0_0023",
		},
		legal: {
			created: "oa_02.02.0_0025",
			belgianNumber: "oa_02.02.0_0003",
			addressType: "oa_02.02.0_0004",
			street: "oa_02.02.0_0006",
			houseNumber: "oa_02.02.0_0007",
			country: "oa_02.02.0_0009",
			membership: "oa_02.02.0_0011",
		},
	},
};

/** The 7.1 and 7.2 completeness rules. */
const ENTITY_RULES = {
	participation: {
		created: "oa_07.01.0_0018",
		belgianNumber: "oa_07.01.0_0003",
		country: "oa_07.01.0_0006",
		ownNumber: "oa_07.01.0_0012",
		heldDirectly: "oa_07.01.0_0015",
		accountsDate: "oa_07.01.0_0008",
		accountsEquity: "oa_07.01.0_0009",
		accountsResult: "oa_07.01.0_0010",
		accountsCurrency: "oa_07.01.0_0011",
	},
	unlimited: {
		belgianNumber: "oa_07.02.0_0003",
		legalForm: "oa_07.02.0_0004",
		country: "oa_07.02.0_0007",
	},
} as const;

type Block = keyof typeof PERSON_BLOCKS;
type Dims = Readonly<Record<string, string>>;

/** Sorted `dimension=member` signature, without the part, which the cell fixes. */
const signature = (dimensions: Dims) =>
	Object.entries(dimensions)
		.filter(([dimension]) => dimension !== "dim:part")
		.map(([dimension, member]) => `${dimension}=${member}`)
		.sort()
		.join(",");

const cellKey = (metric: string, dimensions: Dims) =>
	`${metric}|${signature(dimensions)}`;

/** True for a ten-digit KBO/BCE number whose check digits hold. */
export function isEnterpriseNumber(value: string): boolean {
	if (!/^[01]\d{9}$/.test(value)) return false;
	return 97 - (Number(value.slice(0, 8)) % 97) === Number(value.slice(8));
}

const isDate = (value: string) =>
	/^([1-9]\d{3})-(0[1-9]|1[012])-(0[1-9]|[12]\d|3[01])$/.test(value) &&
	value >= "1800-01-01" &&
	value <= "2049-12-31";

/** A token as `nonEmptyTokenStringItemType` reads it: whitespace collapsed. */
const token = (value: string) => value.replace(/\s+/g, " ").trim();

const formatAmount = (value: number) => value.toFixed(2);

/** The member with its `m`, whether or not the caller wrote one. */
const member = (domain: string, code: string) =>
	`${domain}:${code.trim().startsWith("m") ? code.trim() : `m${code.trim()}`}`;

class Emitter {
	readonly facts: NbbFact[] = [];
	readonly findings: DisclosureFinding[] = [];
	private readonly cells = new Map<string, Datapoint>();

	constructor(private readonly taxonomy: TaxonomyModule) {
		for (const datapoint of taxonomy.datapoints) {
			const metric = `${datapoint.metricPrefix ?? "met"}:${datapoint.metric}`;
			this.cells.set(cellKey(metric, datapoint.dimensions), datapoint);
		}
	}

	has(metric: string, dimensions: Dims): boolean {
		return this.cells.has(cellKey(metric, dimensions));
	}

	error(field: string, message: string): void {
		this.findings.push({ severity: "error", field, message });
	}

	warn(field: string, message: string): void {
		this.findings.push({ severity: "warning", field, message });
	}

	/** A breach of one of the model's own completeness rules. */
	rule(
		check: string,
		field: string,
		message: string,
		severity: "error" | "warning" = "error",
	): void {
		this.findings.push({ severity, check, field, message });
	}

	/**
	 * Refuses a block the model has no cell for, once, rather than a finding
	 * per field. Returns whether the block can be filed.
	 */
	supports(field: string, metric: string, dimensions: Dims, what: string): boolean {
		if (this.has(metric, dimensions)) return true;
		this.error(
			field,
			`${what} is not part of model ${this.taxonomy.model}-${this.taxonomy.part}`,
		);
		return false;
	}

	emit(
		field: string,
		metric: string,
		dimensions: Dims,
		value: string,
		options: {
			typed?: Readonly<Record<string, string>>;
			period?: "current";
			unit?: string;
		} = {},
	): void {
		const datapoint = this.cells.get(cellKey(metric, dimensions));
		if (!datapoint) {
			this.error(
				field,
				`model ${this.taxonomy.model}-${this.taxonomy.part} has no cell for this field`,
			);
			return;
		}
		const typed = options.typed ?? {};
		const expected = [...(datapoint.openDimensions ?? [])].sort().join(",");
		if (Object.keys(typed).sort().join(",") !== expected) {
			// The mapping and the generated table disagree; a fact without the
			// typed members its cube requires is dimensionally invalid.
			this.error(field, `the cell requires typed members [${expected}]`);
			return;
		}
		this.facts.push({
			datapoint,
			value,
			...(options.period ? { period: options.period } : {}),
			...(Object.keys(typed).length > 0 ? { typedMembers: typed } : {}),
			...(options.unit ? { unit: options.unit } : {}),
		});
	}

	/** A required free-text token; an empty one is a finding, not a fact. */
	text(
		field: string,
		metric: string,
		dimensions: Dims,
		value: string | undefined,
		typed?: Readonly<Record<string, string>>,
	): void {
		if (value === undefined) return;
		const cleaned = metric === "met:str1" ? value : token(value);
		if (cleaned.trim() === "") {
			this.error(field, "must not be empty");
			return;
		}
		this.emit(field, metric, dimensions, cleaned, typed ? { typed } : {});
	}

	date(
		field: string,
		dimensions: Dims,
		value: string | undefined,
		typed: Readonly<Record<string, string>>,
	): void {
		if (value === undefined) return;
		if (!isDate(value)) {
			this.error(field, `"${value}" is not a date between 1800 and 2049`);
			return;
		}
		this.emit(field, "met:dte1", dimensions, value, { typed });
	}
}

/** Address cells: street, number, box, city, postal code and country. */
function emitAddress(
	out: Emitter,
	field: string,
	base: Dims,
	address: Address,
	typed: Readonly<Record<string, string>>,
	options: { addressType: boolean; rules?: PersonRules },
): void {
	const at = (ctc: string) => ({ ...base, "dim:bas": "bas:m31", "dim:ctc": ctc });
	// Street and number are mandatory where the model has a rule for them.
	const rules = options.rules;
	if (rules && address.street.trim() === "") {
		out.rule(rules.street, `${field}.street`, "the street is required");
	}
	if (rules && address.houseNumber.trim() === "") {
		out.rule(
			rules.houseNumber,
			`${field}.houseNumber`,
			"the house number is required",
		);
	}
	if (options.addressType) {
		// Head office or domicile, which is what an accepted filing states.
		out.emit(
			`${field}`,
			"atc-enum:list1",
			{ ...base, "dim:bas": "bas:m31", "dim:dcl": "dcl:m7" },
			"atc:m001",
			{ typed },
		);
	}
	if (!rules || address.street.trim() !== "") {
		out.text(`${field}.street`, "met:str2", at("ctc:m1"), address.street, typed);
	}
	if (!rules || address.houseNumber.trim() !== "") {
		out.text(
			`${field}.houseNumber`,
			"met:str2",
			at("ctc:m2"),
			address.houseNumber,
			typed,
		);
	}
	out.text(`${field}.postbox`, "met:str2", at("ctc:m3"), address.postbox, typed);
	out.text(`${field}.city`, "met:str2", at("ctc:m5"), address.city, typed);

	const country = (address.country ?? "BE").trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(country)) {
		out.error(`${field}.country`, `"${address.country}" is not an ISO 3166 code`);
	} else {
		out.emit(
			`${field}.country`,
			"cty-enum:list1",
			at("ctc:m6"),
			`cty:m${country}`,
			{
				typed,
			},
		);
	}
	const postalCode = address.postalCode.trim();
	if (country === "BE") {
		if (!/^[1-9]\d{3}$/.test(postalCode)) {
			out.error(
				`${field}.postalCode`,
				`"${postalCode}" is not a Belgian postal code`,
			);
		} else {
			out.emit(
				`${field}.postalCode`,
				"pcd-enum:list1",
				at("ctc:m4"),
				`pcd:m${postalCode}`,
				{ typed },
			);
		}
	} else {
		// The list holds Belgian codes only; the cell takes free text beside it.
		out.text(`${field}.postalCode`, "met:str2", at("ctc:m4"), postalCode, typed);
	}
}

/** Enterprise number: the number type, then the number. */
function emitEnterpriseNumber(
	out: Emitter,
	field: string,
	base: Dims,
	value: string | undefined,
	typed: Readonly<Record<string, string>>,
): void {
	if (value === undefined) return;
	if (!isEnterpriseNumber(value)) {
		out.error(field, `"${value}" is not a valid ten-digit enterprise number`);
		return;
	}
	out.emit(
		field,
		"nmt-enum:list1",
		{ ...base, "dim:bas": "bas:m26", "dim:dcl": "dcl:m7" },
		"nmt:m1",
		{
			typed,
		},
	);
	out.emit(
		field,
		"met:str2",
		{ ...base, "dim:bas": "bas:m26", "dim:qlt": "qlt:m1" },
		value,
		{
			typed,
		},
	);
}

const profession = (base: Dims): Dims => ({
	...base,
	"dim:bas": "bas:m28",
	"dim:dcl": "dcl:m27",
});
const membership = (base: Dims): Dims => ({
	...base,
	"dim:bas": "bas:m34",
	"dim:qlt": "qlt:m5",
});

/**
 * A person's identity and address cells, plus their representatives'. Returns
 * the typed members that key the person's row, for the mandates or missions
 * that follow it.
 */
function emitPerson(
	out: Emitter,
	field: string,
	block: Block,
	holder: NaturalPerson | LegalPerson,
): Readonly<Record<string, string>> {
	const blocks = PERSON_BLOCKS[block];
	const rules = PERSON_RULES[block][holder.kind];
	const membershipAllowed = block !== "director";
	const before = out.facts.length;
	const typed = emitHolder(out, field, blocks, rules, holder, membershipAllowed);
	checkHolder(out, `${field}.holder`, rules, holder, out.facts.length > before);
	if (holder.kind === "legal") {
		emitRepresentatives(out, field, blocks, typed, holder, membershipAllowed);
	}
	return typed;
}

/**
 * The model's completeness rules for a holder, as the NBB applies them. A
 * holder with no fact of their own is reported once, as not created, which is
 * what the NBB says instead of listing every missing cell; otherwise each
 * missing mandatory cell is its own rule.
 */
function checkHolder(
	out: Emitter,
	field: string,
	rules: PersonRules,
	holder: NaturalPerson | LegalPerson,
	created: boolean,
): void {
	if (!created) {
		out.rule(
			rules.created,
			field,
			"give the holder's address (and number or profession) so their row exists",
		);
		return;
	}
	if (!holder.address) {
		out.rule(rules.addressType, `${field}.address`, "the address is required");
		out.rule(rules.street, `${field}.address.street`, "the street is required");
		out.rule(
			rules.houseNumber,
			`${field}.address.houseNumber`,
			"the house number is required",
		);
		out.rule(rules.country, `${field}.address.country`, "the country is required");
	}
	if (
		holder.kind === "legal" &&
		rules.belgianNumber &&
		holder.address &&
		(holder.address.country ?? "BE").trim().toUpperCase() === "BE" &&
		holder.enterpriseNumber === undefined
	) {
		out.rule(
			rules.belgianNumber,
			`${field}.enterpriseNumber`,
			"a legal person at a Belgian address needs its enterprise number",
		);
	}
	if (rules.membership && holder.memberNumber === undefined) {
		out.rule(
			rules.membership,
			`${field}.memberNumber`,
			"the membership number is required",
		);
	}
}

/** The holder's own cells. Returns the typed members that key their row. */
function emitHolder(
	out: Emitter,
	field: string,
	blocks: (typeof PERSON_BLOCKS)[Block],
	rules: PersonRules,
	holder: NaturalPerson | LegalPerson,
	membershipAllowed: boolean,
): Readonly<Record<string, string>> {
	if (holder.kind === "natural") {
		const {
			psn,
			typed: [last, first],
		} = blocks.natural;
		const base = { "dim:psn": psn };
		const typed = {
			[last]: token(holder.lastName),
			[first]: token(holder.firstName),
		};
		if (!typed[last] || !typed[first])
			out.error(`${field}.holder`, "a name is required");
		out.text(
			`${field}.holder.profession`,
			"met:str2",
			profession(base),
			holder.profession,
			typed,
		);
		if (holder.memberNumber !== undefined && !membershipAllowed) {
			out.error(
				`${field}.holder.memberNumber`,
				"the model has no membership number for a director",
			);
		} else {
			out.text(
				`${field}.holder.memberNumber`,
				"met:str2",
				membership(base),
				holder.memberNumber,
				typed,
			);
		}
		if (holder.address) {
			emitAddress(out, `${field}.holder.address`, base, holder.address, typed, {
				addressType: true,
				rules,
			});
		}
		return typed;
	}

	const {
		psn,
		typed: [name],
	} = blocks.legal;
	const base = { "dim:psn": psn };
	const typed = { [name]: token(holder.name) };
	if (!typed[name]) out.error(`${field}.holder.name`, "a name is required");
	emitEnterpriseNumber(
		out,
		`${field}.holder.enterpriseNumber`,
		base,
		holder.enterpriseNumber,
		typed,
	);
	if (holder.memberNumber !== undefined && !membershipAllowed) {
		out.error(
			`${field}.holder.memberNumber`,
			"the model has no membership number for a director",
		);
	} else {
		out.text(
			`${field}.holder.memberNumber`,
			"met:str2",
			membership(base),
			holder.memberNumber,
			typed,
		);
	}
	if (holder.address) {
		emitAddress(out, `${field}.holder.address`, base, holder.address, typed, {
			addressType: true,
			rules,
		});
	}
	return typed;
}

/** A legal holder's permanent representatives, keyed under the holder's name. */
function emitRepresentatives(
	out: Emitter,
	field: string,
	blocks: (typeof PERSON_BLOCKS)[Block],
	typed: Readonly<Record<string, string>>,
	holder: LegalPerson,
	membershipAllowed: boolean,
): void {
	const seen = new Set<string>();
	(holder.representatives ?? []).forEach((representative: Representative, index) => {
		const at = `${field}.holder.representatives[${index}]`;
		const {
			psn: repPsn,
			typed: [repLast, repFirst],
		} = blocks.representative;
		const repBase = { "dim:psn": repPsn };
		const repTyped = {
			...typed,
			[repLast]: token(representative.lastName),
			[repFirst]: token(representative.firstName),
		};
		const identity = `${repTyped[repLast]}|${repTyped[repFirst]}`;
		if (seen.has(identity)) {
			out.error(at, "the same representative is listed twice");
			return;
		}
		seen.add(identity);
		const before = out.facts.length;
		out.text(
			`${at}.profession`,
			"met:str2",
			profession(repBase),
			representative.profession,
			repTyped,
		);
		if (representative.memberNumber !== undefined && !membershipAllowed) {
			out.error(
				`${at}.memberNumber`,
				"the model has no membership number for a director",
			);
		} else {
			out.text(
				`${at}.memberNumber`,
				"met:str2",
				membership(repBase),
				representative.memberNumber,
				repTyped,
			);
		}
		if (representative.address) {
			emitAddress(
				out,
				`${at}.address`,
				repBase,
				representative.address,
				repTyped,
				{
					addressType: true,
				},
			);
		}
		// A representative is known only through these cells; with none of
		// them, the row would vanish from the filing without a word.
		if (out.facts.length === before) {
			out.error(
				at,
				"a representative needs an address, a profession or a membership number",
			);
		}
	});
}

const personPsn = (block: Block, holder: NaturalPerson | LegalPerson) =>
	PERSON_BLOCKS[block][holder.kind].psn;

const identityOf = (holder: NaturalPerson | LegalPerson) =>
	holder.kind === "natural"
		? `natural|${token(holder.lastName)}|${token(holder.firstName)}`
		: `legal|${token(holder.name)}`;

/** Section 2.1. */
function emitDirectors(out: Emitter, directors: readonly Director[]): void {
	const anchor = { "dim:psn": "psn:m12", "dim:bas": "bas:m115", "dim:dcl": "dcl:m6" };
	if (!out.supports("directors", "fct-enum:list1", anchor, "Section 2.1 (directors)"))
		return;
	const seen = new Set<string>();
	directors.forEach((director, index) => {
		const field = `directors[${index}]`;
		const block = director.role ?? "director";
		const identity = `${block}|${identityOf(director.holder)}`;
		if (seen.has(identity)) {
			out.error(
				field,
				"the same holder is listed twice in this role; list each mandate under one entry",
			);
			return;
		}
		seen.add(identity);
		if (director.mandates.length === 0)
			out.error(`${field}.mandates`, "at least one mandate is required");
		const typed = emitPerson(out, field, block, director.holder);
		const base = {
			"dim:psn": personPsn(block, director.holder),
			"dim:bas": "bas:m115",
		};
		director.mandates.forEach((mandate, line) => {
			const at = `${field}.mandates[${line}]`;
			const rowTyped = { ...typed, "dim:open": String(line + 1) };
			const code = member("fct", mandate.function);
			if (!(MANDATE_FUNCTIONS as readonly string[]).includes(code.slice(4))) {
				out.error(
					`${at}.function`,
					`"${mandate.function}" is not a function the model lists`,
				);
			} else {
				out.emit(
					`${at}.function`,
					"fct-enum:list1",
					{ ...base, "dim:dcl": "dcl:m6" },
					code,
					{
						typed: rowTyped,
					},
				);
			}
			out.date(
				`${at}.start`,
				{ ...base, "dim:mmt": "mmt:m1" },
				mandate.start,
				rowTyped,
			);
			out.date(
				`${at}.end`,
				{ ...base, "dim:mmt": "mmt:m2" },
				mandate.end,
				rowTyped,
			);
			if (mandate.start && mandate.end && mandate.end < mandate.start) {
				out.error(`${at}.end`, "the mandate ends before it starts");
			}
		});
	});
}

/** Section 2.2. */
function emitAccountantDeclaration(
	out: Emitter,
	declaration: NonNullable<NbbFilingInput["accountantDeclaration"]>,
): void {
	const answer = { "dim:psn": "psn:m16", "dim:bas": "bas:m28", "dim:dcl": "dcl:m28" };
	if (
		!out.supports(
			"accountantDeclaration",
			"met:bln1",
			answer,
			"Section 2.2 (accountant declaration)",
		)
	) {
		return;
	}
	out.emit(
		"accountantDeclaration.missionEntrusted",
		"met:bln1",
		answer,
		String(declaration.missionEntrusted),
	);
	const practitioners = declaration.practitioners ?? [];
	if (
		declaration.missionEntrusted &&
		!practitioners.some((practitioner) =>
			practitioner.missions.some((mission) => mission === "C" || mission === "D"),
		)
	) {
		out.error(
			"accountantDeclaration.practitioners",
			"a verification or correction mission was entrusted, but no practitioner lists C or D",
		);
	}
	const seen = new Set<string>();
	practitioners.forEach((practitioner, index) => {
		const field = `accountantDeclaration.practitioners[${index}]`;
		const identity = identityOf(practitioner.holder);
		if (seen.has(identity)) {
			out.error(
				field,
				"the same practitioner is listed twice; list every mission under one entry",
			);
			return;
		}
		seen.add(identity);
		if (practitioner.missions.length === 0) {
			out.error(`${field}.missions`, "at least one mission is required");
		}
		const typed = emitPerson(out, field, "practitioner", practitioner.holder);
		const base = {
			"dim:psn": personPsn("practitioner", practitioner.holder),
			"dim:bas": "bas:m28",
			"dim:dcl": "dcl:m29",
		};
		[...new Set(practitioner.missions)].forEach((mission, line) => {
			if (!MISSIONS.has(mission)) {
				out.error(
					`${field}.missions[${line}]`,
					`"${mission}" is not a mission code (A, B, C or D)`,
				);
				return;
			}
			out.emit(
				`${field}.missions[${line}]`,
				"nmc-enum:list1",
				base,
				`nmc:m${mission}`,
				{
					typed: { ...typed, "dim:open": String(line + 1) },
				},
			);
		});
	});
}

/** A 6.3 list of described commitments, numbered by `dim:open`. */
function emitCommitments(
	out: Emitter,
	field: string,
	lines: readonly CommitmentLine[],
	cells: {
		text: Dims;
		amount: Dims;
		amountMetric: "met:am1" | "met:am2";
		textPeriod: boolean;
	},
): void {
	lines.forEach((line, index) => {
		const at = `${field}[${index}]`;
		const typed = { "dim:open": String(index + 1) };
		if (line.description.trim() === "") {
			out.error(`${at}.description`, "must not be empty");
		} else {
			out.emit(`${at}.description`, "met:str1", cells.text, line.description, {
				typed,
				...(cells.textPeriod ? { period: "current" as const } : {}),
			});
		}
		if (line.amount === undefined) return;
		if (cells.amountMetric === "met:am1" && line.amount < 0) {
			out.error(`${at}.amount`, "must not be negative");
			return;
		}
		out.emit(
			`${at}.amount`,
			cells.amountMetric,
			cells.amount,
			formatAmount(line.amount),
			{
				typed,
				period: "current",
			},
		);
	});
}

/** Sections 6.3, 6.4 and 6.6. */
function emitAnnex(
	out: Emitter,
	disclosures: NonNullable<NbbFilingInput["disclosures"]>,
): void {
	const off = disclosures.offBalanceSheet;
	if (off) {
		const litigation = { "dim:bas": "bas:m91", "dim:sts": "sts:m20" };
		if (off.litigationAndCommitments) {
			emitCommitments(
				out,
				"disclosures.offBalanceSheet.litigationAndCommitments",
				off.litigationAndCommitments,
				{
					text: { ...litigation, "dim:dcl": "dcl:m16" },
					amount: litigation,
					amountMetric: "met:am1",
					textPeriod: false,
				},
			);
		}
		const affiliates = {
			"dim:bas": "bas:m89",
			"dim:bnf": "bnf:m6",
			"dim:gtd": "gtd:m3",
			"dim:psn": "psn:m1",
			"dim:rls": "rls:m9",
			"dim:sts": "sts:m20",
		};
		if (off.commitmentsToAffiliates) {
			emitCommitments(
				out,
				"disclosures.offBalanceSheet.commitmentsToAffiliates",
				off.commitmentsToAffiliates,
				{
					text: { ...affiliates, "dim:dcl": "dcl:m16" },
					amount: affiliates,
					amountMetric: "met:am1",
					textPeriod: false,
				},
			);
		}
		// One cube holds both the text and the signed amount of each line, so
		// both carry the period and the description member.
		const other = {
			"dim:bas": "bas:m99",
			"dim:dcl": "dcl:m16",
			"dim:typ": "typ:m2",
		};
		if (off.other) {
			emitCommitments(out, "disclosures.offBalanceSheet.other", off.other, {
				text: other,
				amount: other,
				amountMetric: "met:am2",
				textPeriod: true,
			});
		}
		out.text(
			"disclosures.offBalanceSheet.pensionPlans",
			"met:str1",
			{ "dim:bas": "bas:m92", "dim:dcl": "dcl:m16" },
			off.pensionPlans,
		);
		out.text(
			"disclosures.offBalanceSheet.pensionCoverage",
			"met:str1",
			{ "dim:bas": "bas:m93", "dim:dcl": "dcl:m16", "dim:spec": "spec:m72" },
			off.pensionCoverage,
		);
		out.text(
			"disclosures.offBalanceSheet.pensionEstimateBasis",
			"met:str1",
			{ "dim:bas": "bas:m95", "dim:dcl": "dcl:m16", "dim:spec": "spec:m73" },
			off.pensionEstimateBasis,
		);
	}
	out.text(
		"disclosures.directorReceivableTerms",
		"met:str1",
		{
			"dim:bas": "bas:m9",
			"dim:dcl": "dcl:m18",
			"dim:psn": "psn:m5",
			"dim:spec": "spec:m74",
		},
		disclosures.directorReceivableTerms,
	);
	out.text(
		"disclosures.otherInformation",
		"met:str1",
		{ "dim:bas": "bas:m108", "dim:typ": "typ:m2" },
		disclosures.otherInformation,
	);
}

/** Identity, legal form and address of a 7.1 or 7.2 entity. */
function emitRelatedEntity(
	out: Emitter,
	field: string,
	base: Dims,
	entity: RelatedEntity,
	typed: Readonly<Record<string, string>>,
): void {
	emitEnterpriseNumber(
		out,
		`${field}.enterpriseNumber`,
		base,
		entity.enterpriseNumber,
		typed,
	);
	if (entity.legalForm !== undefined) {
		out.emit(
			`${field}.legalForm`,
			"lgf-enum:list1",
			{ ...base, "dim:bas": "bas:m30" },
			member("lgf", entity.legalForm),
			{
				typed,
			},
		);
	} else {
		out.text(
			`${field}.legalFormOther`,
			"met:str2",
			{ ...base, "dim:bas": "bas:m30" },
			entity.legalFormOther,
			typed,
		);
	}
	if (entity.address) {
		emitAddress(out, `${field}.address`, base, entity.address, typed, {
			addressType: false,
		});
	}
}

const isFraction = (value: number) =>
	value >= 0 &&
	value <= 1 &&
	Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-9;

/** Section 7.1. */
function emitParticipations(
	out: Emitter,
	participations: NonNullable<
		NonNullable<NbbFilingInput["disclosures"]>["participations"]
	>,
	ownNumber: string | undefined,
): void {
	const rules = ENTITY_RULES.participation;
	const base = { "dim:psn": "psn:m1", "dim:rls": "rls:m7" };
	const anchor = { ...base, "dim:bas": "bas:m117", "dim:dcl": "dcl:m7" };
	if (
		!out.supports(
			"disclosures.participations",
			"met:str2",
			anchor,
			"Section 7.1 (participations)",
		)
	) {
		return;
	}
	const seen = new Set<string>();
	participations.forEach((participation, index) => {
		const field = `disclosures.participations[${index}]`;
		const typed = { "dim:ptpn": token(participation.name) };
		if (!typed["dim:ptpn"]) {
			out.error(`${field}.name`, "a name is required");
			return;
		}
		if (seen.has(typed["dim:ptpn"])) {
			out.error(
				`${field}.name`,
				"two participations share this name; the model keys rows on it",
			);
			return;
		}
		seen.add(typed["dim:ptpn"]);
		const entityStart = out.facts.length;
		emitRelatedEntity(out, field, base, participation, typed);
		let entityFacts = out.facts.length - entityStart;

		if (participation.rights.length === 0)
			out.error(`${field}.rights`, "at least one class of rights is required");
		participation.rights.forEach((rights, line) => {
			const at = `${field}.rights[${line}]`;
			const rowTyped = { ...typed, "dim:open": String(line + 1) };
			const held = { ...base, "dim:bas": "bas:m117" };
			out.text(
				`${at}.nature`,
				"met:str2",
				{ ...held, "dim:dcl": "dcl:m7" },
				rights.nature,
				rowTyped,
			);
			if (rights.heldDirectly !== undefined) {
				// Zero is a valid lexical value the NBB refuses by rule; it is
				// reported and still rendered, like every other rule breach.
				if (rights.heldDirectly === 0) {
					out.rule(
						rules.heldDirectly,
						`${at}.heldDirectly`,
						"the number held directly must be greater than 0; leave it out instead",
					);
				}
				if (!Number.isInteger(rights.heldDirectly) || rights.heldDirectly < 0) {
					out.error(`${at}.heldDirectly`, "must be a whole, positive number");
				} else {
					out.emit(
						`${at}.heldDirectly`,
						"met:int2",
						{ ...held, "dim:spec": "spec:m87" },
						String(rights.heldDirectly),
						{
							typed: rowTyped,
						},
					);
				}
			}
			const percentage = (
				key: "percentageDirect" | "percentageThroughSubsidiaries",
				spec: string,
			) => {
				const value = rights[key];
				if (value === undefined) return;
				if (!isFraction(value)) {
					out.error(
						`${at}.${key}`,
						"must be a fraction between 0 and 1 with at most four decimals",
					);
					return;
				}
				out.emit(
					`${at}.${key}`,
					"met:pct1",
					{ ...held, "dim:spec": spec },
					String(Number(value.toFixed(4))),
					{
						typed: rowTyped,
					},
				);
			};
			percentage("percentageDirect", "spec:m87");
			percentage("percentageThroughSubsidiaries", "spec:m32");
		});

		const accountsStart = out.facts.length;
		if (participation.lastAccounts) {
			emitInvesteeAccounts(
				out,
				`${field}.lastAccounts`,
				base,
				participation.lastAccounts,
				typed,
			);
		}
		entityFacts += out.facts.length - accountsStart;

		// The NBB's completeness rules for the investee itself. Without a
		// single fact about it, its rights dangle, and that is all it reports.
		if (entityFacts === 0) {
			out.rule(
				rules.created,
				field,
				"give the investee's address, number or legal form",
			);
			return;
		}
		if (!participation.address) {
			out.rule(
				rules.country,
				`${field}.address.country`,
				"the country is required",
			);
		} else if (
			(participation.address.country ?? "BE").trim().toUpperCase() === "BE" &&
			participation.enterpriseNumber === undefined
		) {
			out.rule(
				rules.belgianNumber,
				`${field}.enterpriseNumber`,
				"an entity at a Belgian address needs its enterprise number",
			);
		}
		if (
			participation.enterpriseNumber !== undefined &&
			participation.enterpriseNumber === ownNumber
		) {
			out.rule(
				rules.ownNumber,
				`${field}.enterpriseNumber`,
				"the investee cannot be the filing company itself",
			);
		}
		if (!participation.lastAccounts) {
			const at = `${field}.lastAccounts`;
			out.rule(
				rules.accountsDate,
				`${at}.closingDate`,
				"the closing date of its last accounts should be given",
				"warning",
			);
			out.rule(
				rules.accountsEquity,
				`${at}.equity`,
				"its equity should be given",
				"warning",
			);
			out.rule(
				rules.accountsResult,
				`${at}.netResult`,
				"its net result should be given",
				"warning",
			);
			out.rule(
				rules.accountsCurrency,
				`${at}.currency`,
				"the currency of its accounts should be given",
				"warning",
			);
		}
	});
}

/** A 7.1 investee's last available accounts, in their own currency. */
function emitInvesteeAccounts(
	out: Emitter,
	at: string,
	base: Dims,
	accounts: InvesteeAccounts,
	typed: Readonly<Record<string, string>>,
): void {
	{
		out.date(
			`${at}.closingDate`,
			{
				...base,
				"dim:bas": "bas:m116",
				"dim:mmt": "mmt:m2",
				"dim:spec": "spec:m86",
			},
			accounts.closingDate,
			typed,
		);
		const currency = accounts.currency.trim().toUpperCase();
		if (!/^[A-Z]{3}$/.test(currency)) {
			out.error(
				`${at}.currency`,
				`"${accounts.currency}" is not an ISO 4217 code`,
			);
			return;
		}
		out.emit(`${at}.currency`, "ccy-enum:list1", base, `ccy:m${currency}`, {
			typed,
		});
		// In the investee's own currency, signed: a loss stays a loss.
		out.emit(
			`${at}.equity`,
			"met:am2",
			{ ...base, "dim:bas": "bas:m37", "dim:ntr": "ntr:m4" },
			formatAmount(accounts.equity),
			{
				typed,
				unit: currency,
			},
		);
		out.emit(
			`${at}.netResult`,
			"met:am2",
			{ ...base, "dim:bas": "bas:m44", "dim:ntr": "ntr:m9" },
			formatAmount(accounts.netResult),
			{
				typed,
				unit: currency,
			},
		);
	}
}

/** Section 7.2. */
function emitUnlimitedLiability(
	out: Emitter,
	entities: NonNullable<
		NonNullable<NbbFilingInput["disclosures"]>["unlimitedLiabilityEntities"]
	>,
): void {
	const base = { "dim:psn": "psn:m1", "dim:rls": "rls:m6" };
	const publication = { ...base, "dim:bas": "bas:m28", "dim:dcl": "dcl:m40" };
	if (
		!out.supports(
			"disclosures.unlimitedLiabilityEntities",
			"pub-enum:list2",
			publication,
			"Section 7.2 (unlimited-liability entities)",
		)
	) {
		return;
	}
	const seen = new Set<string>();
	entities.forEach((entity, index) => {
		const field = `disclosures.unlimitedLiabilityEntities[${index}]`;
		const typed = { "dim:curn": token(entity.name) };
		if (!typed["dim:curn"]) {
			out.error(`${field}.name`, "a name is required");
			return;
		}
		if (seen.has(typed["dim:curn"])) {
			out.error(
				`${field}.name`,
				"two entities share this name; the model keys rows on it",
			);
			return;
		}
		seen.add(typed["dim:curn"]);
		const before = out.facts.length;
		emitRelatedEntity(out, field, base, entity, typed);
		const rules = ENTITY_RULES.unlimited;
		if (entity.legalForm === undefined && entity.legalFormOther === undefined) {
			out.rule(
				rules.legalForm,
				`${field}.legalForm`,
				"the legal form is required",
			);
		}
		if (!entity.address) {
			out.rule(
				rules.country,
				`${field}.address.country`,
				"the country is required",
			);
		} else if (
			(entity.address.country ?? "BE").trim().toUpperCase() === "BE" &&
			entity.enterpriseNumber === undefined
		) {
			out.rule(
				rules.belgianNumber,
				`${field}.enterpriseNumber`,
				"an entity at a Belgian address needs its enterprise number",
			);
		}
		if (entity.publicationCode === undefined) {
			if (out.facts.length === before) {
				out.error(
					field,
					"an entity needs an enterprise number, a legal form or an address",
				);
			}
			// The model's own instruction: its accounts must be added to the
			// filing as another document. This package does not embed them.
			out.warn(
				`${field}.publicationCode`,
				`no publication code applies to "${typed["dim:curn"]}": its annual accounts must accompany this filing as an additional document`,
			);
			return;
		}
		if (
			!(PUBLICATION_CODES as readonly string[]).includes(entity.publicationCode)
		) {
			out.error(
				`${field}.publicationCode`,
				`"${entity.publicationCode}" is not A, B or D`,
			);
			return;
		}
		out.emit(
			`${field}.publicationCode`,
			"pub-enum:list2",
			publication,
			`pub:m${entity.publicationCode}`,
			{
				typed,
			},
		);
	});
}

/** What {@link buildDisclosures} reads from a filing. */
type DisclosureInput = Pick<
	NbbFilingInput,
	"taxonomy" | "directors" | "accountantDeclaration" | "disclosures"
> &
	Partial<Pick<NbbFilingInput, "entity">>;

/** The facts and findings for every disclosure the input carries. */
export function buildDisclosures(input: DisclosureInput): {
	facts: NbbFact[];
	findings: DisclosureFinding[];
} {
	const out = new Emitter(input.taxonomy);
	if (input.directors && input.directors.length > 0) {
		emitDirectors(out, input.directors);
	}
	if (input.accountantDeclaration) {
		emitAccountantDeclaration(out, input.accountantDeclaration);
	}
	const disclosures = input.disclosures;
	if (disclosures) {
		emitAnnex(out, disclosures);
		if (disclosures.participations && disclosures.participations.length > 0) {
			emitParticipations(
				out,
				disclosures.participations,
				input.entity?.enterpriseNumber,
			);
		}
		if (
			disclosures.unlimitedLiabilityEntities &&
			disclosures.unlimitedLiabilityEntities.length > 0
		) {
			emitUnlimitedLiability(out, disclosures.unlimitedLiabilityEntities);
		}
	}
	return { facts: out.facts, findings: out.findings };
}

const PROBE_ADDRESSES: readonly Address[] = [
	{
		street: "Rue",
		houseNumber: "1",
		postbox: "2",
		postalCode: "1000",
		city: "Bruxelles",
	},
	{
		street: "Straße",
		houseNumber: "1",
		postalCode: "10115",
		city: "Berlin",
		country: "DE",
	},
];

const probePerson = (address: Address): NaturalPerson => ({
	kind: "natural",
	firstName: "A",
	lastName: "B",
	profession: "P",
	address,
});

const probeFirm = (address: Address, memberNumber?: string): LegalPerson => ({
	kind: "legal",
	name: "F",
	enterpriseNumber: "0403170701",
	...(memberNumber ? { memberNumber } : {}),
	address,
	representatives: [
		{
			firstName: "R",
			lastName: "S",
			profession: "P",
			...(memberNumber ? { memberNumber } : {}),
			address,
		},
	],
});

/**
 * One fully populated input per disclosure, touching every cell the mapping
 * can write: both kinds of holder, a representative, a Belgian and a foreign
 * address, every optional field.
 */
const PROBES: Readonly<Record<string, Omit<DisclosureInput, "taxonomy">>> = {
	directors: {
		directors: PROBE_ADDRESSES.flatMap((address, index) => [
			{
				holder: { ...probePerson(address), lastName: `D${index}` },
				mandates: [{ function: "m13", start: "2020-01-01", end: "2030-01-01" }],
			},
			{
				holder: { ...probeFirm(address), name: `F${index}` },
				mandates: [{ function: "m30", start: "2020-01-01" }],
			},
			{
				role: "auditor" as const,
				holder: {
					...probePerson(address),
					lastName: `A${index}`,
					memberNumber: "1",
				},
				mandates: [{ function: "m61", start: "2020-01-01", end: "2030-01-01" }],
			},
			{
				role: "auditor" as const,
				holder: { ...probeFirm(address, "1"), name: `G${index}` },
				mandates: [{ function: "m61" }],
			},
		]),
	},
	accountantDeclaration: {
		accountantDeclaration: {
			missionEntrusted: true,
			practitioners: PROBE_ADDRESSES.flatMap((address, index) => [
				{
					holder: {
						...probePerson(address),
						lastName: `E${index}`,
						memberNumber: "1",
					},
					missions: ["A", "B", "C", "D"] as const,
				},
				{
					holder: { ...probeFirm(address, "1"), name: `H${index}` },
					missions: ["C"] as const,
				},
			]),
		},
	},
	offBalanceSheet: {
		disclosures: {
			offBalanceSheet: {
				litigationAndCommitments: [{ description: "x", amount: 1 }],
				commitmentsToAffiliates: [{ description: "x", amount: 1 }],
				pensionPlans: "x",
				pensionCoverage: "x",
				pensionEstimateBasis: "x",
				other: [{ description: "x", amount: -1 }],
			},
		},
	},
	directorReceivableTerms: { disclosures: { directorReceivableTerms: "x" } },
	otherInformation: { disclosures: { otherInformation: "x" } },
	participations: {
		disclosures: {
			participations: PROBE_ADDRESSES.map((address, index) => ({
				name: `P${index}`,
				enterpriseNumber: "0403170701",
				...(index === 0 ? { legalForm: "m610" } : { legalFormOther: "GmbH" }),
				address,
				rights: [
					{
						nature: "Parts",
						heldDirectly: 1,
						percentageDirect: 0.5,
						percentageThroughSubsidiaries: 0.1,
					},
				],
				lastAccounts: {
					closingDate: "2024-12-31",
					currency: "EUR",
					equity: 1,
					netResult: -1,
				},
			})),
		},
	},
	unlimitedLiabilityEntities: {
		disclosures: {
			unlimitedLiabilityEntities: PROBE_ADDRESSES.map((address, index) => ({
				name: `U${index}`,
				enterpriseNumber: "0403170701",
				...(index === 0 ? { legalForm: "m610" } : { legalFormOther: "KG" }),
				address,
				publicationCode: "A" as const,
			})),
		},
	},
};

/** The disclosures {@link disclosureCapabilities} reports on. */
export type DisclosureKind =
	| "directors"
	| "accountantDeclaration"
	| "offBalanceSheet"
	| "directorReceivableTerms"
	| "otherInformation"
	| "participations"
	| "unlimitedLiabilityEntities";

/**
 * Which disclosures a model and release can carry.
 *
 * Worked out by filing a fully populated probe of each against the model's own
 * datapoint table, through the same code an export takes: a disclosure is
 * supported only when every cell it can write exists, with the typed
 * dimensions the mapping supplies. What a caller shows a filer, so that a
 * section the chosen model does not have is hidden rather than offered and
 * then refused.
 */
export function disclosureCapabilities(
	taxonomy: TaxonomyModule,
): Readonly<Record<DisclosureKind, boolean>> {
	return Object.fromEntries(
		Object.entries(PROBES).map(([kind, probe]) => [
			kind,
			buildDisclosures({ taxonomy, ...probe }).findings.length === 0,
		]),
	) as Record<DisclosureKind, boolean>;
}
