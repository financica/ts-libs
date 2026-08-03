import { naceHeadings, naceStructure } from "./generated/naceData";
import { applyLanguagePacks } from "./languages";
import { processNACEData } from "./naceProcessor";
import type { CodeMap, LanguagePack } from "./types";

let naceCodesCache: CodeMap | null = null;

export function loadNACECodes(packs: readonly LanguagePack[] = []): CodeMap {
	naceCodesCache ??= processNACEData(naceHeadings, naceStructure);
	return applyLanguagePacks(naceCodesCache, packs);
}

export function clearNACECache(): void {
	naceCodesCache = null;
}
