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
