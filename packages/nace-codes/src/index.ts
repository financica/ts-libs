// Core NACE (EU) classification. The Belgian NACEBEL extension lives in a
// separate entry point (`nace-codes/nacebel`) so consumers that only need NACE
// never pull Belgian data into their bundle.
export { NACE } from "./nace";
export type {
	Language,
	LanguageDescriptions,
	NACECode,
	NACEOptions,
	SearchOptions,
} from "./types";
