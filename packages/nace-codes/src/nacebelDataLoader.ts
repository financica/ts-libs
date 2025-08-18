import { nacebelData, naceHeadings, naceStructure } from "./generated/nacebelData";
import type {
	CodeMap,
	LanguageDescriptions,
	NACEBELCode,
	NACEBELCodeMap,
	NACECode,
	ParsedNACEBEL,
	ParsedNACEHeading,
	ParsedNACEStructure,
} from "./types";
import { determineLevel, normalizeCode } from "./utils";

function processNACEData(
	headings: ParsedNACEHeading[],
	structure: ParsedNACEStructure[],
): CodeMap {
	const codeMap: CodeMap = {};

	for (const heading of headings) {
		const normalizedCode = normalizeCode(heading.NACE_CODE);
		const level = determineLevel(normalizedCode);

		const descriptions: LanguageDescriptions = {
			en: heading.EN_DESC || "",
			fr: heading.FR_DESC,
			de: heading.DE_DESC,
			nl: heading.NL_DESC,
			es: heading.ES_DESC,
			it: heading.IT_DESC,
			pt: heading.PT_DESC,
			bg: heading.BG_DESC,
			cs: heading.CS_DESC,
			da: heading.DA_DESC,
			el: heading.EL_DESC,
			et: heading.ET_DESC,
			fi: heading.FI_DESC,
			ga: heading.GA_DESC,
			hr: heading.HR_DESC,
			hu: heading.HU_DESC,
			lt: heading.LT_DESC,
			lv: heading.LV_DESC,
			mt: heading.MT_DESC,
			pl: heading.PL_DESC,
			ro: heading.RO_DESC,
			sk: heading.SK_DESC,
			sl: heading.SL_DESC,
			sv: heading.SV_DESC,
		};

		const structureEntry = structure.find(
			(s) => normalizeCode(s.CODE) === normalizedCode,
		);

		const naceCode: NACECode = {
			code: normalizedCode,
			level,
			description: descriptions,
			parent:
				structureEntry?.PARENT_CODE !== undefined &&
				structureEntry.PARENT_CODE !== null &&
				structureEntry.PARENT_CODE !== ""
					? normalizeCode(structureEntry.PARENT_CODE)
					: undefined,
			includes: structureEntry?.Includes ?? undefined,
			includesAlso: structureEntry?.IncludesAlso ?? undefined,
			excludes: structureEntry?.Excludes ?? undefined,
			implementationRule: structureEntry?.Implementation_rule ?? undefined,
		};

		codeMap[normalizedCode] = naceCode;
	}

	return codeMap;
}

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
		};

		codeMap[normalizedCode] = nacebelCode;
	}

	for (const [code, naceCode] of Object.entries(naceCodes)) {
		codeMap[code] ??= {
			...naceCode,
			version: "2025",
			nationalTitles: {
				nl: "",
				fr: "",
				de: "",
				en: naceCode.description.en,
			},
		};
	}

	return codeMap;
}

let nacebelCodesCache: NACEBELCodeMap | null = null;

export function loadNACEBELCodes(): NACEBELCodeMap {
	if (!nacebelCodesCache) {
		const naceCodes = processNACEData(naceHeadings, naceStructure);
		nacebelCodesCache = processNACEBELData(nacebelData, naceCodes);
	}
	return nacebelCodesCache;
}

export function clearNACEBELCache(): void {
	nacebelCodesCache = null;
}
