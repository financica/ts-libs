import { readFileSync } from "fs";
import { join } from "path";
import { parseTSV } from "./parser";
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

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DataLoader {
	private static naceHeadingsCache: ParsedNACEHeading[] | null = null;
	private static naceStructureCache: ParsedNACEStructure[] | null = null;
	private static nacebelCache: ParsedNACEBEL[] | null = null;
	private static naceCodesCache: CodeMap | null = null;
	private static nacebelCodesCache: NACEBELCodeMap | null = null;

	private static getDataPath(filename: string): string {
		return join(process.cwd(), "data", filename);
	}

	static loadNACEHeadings(): ParsedNACEHeading[] {
		if (!this.naceHeadingsCache) {
			const path = this.getDataPath("nace/NACE_Rev2.1_Heading_All_Languages.tsv");
			const content = readFileSync(path, "utf-8");
			this.naceHeadingsCache = parseTSV<ParsedNACEHeading>(content);
		}
		return this.naceHeadingsCache;
	}

	static loadNACEStructure(): ParsedNACEStructure[] {
		if (!this.naceStructureCache) {
			const path = this.getDataPath(
				"nace/NACE_Rev2.1_Structure_Explanatory_Notes_EN.tsv",
			);
			const content = readFileSync(path, "utf-8");
			this.naceStructureCache = parseTSV<ParsedNACEStructure>(content);
		}
		return this.naceStructureCache;
	}

	static loadNACEBEL(): ParsedNACEBEL[] {
		if (!this.nacebelCache) {
			const path = this.getDataPath("nacebel/codes-NACEBEL-2025.tsv");
			const content = readFileSync(path, "utf-8");
			this.nacebelCache = parseTSV<ParsedNACEBEL>(content);
		}
		return this.nacebelCache;
	}

	static loadNACECodes(): CodeMap {
		if (!this.naceCodesCache) {
			const headings = this.loadNACEHeadings();
			const structure = this.loadNACEStructure();
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
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
					parent: structureEntry?.PARENT_CODE
						? normalizeCode(structureEntry.PARENT_CODE)
						: undefined,
					includes: structureEntry?.Includes ?? undefined,
					includesAlso: structureEntry?.IncludesAlso ?? undefined,
					excludes: structureEntry?.Excludes ?? undefined,
					implementationRule:
						structureEntry?.Implementation_rule ?? undefined,
				};

				codeMap[normalizedCode] = naceCode;
			}

			this.naceCodesCache = codeMap;
		}
		return this.naceCodesCache;
	}

	static loadNACEBELCodes(): NACEBELCodeMap {
		if (!this.nacebelCodesCache) {
			const nacebel = this.loadNACEBEL();
			const naceCodes = this.loadNACECodes();
			const codeMap: NACEBELCodeMap = {};

			for (const entry of nacebel) {
				const normalizedCode = normalizeCode(entry.CODE);
				const level = parseInt(entry.LEVEL, 10);

				const baseNaceCode = naceCodes[normalizedCode];

				const nacebelCode: NACEBELCode = {
					code: normalizedCode,
					level,
					description: baseNaceCode?.description ?? {
						en:
							entry.NATIONAL_TITLE_BE_EN ||
							entry.NATIONAL_TITLE_BE_FR ||
							"",
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

			this.nacebelCodesCache = codeMap;
		}
		return this.nacebelCodesCache;
	}

	static clearCache(): void {
		this.naceHeadingsCache = null;
		this.naceStructureCache = null;
		this.nacebelCache = null;
		this.naceCodesCache = null;
		this.nacebelCodesCache = null;
	}
}
