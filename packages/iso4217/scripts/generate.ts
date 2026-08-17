/**
 * Parse the ISO 4217 XML lists and emit TypeScript source for src/.
 *
 * Emits:
 *   src/codes.ts         — ALPHABETIC_CODES, NUMERIC_CODES, COUNTRY_CODES tuples
 *   src/data.ts          — CURRENCIES array + PUBLISHED_AT
 *   src/historic-data.ts — HISTORIC_CURRENCIES array
 *
 * Output is deterministic and diff-friendly:
 *   - Currencies sorted ascending by alphabetic code.
 *   - Country codes within a currency sorted ascending.
 *   - Historic currencies sorted by (alphabeticCode, withdrawalDate).
 *
 * Entity (country) data is emitted as ISO 3166-1 alpha-2 codes only; the
 * long-form entity names from the XML never appear in the published package.
 * Non-territory entities (IMF, Arab Monetary Fund, ADB member group, Sucre)
 * map to `null` in `./iso-3166.ts` and are stripped.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";
import { type FormatConfig, format } from "oxfmt";

import { ENTITY_TO_COUNTRY_CODE } from "./iso-3166.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DATA_DIR = resolve(ROOT, "data");
const SRC_DIR = resolve(ROOT, "src");

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * oxfmt's programmatic API does not discover `.oxfmtrc.json` the way its CLI
 * does, so find the repo config and pass it through. Reading the real file
 * rather than hardcoding options is what keeps emitted source byte-identical to
 * whatever `oxfmt --check` expects.
 */
async function loadFormatConfig(): Promise<FormatConfig> {
	let directory = HERE;

	for (;;) {
		const candidate = resolve(directory, ".oxfmtrc.json");
		if (existsSync(candidate)) {
			return JSON.parse(await readFile(candidate, "utf8")) as FormatConfig;
		}

		const parent = dirname(directory);
		if (parent === directory) {
			throw new Error(`no .oxfmtrc.json found above ${HERE}`);
		}
		directory = parent;
	}
}

/** Resolved once and reused: the config cannot change mid-run. */
const formatConfig = loadFormatConfig();

/** Writes emitted source already formatted, so no later pass has to fix it. */
async function writeModule(path: string, source: string): Promise<void> {
	const { code, errors } = await format(path, source, await formatConfig);

	if (errors.length > 0) {
		const detail = errors.map((error) => error.message).join("\n");
		throw new Error(`oxfmt could not format ${path}:\n${detail}`);
	}

	await writeFile(path, code, "utf8");
}

// ── Classification ───────────────────────────────────────────────────────────

const METAL_CODES = new Set(["XAU", "XAG", "XPT", "XPD"]);

const SPECIAL_CODES = new Set([
	"XBA", // Bond Markets Unit European Composite Unit (EURCO)
	"XBB", // Bond Markets Unit European Monetary Unit (E.M.U.-6)
	"XBC", // Bond Markets Unit European Unit of Account 9 (E.U.A.-9)
	"XBD", // Bond Markets Unit European Unit of Account 17 (E.U.A.-17)
	"XDR", // Special Drawing Right (IMF)
	"XSU", // Sucre (ALBA regional accounting unit)
	"XTS", // Reserved for testing
	"XUA", // ADB Unit of Account
	"XXX", // No currency sentinel
	"XAD", // Arab Accounting Dinar (Arab Monetary Fund)
]);

type CurrencyKind = "fiat" | "fund" | "metal" | "special";

function classify(code: string, isFund: boolean): CurrencyKind {
	if (isFund) return "fund";
	if (METAL_CODES.has(code)) return "metal";
	if (SPECIAL_CODES.has(code)) return "special";
	return "fiat";
}

// ── Entity mapping ───────────────────────────────────────────────────────────

const ZZ_ENTITY = /^ZZ\d+_/;

function toCountryCode(raw: string | undefined): string | null {
	if (!raw) return null;
	if (ZZ_ENTITY.test(raw)) return null;
	if (!(raw in ENTITY_TO_COUNTRY_CODE)) {
		throw new Error(
			`No ISO 3166-1 alpha-2 mapping for entity ${JSON.stringify(raw)}. ` +
				"Add it to scripts/iso-3166.ts.",
		);
	}
	return ENTITY_TO_COUNTRY_CODE[raw] ?? null;
}

// ── XML parsing ──────────────────────────────────────────────────────────────

interface RawCcyNm {
	"#text"?: string;
	"@_IsFund"?: string;
}

interface RawEntry {
	CtryNm?: string;
	CcyNm?: string | RawCcyNm;
	Ccy?: string;
	CcyNbr?: string;
	CcyMnrUnts?: string;
}

interface RawHistoricEntry {
	CtryNm?: string;
	CcyNm?: string | RawCcyNm;
	Ccy?: string;
	CcyNbr?: string;
	WthdrwlDt?: string;
}

interface ParsedList<TEntry> {
	publishedAt: string;
	entries: TEntry[];
}

function asText(value: string | RawCcyNm | undefined): string {
	if (value === undefined) return "";
	if (typeof value === "string") return value;
	return value["#text"] ?? "";
}

function isFundFlag(value: string | RawCcyNm | undefined): boolean {
	return typeof value === "object" && value !== null && value["@_IsFund"] === "true";
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	parseAttributeValue: false,
	parseTagValue: false,
	trimValues: true,
	isArray: (name) => name === "CcyNtry" || name === "HstrcCcyNtry",
});

async function parseList<TTable extends string, TEntry>(
	filename: string,
	tableKey: TTable,
	entryKey: string,
): Promise<ParsedList<TEntry>> {
	const xml = await readFile(resolve(DATA_DIR, filename), "utf8");
	const doc = parser.parse(xml) as {
		ISO_4217: {
			"@_Pblshd"?: string;
		} & Record<TTable, Record<string, TEntry[]>>;
	};

	const publishedAt = doc.ISO_4217["@_Pblshd"];
	if (!publishedAt) {
		throw new Error(`Missing Pblshd attribute in ${filename}`);
	}
	const table = doc.ISO_4217[tableKey];
	if (!table) {
		throw new Error(`Missing ${tableKey} in ${filename}`);
	}
	const entries = table[entryKey];
	if (!entries) {
		throw new Error(`Missing ${entryKey} in ${filename}`);
	}

	return { publishedAt, entries };
}

// ── Builders ─────────────────────────────────────────────────────────────────

interface Currency {
	alphabeticCode: string;
	numericCode: string;
	minorUnits: number | null;
	name: string;
	countryCodes: string[];
	isFund: boolean;
	kind: CurrencyKind;
}

interface HistoricCurrency {
	alphabeticCode: string;
	numericCode: string | null;
	name: string;
	withdrawalDate: string;
}

function buildCurrencies(entries: RawEntry[]): Currency[] {
	const byCode = new Map<string, Currency>();

	for (const entry of entries) {
		const code = entry.Ccy?.trim();
		if (!code) continue; // ANTARCTICA etc. have no currency.

		const numericRaw = entry.CcyNbr?.trim();
		if (!numericRaw) {
			throw new Error(`Entry for ${code} is missing CcyNbr`);
		}
		const numericCode = numericRaw.padStart(3, "0");

		const name = asText(entry.CcyNm).trim();
		if (!name) {
			throw new Error(`Entry for ${code} is missing CcyNm`);
		}

		const minorRaw = entry.CcyMnrUnts?.trim();
		const minorUnits =
			!minorRaw || minorRaw === "N.A." ? null : Number.parseInt(minorRaw, 10);
		if (minorUnits !== null && !Number.isInteger(minorUnits)) {
			throw new Error(
				`Entry for ${code} has non-integer CcyMnrUnts: ${minorRaw}`,
			);
		}

		const isFund = isFundFlag(entry.CcyNm);
		const kind = classify(code, isFund);
		const countryCode = toCountryCode(entry.CtryNm);

		const existing = byCode.get(code);
		if (existing) {
			if (existing.numericCode !== numericCode) {
				throw new Error(
					`Numeric code mismatch for ${code}: ${existing.numericCode} vs ${numericCode}`,
				);
			}
			if (existing.minorUnits !== minorUnits) {
				throw new Error(
					`Minor units mismatch for ${code}: ${existing.minorUnits} vs ${minorUnits}`,
				);
			}
			if (countryCode && !existing.countryCodes.includes(countryCode)) {
				existing.countryCodes.push(countryCode);
			}
		} else {
			byCode.set(code, {
				alphabeticCode: code,
				numericCode,
				minorUnits,
				name,
				countryCodes: countryCode ? [countryCode] : [],
				isFund,
				kind,
			});
		}
	}

	const currencies = [...byCode.values()];
	currencies.sort((a, b) => a.alphabeticCode.localeCompare(b.alphabeticCode, "en"));
	for (const currency of currencies) {
		currency.countryCodes.sort((a, b) => a.localeCompare(b, "en"));
	}
	return currencies;
}

function buildHistoric(entries: RawHistoricEntry[]): HistoricCurrency[] {
	// Historic entries are collapsed by (code + name): withdrawal dates are kept
	// distinct when they differ (e.g. ANG was withdrawn twice under different
	// entities/dates).
	const byKey = new Map<string, HistoricCurrency>();

	for (const entry of entries) {
		const code = entry.Ccy?.trim();
		if (!code) continue;

		const numericRaw = entry.CcyNbr?.trim();
		const numericCode = numericRaw ? numericRaw.padStart(3, "0") : null;
		const name = asText(entry.CcyNm).trim();
		const withdrawalDate = entry.WthdrwlDt?.trim() ?? "";

		const key = `${code}|${withdrawalDate}|${name}`;
		if (byKey.has(key)) continue;
		byKey.set(key, { alphabeticCode: code, numericCode, name, withdrawalDate });
	}

	const historic = [...byKey.values()];
	historic.sort((a, b) => {
		const byAlpha = a.alphabeticCode.localeCompare(b.alphabeticCode, "en");
		if (byAlpha !== 0) return byAlpha;
		return a.withdrawalDate.localeCompare(b.withdrawalDate, "en");
	});
	return historic;
}

// ── Emitters ─────────────────────────────────────────────────────────────────

const HEADER = (source: string) =>
	[
		"// AUTO-GENERATED — do not edit by hand.",
		"// Regenerate with `npm run generate` after refreshing data via `npm run fetch-data`.",
		`// Source: ${source}`,
		"",
	].join("\n");

function emitCodes(currencies: Currency[]): string {
	const alpha = currencies.map((c) => `  "${c.alphabeticCode}",`).join("\n");
	const numeric = currencies.map((c) => `  "${c.numericCode}",`).join("\n");

	const countryCodes = [...new Set(currencies.flatMap((c) => c.countryCodes))].sort();
	const country = countryCodes.map((code) => `  "${code}",`).join("\n");

	return `${HEADER("list-one.xml (SIX Group) + scripts/iso-3166.ts")}
/**
 * Every ISO 4217 alphabetic code, sorted ascending. The union type
 * \`(typeof ALPHABETIC_CODES)[number]\` is the canonical literal-union type
 * for an active ISO 4217 alphabetic currency code.
 */
export const ALPHABETIC_CODES = [
${alpha}
] as const;

/**
 * Every ISO 4217 numeric code, sorted to match ALPHABETIC_CODES. Always a
 * zero-padded three-character string.
 */
export const NUMERIC_CODES = [
${numeric}
] as const;

/**
 * Every ISO 3166-1 alpha-2 country code that appears on any currency in
 * {@link CURRENCIES}, sorted ascending. Includes \`EU\` (exceptionally
 * reserved) but no withdrawn codes.
 */
export const COUNTRY_CODES = [
${country}
] as const;
`;
}

function serializeCurrency(c: Currency): string {
	const minor = c.minorUnits === null ? "null" : String(c.minorUnits);
	const countries =
		c.countryCodes.length === 0
			? "[]"
			: `[${c.countryCodes.map((x) => JSON.stringify(x)).join(", ")}]`;
	// Each element is frozen too: the README promises immutable currencies,
	// and freezing only the array would leave the objects writable.
	return `  Object.freeze({
    alphabeticCode: ${JSON.stringify(c.alphabeticCode)},
    numericCode: ${JSON.stringify(c.numericCode)},
    minorUnits: ${minor},
    name: ${JSON.stringify(c.name)},
    countryCodes: ${countries},
    isFund: ${c.isFund},
    kind: ${JSON.stringify(c.kind)},
  } satisfies Currency)`;
}

function emitData(currencies: Currency[], publishedAt: string): string {
	return `${HEADER("list-one.xml (SIX Group)")}
import type { Currency } from "./types.js";

/**
 * ISO 4217 publication date of the data embedded in this module.
 */
export const PUBLISHED_AT = ${JSON.stringify(publishedAt)} as const;

/**
 * Frozen array of every active ISO 4217 currency, sorted by alphabetic code.
 */
export const CURRENCIES: readonly Currency[] = Object.freeze([
${currencies.map(serializeCurrency).join(",\n")},
]);
`;
}

function serializeHistoric(h: HistoricCurrency): string {
	const numeric = h.numericCode === null ? "null" : JSON.stringify(h.numericCode);
	return `  Object.freeze({
    alphabeticCode: ${JSON.stringify(h.alphabeticCode)},
    numericCode: ${numeric},
    name: ${JSON.stringify(h.name)},
    withdrawalDate: ${JSON.stringify(h.withdrawalDate)},
  } satisfies HistoricCurrency)`;
}

function emitHistoricData(historic: HistoricCurrency[], publishedAt: string): string {
	return `${HEADER("list-three.xml (SIX Group)")}
import type { HistoricCurrency } from "./types.js";

/**
 * ISO 4217 publication date of the historic data embedded in this module.
 */
export const HISTORIC_PUBLISHED_AT = ${JSON.stringify(publishedAt)} as const;

/**
 * Frozen array of every withdrawn ISO 4217 currency, sorted by alphabetic
 * code then by withdrawal date. Historic codes may collide with current codes,
 * so callers should treat this list as informational only.
 */
export const HISTORIC_CURRENCIES: readonly HistoricCurrency[] = Object.freeze([
${historic.map(serializeHistoric).join(",\n")},
]);
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const active = await parseList<"CcyTbl", RawEntry>(
		"list-one.xml",
		"CcyTbl",
		"CcyNtry",
	);
	const historic = await parseList<"HstrcCcyTbl", RawHistoricEntry>(
		"list-three.xml",
		"HstrcCcyTbl",
		"HstrcCcyNtry",
	);

	const currencies = buildCurrencies(active.entries);
	const historicCurrencies = buildHistoric(historic.entries);

	await writeModule(resolve(SRC_DIR, "codes.ts"), emitCodes(currencies));
	await writeModule(
		resolve(SRC_DIR, "data.ts"),
		emitData(currencies, active.publishedAt),
	);
	await writeModule(
		resolve(SRC_DIR, "historic-data.ts"),
		emitHistoricData(historicCurrencies, historic.publishedAt),
	);

	console.log(
		`  ✓ ${currencies.length} active currencies, ${historicCurrencies.length} historic — published ${active.publishedAt}`,
	);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
