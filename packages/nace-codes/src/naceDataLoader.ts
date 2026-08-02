import { naceHeadings, naceStructure } from "./generated/naceData";
import { processNACEData } from "./naceProcessor";
import type { CodeMap } from "./types";

let naceCodesCache: CodeMap | null = null;

export function loadNACECodes(): CodeMap {
	naceCodesCache ??= processNACEData(naceHeadings, naceStructure);
	return naceCodesCache;
}

export function clearNACECache(): void {
	naceCodesCache = null;
}
