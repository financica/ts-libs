// Belgian NACEBEL extension entry point (`nace-codes/nacebel`). Pulls in the
// shared NACE core data plus the Belgian national delta.
export { NACEBEL_NOTE_LANGUAGES } from "./languageList";
export { NACEBEL } from "./nacebel";
export type {
	Language,
	LanguageDescriptions,
	LanguagePack,
	NACEBELCode,
	NACEBELOptions,
	OptionalLanguage,
	SearchOptions,
} from "./types";
