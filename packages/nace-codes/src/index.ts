// Core NACE (EU) classification. The Belgian NACEBEL extension lives in a
// separate entry point (`nace-codes/nacebel`) so consumers that only need NACE
// never pull Belgian data into their bundle.
export { BUNDLED_LANGUAGE, LANGUAGES, OPTIONAL_LANGUAGES } from "./languageList";
export { NACE } from "./nace";
export type {
	Language,
	LanguageDescriptions,
	LanguagePack,
	NACECode,
	NACEOptions,
	OptionalLanguage,
	SearchOptions,
} from "./types";
