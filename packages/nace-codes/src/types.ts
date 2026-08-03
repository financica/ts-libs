import type { LanguageCode, OptionalLanguage } from "./languageList";

export type { OptionalLanguage } from "./languageList";

export type Language = LanguageCode;

/**
 * Descriptions keyed by language. `en` is always present because it ships in the
 * default bundle; every other language is populated only when the matching
 * `nace-codes/lang/<code>` pack is passed via {@link NACEOptions.languages}.
 */
export type LanguageDescriptions = { en: string } & Partial<
	Record<OptionalLanguage, string>
>;

/**
 * An opt-in bundle of translations for one language, imported from
 * `nace-codes/lang/<code>` (headings) or `nace-codes/nacebel/lang/<code>`
 * (NACEBEL explanatory notes) and passed to the constructor.
 */
export interface LanguagePack {
	language: OptionalLanguage;
	/** NACE heading descriptions, keyed by normalized code. */
	descriptions?: Record<string, string>;
	/** NACEBEL explanatory notes as Markdown, keyed by normalized code. */
	explanatoryNotes?: Record<string, string>;
}

export interface NACECode {
	code: string;
	level: number;
	description: LanguageDescriptions;
	parent?: string;
	includes?: string;
	includesAlso?: string;
	excludes?: string;
	implementationRule?: string;
	/**
	 * Full explanatory note ("Explication" / "Toelichting"), as Markdown, per
	 * language. Cross-references to other codes are local wikilinks, e.g.
	 * `see [[10.32]]`. Derived from the EU NACE Rev. 2.1 explanatory notes (the
	 * source KBO itself serves) and translated. Present only for codes that have
	 * a note; `en` is always set when present.
	 */
	explanatoryNote?: LanguageDescriptions;
}

export interface NACEBELCode extends NACECode {
	version: string;
	nationalTitles: {
		nl: string;
		fr: string;
		de: string;
		en: string;
	};
}

export interface SearchOptions {
	language?: Language;
	fuzzy?: boolean;
	limit?: number;
}

export interface NACEOptions {
	/** Load and index all codes eagerly in the constructor (default: false). */
	preload?: boolean;
	/**
	 * Translations to layer on top of the bundled English data. Only the
	 * languages passed here are available from `description` and `search()`.
	 *
	 * ```ts
	 * import da from "@financica/nace-codes/lang/da";
	 * const nace = new NACE({ languages: [da] });
	 * ```
	 */
	languages?: readonly LanguagePack[];
}

export type NACEBELOptions = NACEOptions;

export interface ParsedNACEHeading {
	NACE_CODE: string;
	EN_DESC: string;
	DE_DESC?: string;
	FR_DESC?: string;
	BG_DESC?: string;
	CS_DESC?: string;
	DA_DESC?: string;
	EL_DESC?: string;
	ES_DESC?: string;
	ET_DESC?: string;
	FI_DESC?: string;
	GA_DESC?: string;
	HR_DESC?: string;
	HU_DESC?: string;
	IT_DESC?: string;
	LT_DESC?: string;
	LV_DESC?: string;
	MT_DESC?: string;
	NL_DESC?: string;
	PL_DESC?: string;
	PT_DESC?: string;
	RO_DESC?: string;
	SK_DESC?: string;
	SL_DESC?: string;
	SV_DESC?: string;
}

export interface ParsedNACEStructure {
	ORDER_KEY: string;
	ID: string;
	CODE: string;
	NAME: string;
	PARENT_ID: string;
	PARENT_CODE: string;
	LEVEL: string;
	Implementation_rule: string;
	Includes: string;
	IncludesAlso: string;
	Excludes: string;
}

export interface ParsedNACEBEL {
	LEVEL: string;
	CODE: string;
	version: string;
	NATIONAL_TITLE_BE_NL: string;
	NATIONAL_TITLE_BE_FR: string;
	NATIONAL_TITLE_BE_DE: string;
	NATIONAL_TITLE_BE_EN: string;
}

export type CodeMap = Record<string, NACECode>;

export type NACEBELCodeMap = Record<string, NACEBELCode>;
