import { DataLoader } from "./dataLoader";
import { NACE } from "./nace";
import type {
	NACEBELCode,
	NACEBELCodeMap,
	NACEBELOptions,
	SearchOptions,
} from "./types";
import { determineLevel, normalizeCode } from "./utils";

export class NACEBEL extends NACE {
	protected codes: NACEBELCodeMap;

	constructor(options?: NACEBELOptions) {
		super(options);
		if (options?.preload === true) {
			this.codes = DataLoader.loadNACEBELCodes();
		} else {
			this.codes = {};
		}
	}

	protected ensureDataLoaded(): void {
		if (Object.keys(this.codes).length === 0) {
			this.codes = DataLoader.loadNACEBELCodes();
		}
	}

	getCode(code: string): NACEBELCode | null {
		this.ensureDataLoaded();
		const normalized = normalizeCode(code);
		return this.codes[normalized] ?? null;
	}

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

	getAllCodes(level?: number): NACEBELCode[] {
		this.ensureDataLoaded();
		const allCodes = Object.values(this.codes);

		if (level === undefined) {
			return allCodes;
		}

		return allCodes.filter((c) => c.level === level);
	}
}
