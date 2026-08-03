import type {
	CodeMap,
	LanguageDescriptions,
	NACECode,
	ParsedNACEHeading,
	ParsedNACEStructure,
} from "./types";
import { determineLevel, normalizeCode } from "./utils";

/**
 * Builds the core NACE code map from the raw heading and structure rows.
 * Shared by the NACE core loader and every national extension loader (e.g.
 * NACEBEL), which layer their own data on top of this base.
 */
export function processNACEData(
	headings: ParsedNACEHeading[],
	structure: ParsedNACEStructure[],
): CodeMap {
	const codeMap: CodeMap = {};

	for (const heading of headings) {
		const normalizedCode = normalizeCode(heading.NACE_CODE);
		const level = determineLevel(normalizedCode);

		// English only. Translations arrive later as opt-in language packs, so they
		// never enter the default bundle's module graph.
		const descriptions: LanguageDescriptions = { en: heading.EN_DESC || "" };

		const structureEntry = structure.find(
			(s) => normalizeCode(s.CODE) === normalizedCode,
		);

		const parentCode = structureEntry?.PARENT_CODE;

		const naceCode: NACECode = {
			code: normalizedCode,
			level,
			description: descriptions,
			parent:
				parentCode !== undefined && parentCode !== ""
					? normalizeCode(parentCode)
					: undefined,
			includes: structureEntry?.Includes,
			includesAlso: structureEntry?.IncludesAlso,
			excludes: structureEntry?.Excludes,
			implementationRule: structureEntry?.Implementation_rule,
		};

		codeMap[normalizedCode] = naceCode;
	}

	return codeMap;
}
