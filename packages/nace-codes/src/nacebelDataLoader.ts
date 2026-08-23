import { naceHeadings, naceStructure } from "./generated/naceData";
import { nacebelData } from "./generated/nacebelData";
import { nacebelDescriptions } from "./generated/nacebelDescriptions";
import { applyLanguagePacks } from "./languages";
import { processNACEData } from "./naceProcessor";
import type {
	CodeMap,
	LanguagePack,
	NACEBELCode,
	NACEBELCodeMap,
	ParsedNACEBEL,
} from "./types";

const NACEBEL_DEFAULT_VERSION = "2025";
import { normalizeCode } from "./utils";

function processNACEBELData(
	nacebel: ParsedNACEBEL[],
	naceCodes: CodeMap,
): NACEBELCodeMap {
	const codeMap: NACEBELCodeMap = {};

	for (const entry of nacebel) {
		const normalizedCode = normalizeCode(entry.CODE);
		const level = parseInt(entry.LEVEL, 10);

		const baseNaceCode = naceCodes[normalizedCode];

		const nacebelCode: NACEBELCode = {
			code: normalizedCode,
			level,
			description: baseNaceCode?.description ?? {
				en: entry.NATIONAL_TITLE_BE_EN || entry.NATIONAL_TITLE_BE_FR || "",
			},
			version: entry.version,
			nationalTitles: {
				nl: entry.NATIONAL_TITLE_BE_NL || "",
				fr: entry.NATIONAL_TITLE_BE_FR || "",
				de: entry.NATIONAL_TITLE_BE_DE || "",
				en: entry.NATIONAL_TITLE_BE_EN || "",
			},
			parent: baseNaceCode?.parent,
			includes: baseNaceCode?.includes,
			includesAlso: baseNaceCode?.includesAlso,
			excludes: baseNaceCode?.excludes,
			implementationRule: baseNaceCode?.implementationRule,
			explanatoryNote: nacebelDescriptions[normalizedCode],
		};

		codeMap[normalizedCode] = nacebelCode;
	}

	for (const [code, naceCode] of Object.entries(naceCodes)) {
		codeMap[code] ??= {
			...naceCode,
			version: NACEBEL_DEFAULT_VERSION,
			nationalTitles: {
				nl: "",
				fr: "",
				de: "",
				en: naceCode.description.en,
			},
			explanatoryNote: nacebelDescriptions[code] ?? naceCode.explanatoryNote,
		};
	}

	return codeMap;
}

let nacebelCodesCache: NACEBELCodeMap | null = null;

export function loadNACEBELCodes(packs: readonly LanguagePack[] = []): NACEBELCodeMap {
	if (!nacebelCodesCache) {
		const naceCodes = processNACEData(naceHeadings, naceStructure);
		nacebelCodesCache = processNACEBELData(nacebelData, naceCodes);
	}
	return applyLanguagePacks(nacebelCodesCache, packs);
}

export function clearNACEBELCache(): void {
	nacebelCodesCache = null;
}
