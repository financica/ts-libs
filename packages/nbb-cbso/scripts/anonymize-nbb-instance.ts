/**
 * Anonymises a real NBB/CBSO annual-accounts instance document into a
 * committable test fixture.
 *
 * Published annual accounts are public, but a real filing still carries the
 * enterprise number, the directors' names and the accountant's details, and
 * this repository is published to npm. This script replaces all of it with
 * synthetic data while preserving every structural property the fixture is
 * meant to exercise:
 *
 *   - the set of contexts, their ids and their dimensional signatures
 *   - the set of facts, their ids, elements, contextRefs and unit refs
 *   - the internal consistency of the figures: amounts are scaled by a single
 *     integer factor, so every statutory check (all of which are sums and
 *     differences with unit coefficients) still holds exactly
 *   - the internal consistency of the dates: they are shifted by a whole
 *     number of years, so start/end and current/prior relations still hold
 *
 * Output is deterministic: the same input always produces the same fixture,
 * so re-running the script does not churn the committed file.
 *
 * Usage:
 *   bun run scripts/anonymize-nbb-instance.ts <input.xbrl> <output.xbrl>
 */

/** Amounts are multiplied by this. An integer keeps every sum exact. */
const AMOUNT_SCALE = 3;

/** Dates are shifted by this many years, preserving all date relations. */
const YEAR_SHIFT = -2;

/** Deterministic PRNG (mulberry32) so output is stable across runs. */
function makeRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = makeRandom(0x6362736f);

function pick<T>(items: readonly T[]): T {
	return items[Math.floor(random() * items.length)]!;
}

/**
 * Builds a syntactically valid Belgian enterprise number: ten digits, leading
 * 0 or 1, where the last two are the modulo-97 check digits of the first
 * eight. Real filings are rejected on a bad check digit, so the fixture should
 * carry a valid one.
 */
function makeEnterpriseNumber(): string {
	const base =
		(random() < 0.5 ? "0" : "1") +
		String(Math.floor(random() * 1e7)).padStart(7, "0");
	const check = 97 - (Number(base) % 97);
	return base + String(check).padStart(2, "0");
}

/** ITAA/ICE member numbers are printed as 10.498.733. */
function makeMemberNumber(): string {
	const digits = String(Math.floor(random() * 9e8) + 1e8);
	return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`;
}

const COMPANY_NAMES = [
	"ATLAS DIGITAL",
	"BOREAS STUDIO",
	"CALYX WORKS",
	"DELTA FORGE",
] as const;
const ACCOUNTANT_NAMES = [
	"FIDUCIAIRE MERIDIAN SRL",
	"COMPTAFOX SRL",
	"AUDIT LYS SRL",
] as const;
const FIRST_NAMES = ["CAMILLE", "SACHA", "NOA", "ELIOT", "MAXENCE"] as const;
const LAST_NAMES = ["DUBOIS", "VERHAEGEN", "MARCHAL", "PEETERS", "LAMBERT"] as const;
const STREETS = [
	"RUE DES SORBIERS",
	"CHAUSSEE DE TIRLEMONT",
	"AVENUE DU PARC",
	"RUE HAUTE",
] as const;

/** Postal-code and court enum members, remapped to other valid members. */
const POSTAL_CODE_REMAP: Record<string, string> = {
	"pcd:m1000": "pcd:m5000",
	"pcd:m1050": "pcd:m9000",
};
const COURT_REMAP: Record<string, string> = { "cct:m31": "cct:m10" };

const VALUATION_RULES_TEXT =
	"Les regles d&apos;evaluation sont etablies conformement a l&apos;arrete royal " +
	"portant execution du Code des societes et des associations. Les immobilisations " +
	"sont amorties lineairement sur leur duree d&apos;utilite estimee.";

interface Replacements {
	enterpriseNumbers: Map<string, string>;
	people: Map<string, string>;
	organisations: Map<string, string>;
	memberNumbers: Map<string, string>;
	streets: Map<string, string>;
	houseNumbers: Map<string, string>;
	postboxes: Map<string, string>;
}

function shiftDate(iso: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return iso;
	const [, year, month, day] = match;
	const shifted = Number(year) + YEAR_SHIFT;
	// 29 February only exists in a leap year; clamp rather than emit a bad date.
	const isLeap = (shifted % 4 === 0 && shifted % 100 !== 0) || shifted % 400 === 0;
	const safeDay = month === "02" && day === "29" && !isLeap ? "28" : day;
	return `${shifted}-${month}-${safeDay}`;
}

function scaleAmount(raw: string): string {
	const value = Number(raw);
	if (!Number.isFinite(value)) return raw;
	const scaled = Math.round(value * AMOUNT_SCALE * 100) / 100;
	// Preserve the reported shape: integers stay integers, decimals keep 2 places.
	return raw.includes(".") ? scaled.toFixed(2) : String(scaled);
}

/** Maps a value to a stable synthetic replacement, reusing it on repeat. */
function remember(map: Map<string, string>, key: string, make: () => string): string {
	const existing = map.get(key);
	if (existing !== undefined) return existing;
	const value = make();
	map.set(key, value);
	return value;
}

/** Extracts the dimensional signature of every context, keyed by context id. */
function readContextSignatures(xml: string): Map<string, Set<string>> {
	const signatures = new Map<string, Set<string>>();
	for (const context of xml.matchAll(/<context id="([^"]+)">(.*?)<\/context>/gs)) {
		const members = new Set<string>();
		for (const member of context[2]!.matchAll(
			/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)</g,
		)) {
			members.add(`${member[1]}=${member[2]}`);
		}
		signatures.set(context[1]!, members);
	}
	return signatures;
}

function anonymize(xml: string): string {
	const signatures = readContextSignatures(xml);
	const replacements: Replacements = {
		enterpriseNumbers: new Map(),
		people: new Map(),
		organisations: new Map(),
		memberNumbers: new Map(),
		streets: new Map(),
		houseNumbers: new Map(),
		postboxes: new Map(),
	};

	// The filer's own enterprise number, carried by every context identifier.
	const filerNumbers = new Set(
		[...xml.matchAll(/<identifier scheme="[^"]*">([^<]+)</g)].map((m) => m[1]!),
	);
	for (const number of filerNumbers) {
		remember(replacements.enterpriseNumbers, number, makeEnterpriseNumber);
	}

	let output = xml;

	// Context entity identifiers.
	output = output.replace(
		/(<identifier scheme="[^"]*">)([^<]+)(<)/g,
		(_all, open: string, value: string, close: string) =>
			open + (replacements.enterpriseNumbers.get(value) ?? value) + close,
	);

	// Typed dimension values: people's names, and the accountant's legal name.
	output = output.replace(
		/(<xbrldi:typedMember dimension="dim:(\w+)"><open:str>)([^<]*)(<)/g,
		(_all, open: string, dimension: string, value: string, close: string) => {
			let replaced = value;
			const key = `${dimension}:${value}`;
			if (dimension === "afnp") {
				replaced = remember(replacements.people, key, () => pick(FIRST_NAMES));
			} else if (dimension === "annp") {
				replaced = remember(replacements.people, key, () => pick(LAST_NAMES));
			} else if (dimension === "sanl") {
				replaced = remember(replacements.organisations, key, () =>
					pick(ACCOUNTANT_NAMES),
				);
			}
			return open + replaced + close;
		},
	);

	// Enum facts whose member identifies a place or a court.
	output = output.replace(
		/(<(?:pcd|cct)-enum:list1[^>]*>)([^<]+)(<)/g,
		(_all, open: string, value: string, close: string) =>
			open + (POSTAL_CODE_REMAP[value] ?? COURT_REMAP[value] ?? value) + close,
	);

	// Dates, both as reported facts and as the closing date on every context.
	// These have to move together: the context instant is the exercise closing
	// date, and a mismatch is exactly what the DAT 26 rejection looks for.
	output = output.replace(
		/(<met:dte\d[^>]*>)([^<]+)(<)/g,
		(_all, open: string, value: string, close: string) =>
			open + shiftDate(value) + close,
	);
	output = output.replace(
		/(<instant>)([^<]+)(<)/g,
		(_all, open: string, value: string, close: string) =>
			open + shiftDate(value) + close,
	);

	// Amounts.
	output = output.replace(
		/(<met:am\d[^>]*>)([^<]+)(<)/g,
		(_all, open: string, value: string, close: string) =>
			open + scaleAmount(value) + close,
	);

	// String facts, dispatched on the dimensional signature of their context.
	output = output.replace(
		/(<met:str(\d)\s+contextRef="([^"]+)"[^>]*>)([^<]*)(<)/g,
		(
			_all,
			open: string,
			_metric: string,
			contextRef: string,
			value: string,
			close: string,
		) => {
			const members = signatures.get(contextRef) ?? new Set<string>();
			const has = (member: string) => members.has(member);
			let replaced = value;

			if (has("dim:qlt=qlt:m1")) {
				// Company registration number, of the filer or of a third party.
				replaced = remember(
					replacements.enterpriseNumbers,
					value,
					makeEnterpriseNumber,
				);
			} else if (has("dim:qlt=qlt:m5")) {
				replaced = remember(
					replacements.memberNumbers,
					value,
					makeMemberNumber,
				);
			} else if (has("dim:bas=bas:m29")) {
				replaced = remember(replacements.organisations, value, () =>
					pick(COMPANY_NAMES),
				);
			} else if (has("dim:ctc=ctc:m1")) {
				replaced = remember(replacements.streets, value, () => pick(STREETS));
			} else if (has("dim:ctc=ctc:m2")) {
				// Keyed by the original so that two parties sharing an address
				// (a director living at the registered office) still share it.
				replaced = remember(replacements.houseNumbers, value, () =>
					String(Math.floor(random() * 200) + 1),
				);
			} else if (has("dim:ctc=ctc:m3")) {
				replaced = remember(replacements.postboxes, value, () =>
					String(Math.floor(random() * 20) + 1),
				);
			} else if (has("dim:bas=bas:m107")) {
				replaced = VALUATION_RULES_TEXT;
			}
			return open + replaced + close;
		},
	);

	return output;
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
	console.error("usage: anonymize-nbb-instance.ts <input.xbrl> <output.xbrl>");
	process.exit(1);
}

const source = await Bun.file(inputPath).text();
const result = anonymize(source);
await Bun.write(outputPath, result);
console.log(`wrote ${outputPath} (${result.length} bytes)`);
