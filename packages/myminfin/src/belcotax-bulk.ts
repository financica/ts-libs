// ---------------------------------------------------------------------------
// Belcotax-on-web 2.0 bulk (JSONL) generation, income 2026 onwards.
//
// A bulk is one JSON object per line. Resources (persons, organisations,
// contacts) and fiches each carry a caller-chosen key `k`; a fiche refers to its
// beneficiary (`b`), contact (`c`) and debtor (`d`) by those keys. Resending a
// key replaces what is stored under it, and the delete lines remove it. Every
// line names its JSON schema in `$s`; a fiche's schema is versioned by income
// year (`urn:f:d:<year>:<fiche>:<version>`), so each year needs its entry in
// FICHE_SCHEMA_VERSIONS once SPF publish its schemas.
//
// Source: SPF Finances' "Schémas JSON préouverture" and "Exemples fictifs pour
// les revenus 2026" (Belcotax-on-web technical documentation, October 2026).
// ---------------------------------------------------------------------------

/** A line's schema language: labels and feedback. Optional; SPF's examples set it on resources only. */
export type BelcotaxLanguage = "fr" | "nl" | "de";

type Optional<T> = T | null | undefined;

/** Schema version of the fiches, per income year. */
const FICHE_SCHEMA_VERSIONS: Readonly<Record<number, number>> = { 2026: 2 };

export interface BelcotaxAddress {
	box?: Optional<string>;
	number?: Optional<string>;
	street?: Optional<string>;
	city?: Optional<string>;
	postalCode?: Optional<string>;
	/** INS country code, three digits (Belgium is `150`). Not ISO. */
	country: string;
}

interface LineBase {
	/** Your key for this line's resource or fiche, 1 to 255 characters. */
	key: string;
	/** Overrides the bulk's `language` for this line. */
	language?: Optional<BelcotaxLanguage>;
}

/** Who to contact about the fiches (`urn:r:d:c:1`). */
export interface BelcotaxContact extends LineBase {
	type: "contact";
	firstNames?: Optional<readonly string[]>;
	lastNames?: Optional<readonly string[]>;
	email: string;
	preferredLanguage: BelcotaxLanguage;
	/** International form, `+` then 9 to 15 digits. */
	mobilePhone?: Optional<string>;
	landlinePhone?: Optional<string>;
}

/** A company, association or public body, as debtor or beneficiary (`urn:r:d:o:1`). */
export interface BelcotaxOrganisation extends LineBase {
	type: "organisation";
	ids?: Optional<{
		/** Ten digits, starting 0, 1 or 9. */
		enterpriseNumber?: Optional<string>;
		tin?: Optional<string>;
		/** With its country prefix, e.g. `FR83813952082`. */
		vatNumber?: Optional<string>;
		fiscalAssociationNumber?: Optional<string>;
		/** `V` and seven digits. */
		associationNumber?: Optional<string>;
	}>;
	/** At least one language. */
	names: { fr?: Optional<string>; nl?: Optional<string>; de?: Optional<string> };
	/** Abbreviated legal form, 1 to 15 capitals (`SRL`, `FPS`). */
	legalForm?: Optional<string>;
	address?: Optional<BelcotaxAddress>;
}

/** A natural person, as beneficiary or debtor (`urn:r:d:p:1`). */
export interface BelcotaxPerson extends LineBase {
	type: "person";
	ids?: Optional<{
		/** National register (or BIS) number, eleven digits. */
		ssin?: Optional<string>;
		/** Ten digits, starting 0 or 1. */
		enterpriseNumber?: Optional<string>;
		tin?: Optional<string>;
	}>;
	firstNames?: Optional<readonly string[]>;
	lastNames?: Optional<readonly string[]>;
	/** `YYYY-MM-DD`. */
	birthDate?: Optional<string>;
	birthPlace?: Optional<string>;
	address?: Optional<BelcotaxAddress>;
}

interface FicheBase extends LineBase {
	/** Key of the beneficiary's person or organisation resource. */
	beneficiary: string;
	/** Key of the contact resource. */
	contact: string;
	/** Key of the debtor's (the payer's) person or organisation resource. */
	debtor: string;
	/** Zone 2010, the fiche's sequence number. */
	sequenceNumber?: Optional<string>;
}

/**
 * 281.50: commissions, brokerage, fees and benefits paid to people outside
 * payroll. Amounts in euros; the totals and the computed zones (2064, 5100,
 * 5200, 5300) are SPF's and are never sent.
 */
export interface BelcotaxFiche28150 extends FicheBase {
	type: "281.50";
	/** 2031: "NEANT", no payment in the year. */
	noPayment?: Optional<boolean>;
	/** 2060, rubric a: commissions, brokerage, trade discounts. */
	commissions?: Optional<number>;
	/** 2061, rubric b: fees and attendance fees. */
	fees?: Optional<number>;
	/** 2062, rubric c: benefits of any kind, amount. */
	benefitsInKindAmount?: Optional<number>;
	/** 2103, rubric c: benefits of any kind, nature. */
	benefitsInKindNature?: Optional<string>;
	/** 2063, rubric d: expenses incurred on the beneficiary's behalf. */
	expensesOnBehalf?: Optional<number>;
	/** 2065, rubric f: amount actually paid in the year, when it differs from the total. */
	amountActuallyPaid?: Optional<number>;
	/** 2066: paid to athletes for their sporting performances. */
	sportsPerformers?: Optional<number>;
	/** 2067: paid to trainers, coaches and companions of athletes. */
	sportsTrainers?: Optional<number>;
	/** 2068: exempt guardianship allowances (FPS Justice only). */
	guardianshipAllowances?: Optional<number>;
	/** 2099: free-text details on the amounts. */
	amountsNote?: Optional<string>;
	/** 2107: the beneficiary's profession. */
	profession?: Optional<string>;
	/** 2205 = 3: cancels and replaces a fiche. */
	replacesFiche?: Optional<boolean>;
}

/** Benefits in kind ticked on a 281.20 (zone 2099). */
export type BelcotaxBenefitInKindCode =
	| "A" // loan
	| "B" // housing
	| "C" // heating
	| "D" // electricity (not heating)
	| "E" // food
	| "F" // vehicle
	| "H" // PC for private use
	| "I" // internet
	| "J" // tablet or mobile phone
	| "K" // phone subscription
	| "Z"; // other

const BENEFIT_IN_KIND_CODES: ReadonlySet<string> = new Set([
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"H",
	"I",
	"J",
	"K",
	"Z",
]);

/** Amount zones of the 281.20 (euros, cents). The schema's labels are sub-labels of the paper form's rubrics, so zones are addressed by code. */
type Fiche28120AmountZone =
	| "2060"
	| "2062"
	| "2064"
	| "2065"
	| "2067"
	| "2068"
	| "2069"
	| "2071"
	| "2073"
	| "2074"
	| "2076"
	| "2078"
	| "2079"
	| "2080"
	| "2081"
	| "2082"
	| "2083"
	| "2084"
	| "2087"
	| "2088"
	| "2128"
	| "2131"
	| "2133"
	| "2134"
	| "2181"
	| "2182"
	| "2183"
	| "2184"
	| "2195"
	| "2200"
	| "2201"
	| "2202"
	| "2203"
	| "2204"
	| "2206"
	| "2207"
	| "2208"
	| "2227"
	| "2229";

/** Overtime hours zones of the 281.20, capped at 120. */
type Fiche28120HoursZone = "2196" | "2228" | "2230";

/**
 * Every zone of the 281.20 a filer writes, by code. The totals and computed
 * zones (2063, 2066, 2075, 2209, 5100, 5200, 5300) are SPF's and absent.
 */
export type BelcotaxFiche28120Zones = {
	[Z in Fiche28120AmountZone | Fiche28120HoursZone]?: Optional<number>;
} & {
	/** "0" no effective cessation of business, "1" effective cessation. */
	"2031"?: Optional<"0" | "1">;
	/** Options granted by a foreign company without a Belgian establishment. */
	"2033"?: Optional<"0" | "1">;
	/** Supporting documents for a treaty exemption from withholding. */
	"2035"?: Optional<"0" | "1">;
	"2099"?: Optional<readonly BelcotaxBenefitInKindCode[]>;
	"2102"?: Optional<string>;
	"2103"?: Optional<string>;
	/** "1" replaces after gross recovery, "2" after net recovery, "3" replaces. */
	"2205"?: Optional<"1" | "2" | "3">;
	/** Kilometres, whole. */
	"2226"?: Optional<number>;
	/** Other codes: a three-digit code and its amount, at most ten. */
	"4020"?: Optional<readonly { readonly "2092": string; readonly "2185": number }[]>;
	/** Percentages as fractions (0 to 0.9999), at most ten. */
	"4220"?: Optional<readonly { readonly "2106": number }[]>;
};

/** 281.20: remuneration of company directors. */
export interface BelcotaxFiche28120 extends FicheBase {
	type: "281.20";
	zones: BelcotaxFiche28120Zones;
}

export interface BelcotaxDeleteFiche {
	type: "delete-fiche";
	key: string;
}

export interface BelcotaxDeleteResource {
	type: "delete-resource";
	key: string;
}

export type BelcotaxLine =
	| BelcotaxContact
	| BelcotaxOrganisation
	| BelcotaxPerson
	| BelcotaxFiche28150
	| BelcotaxFiche28120
	| BelcotaxDeleteFiche
	| BelcotaxDeleteResource;

export interface SerializeBelcotaxBulkOptions {
	/** The year the income was paid (fiches 2026 are filed in 2027). */
	incomeYear: number;
	/** Schema language for lines that do not set their own. Omitted, none is written. */
	language?: Optional<BelcotaxLanguage>;
}

type Json = string | number | boolean | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/**
 * Render a Belcotax-on-web 2.0 bulk: one JSON object per line, in the order
 * given (SPF's feedback cites line numbers, so line n is `lines[n - 1]`),
 * newline-terminated. Validates what the JSON schemas state and throws on the
 * first violation; SPF's business rules (which zones go together) are left to
 * SPF's validation and come back as feedback.
 */
export function serializeBelcotaxBulk(
	lines: readonly BelcotaxLine[],
	options: SerializeBelcotaxBulkOptions,
): string {
	const version = FICHE_SCHEMA_VERSIONS[options.incomeYear];
	if (version === undefined) {
		throw new Error(
			`No Belcotax fiche schema for income year ${options.incomeYear} (known: ${Object.keys(FICHE_SCHEMA_VERSIONS).join(", ")})`,
		);
	}
	if (lines.length === 0) throw new Error("A Belcotax bulk cannot be empty");

	const ficheKeys = new Set<string>();
	const resourceKeys = new Set<string>();

	return lines
		.map((line) => {
			assertKey(line.key);
			const language =
				line.type === "delete-fiche" || line.type === "delete-resource"
					? null
					: (line.language ?? options.language);
			const schema = (base: string) => (language ? `${base}:${language}` : base);
			switch (line.type) {
				case "delete-fiche":
					return { $s: "urn:f:x:1", k: line.key };
				case "delete-resource":
					return { $s: "urn:r:x:1", k: line.key };
				case "contact":
					claim(resourceKeys, "resource", line.key);
					return contactLine(line, schema("urn:r:d:c:1"));
				case "organisation":
					claim(resourceKeys, "resource", line.key);
					return organisationLine(line, schema("urn:r:d:o:1"));
				case "person":
					claim(resourceKeys, "resource", line.key);
					return personLine(line, schema("urn:r:d:p:1"));
				case "281.50":
					claim(ficheKeys, "fiche", line.key);
					return fiche28150Line(
						line,
						schema(`urn:f:d:${options.incomeYear}:50:${version}`),
					);
				case "281.20":
					claim(ficheKeys, "fiche", line.key);
					return fiche28120Line(
						line,
						schema(`urn:f:d:${options.incomeYear}:20:${version}`),
					);
			}
		})
		.map((line) => `${JSON.stringify(line)}\n`)
		.join("");
}

function claim(keys: Set<string>, what: string, key: string): void {
	if (keys.has(key))
		throw new Error(`Belcotax bulk has a duplicate ${what} key ${key}`);
	keys.add(key);
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const SSIN =
	/^[0-9]{2}(0[0-9]|1[0-2]|2[0-9]|3[0-2]|4[0-9]|5[0-2])([0-2][0-9]|3[01])[0-9]{3}([0-8][0-9]|9[0-7])$/;
const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE = /^\+[0-9]{9,15}$/;
const ALNUM = /^[a-zA-Z0-9]*$/;

function contactLine(line: BelcotaxContact, $s: string): JsonObject {
	if (!EMAIL.test(line.email)) {
		throw new Error(`Contact ${line.key}: invalid e-mail address ${line.email}`);
	}
	const phones: JsonObject = {};
	setIf(
		phones,
		"m",
		checked(line.mobilePhone, PHONE, `Contact ${line.key}: mobile phone`),
	);
	setIf(
		phones,
		"l",
		checked(line.landlinePhone, PHONE, `Contact ${line.key}: landline phone`),
	);
	const out: JsonObject = { $s, k: line.key };
	setIf(out, "fn", names(line.firstNames, `Contact ${line.key}: first names`));
	setIf(out, "ln", names(line.lastNames, `Contact ${line.key}: last names`));
	out["e"] = line.email;
	if (Object.keys(phones).length > 0) out["p"] = phones;
	out["l"] = line.preferredLanguage;
	return out;
}

function organisationLine(line: BelcotaxOrganisation, $s: string): JsonObject {
	const where = `Organisation ${line.key}`;
	const ids: JsonObject = {};
	setIf(
		ids,
		"cbein",
		checked(
			line.ids?.enterpriseNumber,
			/^[019][0-9]{9}$/,
			`${where}: enterprise number`,
		),
	);
	setIf(ids, "tin", checked(line.ids?.tin, ALNUM, `${where}: TIN`));
	setIf(
		ids,
		"vat",
		checked(
			line.ids?.vatNumber,
			/^[A-Z]{2}[A-Z0-9]{1,23}$/,
			`${where}: VAT number`,
		),
	);
	setIf(
		ids,
		"fain",
		bounded(
			line.ids?.fiscalAssociationNumber,
			25,
			`${where}: fiscal association number`,
		),
	);
	setIf(
		ids,
		"vcode",
		checked(
			line.ids?.associationNumber,
			/^V[0-9]{7}$/,
			`${where}: association number`,
		),
	);

	const localized: JsonObject = {};
	for (const lang of ["fr", "nl", "de"] as const)
		setIf(localized, lang, present(line.names[lang]));
	if (Object.keys(localized).length === 0) {
		throw new Error(`${where}: needs a name in at least one language`);
	}

	const out: JsonObject = { $s, k: line.key };
	if (Object.keys(ids).length > 0) out["i"] = ids;
	out["n"] = localized;
	setIf(out, "f", checked(line.legalForm, /^[A-Z]{1,15}$/, `${where}: legal form`));
	setIf(out, "a", address(line.address, where));
	return out;
}

function personLine(line: BelcotaxPerson, $s: string): JsonObject {
	const where = `Person ${line.key}`;
	const ids: JsonObject = {};
	setIf(ids, "ssin", checked(line.ids?.ssin, SSIN, `${where}: SSIN`));
	setIf(
		ids,
		"cbein",
		checked(
			line.ids?.enterpriseNumber,
			/^[0-1][0-9]{9}$/,
			`${where}: enterprise number`,
		),
	);
	setIf(ids, "tin", checked(line.ids?.tin, ALNUM, `${where}: TIN`));

	const out: JsonObject = { $s, k: line.key };
	if (Object.keys(ids).length > 0) out["i"] = ids;
	setIf(out, "fn", names(line.firstNames, `${where}: first names`));
	setIf(out, "ln", names(line.lastNames, `${where}: last names`));
	setIf(
		out,
		"bd",
		checked(line.birthDate, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, `${where}: birth date`),
	);
	setIf(out, "bp", bounded(line.birthPlace, 255, `${where}: birth place`));
	setIf(out, "a", address(line.address, where));
	return out;
}

function address(
	value: Optional<BelcotaxAddress>,
	where: string,
): JsonObject | undefined {
	if (!value) return undefined;
	if (!/^[0-9]{3}$/.test(value.country)) {
		throw new Error(
			`${where}: address country must be a three-digit INS code, received ${value.country}`,
		);
	}
	const out: JsonObject = {};
	setIf(out, "b", bounded(value.box, 100, `${where}: address box`));
	setIf(out, "n", bounded(value.number, 20, `${where}: address number`));
	setIf(out, "s", bounded(value.street, 100, `${where}: address street`));
	setIf(out, "c", bounded(value.city, 100, `${where}: address city`));
	setIf(out, "p", bounded(value.postalCode, 50, `${where}: postal code`));
	out["l"] = value.country;
	return out;
}

// ---------------------------------------------------------------------------
// Fiches
// ---------------------------------------------------------------------------

function fiche28150Line(line: BelcotaxFiche28150, $s: string): JsonObject {
	const zones: JsonObject = {};
	setIf(zones, "2010", present(line.sequenceNumber));
	if (line.noPayment != null) zones["2031"] = line.noPayment ? "1" : "0";
	const amounts: [string, Optional<number>][] = [
		["2060", line.commissions],
		["2061", line.fees],
		["2062", line.benefitsInKindAmount],
		["2063", line.expensesOnBehalf],
		["2065", line.amountActuallyPaid],
		["2066", line.sportsPerformers],
		["2067", line.sportsTrainers],
		["2068", line.guardianshipAllowances],
	];
	for (const [zone, value] of amounts) setIf(zones, zone, decimal(value, zone, 2));
	setIf(zones, "2099", present(line.amountsNote));
	setIf(zones, "2103", present(line.benefitsInKindNature));
	setIf(zones, "2107", present(line.profession));
	if (line.replacesFiche) zones["2205"] = "3";
	return ficheLine($s, zones, line);
}

const AMOUNT_ZONES_28120: readonly Fiche28120AmountZone[] = [
	"2060",
	"2062",
	"2064",
	"2065",
	"2067",
	"2068",
	"2069",
	"2071",
	"2073",
	"2074",
	"2076",
	"2078",
	"2079",
	"2080",
	"2081",
	"2082",
	"2083",
	"2084",
	"2087",
	"2088",
	"2128",
	"2131",
	"2133",
	"2134",
	"2181",
	"2182",
	"2183",
	"2184",
	"2195",
	"2200",
	"2201",
	"2202",
	"2203",
	"2204",
	"2206",
	"2207",
	"2208",
	"2227",
	"2229",
];
const HOURS_ZONES_28120: readonly Fiche28120HoursZone[] = ["2196", "2228", "2230"];

function fiche28120Line(line: BelcotaxFiche28120, $s: string): JsonObject {
	const z = line.zones;
	const zones: JsonObject = {};
	setIf(zones, "2010", present(line.sequenceNumber));
	for (const zone of ["2031", "2033", "2035", "2102", "2103", "2205"] as const) {
		setIf(zones, zone, present(z[zone]));
	}
	for (const zone of AMOUNT_ZONES_28120)
		setIf(zones, zone, decimal(z[zone], zone, 2));
	for (const zone of HOURS_ZONES_28120) {
		const hours = decimal(z[zone], zone, 2);
		if (hours !== undefined && hours > 120) {
			throw new Error(
				`Zone ${zone} (overtime hours) is capped at 120, received ${hours}`,
			);
		}
		setIf(zones, zone, hours);
	}
	setIf(zones, "2226", decimal(z["2226"], "2226", 0));

	const benefits = z["2099"];
	if (benefits) {
		if (new Set(benefits).size !== benefits.length) {
			throw new Error(
				`Zone 2099 has a duplicate benefit-in-kind code: ${benefits.join(", ")}`,
			);
		}
		for (const code of benefits) {
			if (!BENEFIT_IN_KIND_CODES.has(code))
				throw new Error(`Zone 2099: unknown code ${code}`);
		}
		if (benefits.length > 0) zones["2099"] = [...benefits];
	}

	const otherCodes = z["4020"];
	if (otherCodes && otherCodes.length > 0) {
		atMostTen(otherCodes, "4020");
		zones["4020"] = otherCodes.map((entry) => {
			if (!/^[0-9]{3}$/.test(entry["2092"])) {
				throw new Error(
					`Zone 4020: code 2092 must be three digits, received ${entry["2092"]}`,
				);
			}
			return {
				"2092": entry["2092"],
				"2185": requiredDecimal(entry["2185"], "2185", 2),
			};
		});
	}

	const percentages = z["4220"];
	if (percentages && percentages.length > 0) {
		atMostTen(percentages, "4220");
		const values = percentages.map((entry) => {
			const value = requiredDecimal(entry["2106"], "2106", 4);
			if (value > 0.9999) {
				throw new Error(
					`Zone 2106 (percentage) is a fraction at most 0.9999, received ${value}`,
				);
			}
			return value;
		});
		if (new Set(values).size !== values.length) {
			throw new Error(
				`Zone 4220 has a duplicate percentage: ${values.join(", ")}`,
			);
		}
		zones["4220"] = values.map((value) => ({ "2106": value }));
	}
	return ficheLine($s, zones, line);
}

function ficheLine($s: string, zones: JsonObject, line: FicheBase): JsonObject {
	const where = `Fiche ${line.key}`;
	for (const [field, value] of [
		["beneficiary", line.beneficiary],
		["contact", line.contact],
		["debtor", line.debtor],
	] as const) {
		if (value.length === 0) throw new Error(`${where}: ${field} key is empty`);
	}
	return {
		$s,
		...zones,
		b: line.beneficiary,
		c: line.contact,
		d: line.debtor,
		k: line.key,
	};
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function assertKey(key: string): void {
	if (key.length < 1 || key.length > 255) {
		throw new Error(
			`A Belcotax key must be 1 to 255 characters, received ${JSON.stringify(key)}`,
		);
	}
}

function setIf(target: JsonObject, field: string, value: Json | undefined): void {
	if (value !== undefined) target[field] = value;
}

function present(value: Optional<string>): string | undefined {
	return value == null || value.length === 0 ? undefined : value;
}

function bounded(
	value: Optional<string>,
	max: number,
	label: string,
): string | undefined {
	const v = present(value);
	if (v !== undefined && v.length > max) {
		throw new Error(`${label} is at most ${max} characters, received ${v.length}`);
	}
	return v;
}

function checked(
	value: Optional<string>,
	pattern: RegExp,
	label: string,
): string | undefined {
	const v = present(value);
	if (v !== undefined && !pattern.test(v))
		throw new Error(`${label} is invalid: ${v}`);
	return v;
}

function names(
	value: Optional<readonly string[]>,
	label: string,
): string[] | undefined {
	if (!value || value.length === 0) return undefined;
	if (value.length > 5)
		throw new Error(`${label}: at most 5, received ${value.length}`);
	for (const name of value) {
		if (name.length < 1 || name.length > 50) {
			throw new Error(
				`${label}: each is 1 to 50 characters, received ${JSON.stringify(name)}`,
			);
		}
	}
	return [...value];
}

/** Round to the zone's precision, so float noise cannot fail the schema's `multipleOf`. */
function decimal(
	value: Optional<number>,
	zone: string,
	places: number,
): number | undefined {
	if (value == null) return undefined;
	return requiredDecimal(value, zone, places);
}

function requiredDecimal(value: number, zone: string, places: number): number {
	if (!Number.isFinite(value))
		throw new Error(`Zone ${zone} must be finite, received ${value}`);
	if (value < 0)
		throw new Error(`Zone ${zone} must be non-negative, received ${value}`);
	return Number(value.toFixed(places));
}

function atMostTen(entries: readonly unknown[], zone: string): void {
	if (entries.length > 10)
		throw new Error(
			`Zone ${zone} takes at most 10 entries, received ${entries.length}`,
		);
}
