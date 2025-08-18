import { naceHeadings, naceStructure } from "./generated/naceData";
import type {
	CodeMap,
	LanguageDescriptions,
	NACECode,
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

let naceCodesCache: CodeMap | null = null;

export function loadNACECodes(): CodeMap {
	naceCodesCache ??= processNACEData(naceHeadings, naceStructure);
	return naceCodesCache;
}

export function clearNACECache(): void {
	naceCodesCache = null;
}
