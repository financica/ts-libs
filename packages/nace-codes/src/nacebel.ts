import { loadNACEBELCodes } from "./nacebelDataLoader";
import type {
	LanguagePack,
	NACEBELCode,
	NACEBELCodeMap,
	NACEBELOptions,
	SearchOptions,
} from "./types";
import { determineLevel, getParentCode, normalizeCode } from "./utils";

export class NACEBEL {
	protected codes: NACEBELCodeMap;
	protected readonly languages: readonly LanguagePack[];

	constructor(options?: NACEBELOptions) {
		this.languages = options?.languages ?? [];

		if (options?.preload ?? false) {
			this.codes = loadNACEBELCodes(this.languages);
		} else {
			this.codes = {};
		}
	}

	protected ensureDataLoaded(): void {
		if (Object.keys(this.codes).length === 0) {
			this.codes = loadNACEBELCodes(this.languages);
		}
	}

	/** Retrieve information about a specific code. */
	getCode(code: string): NACEBELCode | null {
		this.ensureDataLoaded();
		const normalized = normalizeCode(code);
		return this.codes[normalized] ?? null;
	}

	/** Get the parent code in the hierarchy. */
	getParent(code: string): NACEBELCode | null {
		const codeObj = this.getCode(code);
		if (!codeObj) return null;

		const parentCode = getParentCode(codeObj.code);
		if (!parentCode) return null;

		return this.getCode(parentCode);
	}

	/** Get Belgian-specific extensions for a NACE code. */
	getBelgianExtensions(naceCode: string): NACEBELCode[] {
		this.ensureDataLoaded();
		const normalized = normalizeCode(naceCode);
		const level = determineLevel(normalized);

		if (level > 4) return [];

		const extensions: NACEBELCode[] = [];

		for (const code of Object.values(this.codes)) {
			if (code.level > 4 && code.code.startsWith(normalized)) {
				extensions.push(code);
			}
		}

		return extensions.sort((a, b) => a.code.localeCompare(b.code));
	}

	/** Get all direct children of a code. */
	getChildren(code: string): NACEBELCode[] {
		this.ensureDataLoaded();
		const codeObj = this.getCode(code);
		if (!codeObj) return [];

		const normalized = normalizeCode(code);
		const level = determineLevel(normalized);

		let childLevel = level + 1;
		if (level === 4) childLevel = 5;
		if (level === 5) childLevel = 7;

		if (childLevel > 7) return [];

		const children: NACEBELCode[] = [];
		for (const [key, value] of Object.entries(this.codes)) {
			if (value.level === childLevel && this.isChildOf(key, normalized)) {
				children.push(value);
			}
		}

		return children.sort((a, b) => a.code.localeCompare(b.code));
	}

	protected isChildOf(childCode: string, parentCode: string): boolean {
		const childLevel = determineLevel(childCode);
		const parentLevel = determineLevel(parentCode);

		if (childLevel <= parentLevel) return false;

		return childCode.startsWith(parentCode);
	}

	/** Get all ancestors up to the top level. */
	getAncestors(code: string): NACEBELCode[] {
		const ancestors: NACEBELCode[] = [];
		let current = this.getCode(code);

		while (current) {
			const parent = this.getParent(current.code);
			if (!parent) break;
			ancestors.push(parent);
			current = parent;
		}

		return ancestors;
	}

	/** Get all descendants recursively. */
	getDescendants(code: string): NACEBELCode[] {
		this.ensureDataLoaded();
		const normalized = normalizeCode(code);
		const level = determineLevel(normalized);
		const descendants: NACEBELCode[] = [];

		for (const [key, value] of Object.entries(this.codes)) {
			if (value.level > level && this.isChildOf(key, normalized)) {
				descendants.push(value);
			}
		}

		return descendants.sort((a, b) => a.code.localeCompare(b.code));
	}

	/** Get all codes at the same level with the same parent. */
	getSiblings(code: string): NACEBELCode[] {
		const codeObj = this.getCode(code);
		if (!codeObj) return [];

		const parent = this.getParent(code);
		if (!parent) return [];

		return this.getChildren(parent.code).filter((c) => c.code !== codeObj.code);
	}

	/** Get the hierarchical level of a code. */
	getLevel(code: string): number {
		const codeObj = this.getCode(code);
		return codeObj?.level ?? 0;
	}

	/** Get all codes, optionally filtered by level. */
	getAllCodes(level?: number): NACEBELCode[] {
		this.ensureDataLoaded();
		const allCodes = Object.values(this.codes);

		if (level === undefined) {
			return allCodes;
		}

		return allCodes.filter((c) => c.level === level);
	}

	/** Search for codes by description. */
	search(query: string, options?: SearchOptions): NACEBELCode[] {
		this.ensureDataLoaded();
		const language = options?.language ?? "en";
		const limit = options?.limit ?? 10;
		const fuzzy = options?.fuzzy ?? false;

		const results: NACEBELCode[] = [];
		const lowerQuery = query.toLowerCase();

		for (const code of Object.values(this.codes)) {
			let description: string | undefined;

			if (language === "nl" || language === "fr" || language === "de") {
				description = code.nationalTitles[language];
			}

			description ??= code.description[language] ?? "";

			if (!description) continue;

			const lowerDescription = description.toLowerCase();

			if (fuzzy) {
				if (this.fuzzyMatch(lowerQuery, lowerDescription)) {
					results.push(code);
				}
			} else {
				if (lowerDescription.includes(lowerQuery)) {
					results.push(code);
				}
			}

			if (results.length >= limit) {
				break;
			}
		}

		return results;
	}

	protected fuzzyMatch(query: string, text: string): boolean {
		const queryWords = query.split(/\s+/);
		return queryWords.every((word) => text.includes(word));
	}
}
