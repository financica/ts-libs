export type Language =
	| "en"
	| "fr"
	| "de"
	| "nl"
	| "es"
	| "it"
	| "pt"
	| "bg"
	| "cs"
	| "da"
	| "el"
	| "et"
	| "fi"
	| "ga"
	| "hr"
	| "hu"
	| "lt"
	| "lv"
	| "mt"
	| "pl"
	| "ro"
	| "sk"
	| "sl"
	| "sv";

export interface LanguageDescriptions {
	en: string;
	fr?: string;
	de?: string;
	nl?: string;
	es?: string;
	it?: string;
	pt?: string;
	bg?: string;
	cs?: string;
	da?: string;
	el?: string;
	et?: string;
	fi?: string;
	ga?: string;
	hr?: string;
	hu?: string;
	lt?: string;
	lv?: string;
	mt?: string;
	pl?: string;
	ro?: string;
	sk?: string;
	sl?: string;
	sv?: string;
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
	dataPath?: string;
	preload?: boolean;
}

export interface NACEBELOptions extends NACEOptions {
	nacebelDataPath?: string;
}

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

export interface MIGsAggregate {
	MIGs_URI: string;
	MIGs_Aggregate: string;
	NACE_URI: string;
	NACE_Rev2_1_Position: string;
}

export type CodeMap = Record<string, NACECode>;

export type NACEBELCodeMap = Record<string, NACEBELCode>;
