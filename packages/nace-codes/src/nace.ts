import { loadNACECodes } from "./naceDataLoader";
import type {
	CodeMap,
	LanguagePack,
	NACECode,
	NACEOptions,
	SearchOptions,
} from "./types";
import { determineLevel, getParentCode, normalizeCode } from "./utils";

export class NACE {
	protected codes: CodeMap;
	protected readonly languages: readonly LanguagePack[];

	constructor(options?: NACEOptions) {
		this.languages = options?.languages ?? [];

		if (options?.preload ?? false) {
			this.codes = loadNACECodes(this.languages);
		} else {
			this.codes = {};
		}
	}

	protected ensureDataLoaded(): void {
		if (Object.keys(this.codes).length === 0) {
			this.codes = loadNACECodes(this.languages);
		}
	}

	getCode(code: string): NACECode | null {
		this.ensureDataLoaded();
		const normalized = normalizeCode(code);
		return this.codes[normalized] ?? null;
	}

	getParent(code: string): NACECode | null {
		const codeObj = this.getCode(code);
		if (!codeObj) return null;

		const parentCode = getParentCode(codeObj.code);
		if (!parentCode) return null;

		return this.getCode(parentCode);
	}

	getChildren(code: string): NACECode[] {
		this.ensureDataLoaded();
		const codeObj = this.getCode(code);
		if (!codeObj) return [];

		const normalized = normalizeCode(code);
		const level = determineLevel(normalized);
		const childLevel = level + 1;

		if (childLevel > 4) return [];

		const children: NACECode[] = [];
		for (const [key, value] of Object.entries(this.codes)) {
			if (value.level === childLevel && this.isChildOf(key, normalized)) {
				children.push(value);
			}
		}

		return children.sort((a, b) => a.code.localeCompare(b.code));
	}

	protected isChildOf(childCode: string, parentCode: string): boolean {
		const parentLevel = determineLevel(parentCode);

		if (parentLevel === 1) {
			const childParent = getParentCode(childCode);
			return childParent === parentCode;
		}

		return childCode.startsWith(parentCode);
	}

	getAncestors(code: string): NACECode[] {
		const ancestors: NACECode[] = [];
		let current = this.getCode(code);

		while (current) {
			const parent = this.getParent(current.code);
			if (parent) {
				ancestors.push(parent);
				current = parent;
			} else {
				break;
			}
		}

		return ancestors;
	}

	getDescendants(code: string): NACECode[] {
		const descendants: NACECode[] = [];
		const toProcess: string[] = [normalizeCode(code)];

		while (toProcess.length > 0) {
			const current = toProcess.shift()!;
			const children = this.getChildren(current);

			for (const child of children) {
				descendants.push(child);
				toProcess.push(child.code);
			}
		}

		return descendants;
	}

	getSiblings(code: string): NACECode[] {
		const codeObj = this.getCode(code);
		if (!codeObj) return [];

		const parent = this.getParent(code);
		if (!parent) {
			return this.getAllCodes(1).filter((c) => c.code !== codeObj.code);
		}

		return this.getChildren(parent.code).filter((c) => c.code !== codeObj.code);
	}

	getLevel(code: string): number {
		const codeObj = this.getCode(code);
		return codeObj ? codeObj.level : 0;
	}

	getAllCodes(level?: number): NACECode[] {
		this.ensureDataLoaded();
		const allCodes = Object.values(this.codes);

		if (level === undefined) {
			return allCodes;
		}

		return allCodes.filter((c) => c.level === level);
	}

	search(query: string, options?: SearchOptions): NACECode[] {
		this.ensureDataLoaded();
		const language = options?.language ?? "en";
		const limit = options?.limit ?? 10;
		const fuzzy = options?.fuzzy ?? false;

		const results: NACECode[] = [];
		const lowerQuery = query.toLowerCase();

		for (const code of Object.values(this.codes)) {
			const description = code.description[language];
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
		const words = query.split(/\s+/);
		return words.every((word) => text.includes(word));
	}
}
