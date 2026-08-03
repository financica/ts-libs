import { beforeAll, describe, expect, it } from "vitest";
import coreFr from "./generated/lang/fr";
import nacebelFr from "./generated/nacebel/lang/fr";
import { NACEBEL } from "./nacebel";
import type { NACEBELCode } from "./types";

function firstNoteCode(instance: NACEBEL): NACEBELCode {
	const code = instance
		.getAllCodes()
		.find((candidate) => candidate.explanatoryNote !== undefined);
	if (!code) throw new Error("no code carries an explanatory note");
	return code;
}

describe("NACEBEL", () => {
	let nacebel: NACEBEL;

	beforeAll(() => {
		nacebel = new NACEBEL();
	});

	describe("getCode", () => {
		it("should retrieve NACE codes", () => {
			const code = nacebel.getCode("A");
			expect(code).toBeDefined();
			expect(code?.code).toBe("A");
			expect(code?.level).toBe(1);
		});

		it("should retrieve NACEBEL 5-digit codes", () => {
			const code = nacebel.getCode("01.110");
			expect(code).toBeDefined();
			expect(code?.code).toBe("01110");
			expect(code?.level).toBe(5);
			expect(code?.nationalTitles).toBeDefined();
			expect(code?.nationalTitles?.nl).toBeDefined();
			expect(code?.nationalTitles?.fr).toBeDefined();
		});

		it("should retrieve NACEBEL 7-digit codes", () => {
			const code = nacebel.getCode("01.11001");
			expect(code).toBeDefined();
			expect(code?.code).toBe("0111001");
			expect(code?.level).toBe(7);
			expect(code?.nationalTitles).toBeDefined();
		});

		it("should handle normalized codes", () => {
			const code1 = nacebel.getCode("01.11001");
			const code2 = nacebel.getCode("0111001");
			expect(code1).toEqual(code2);
		});
	});

	describe("getBelgianExtensions", () => {
		it("should get Belgian extensions for a NACE class", () => {
			const extensions = nacebel.getBelgianExtensions("01.11");
			expect(extensions.length).toBeGreaterThan(0);
			expect(extensions.every((e) => e.level >= 5)).toBe(true);
			expect(extensions.some((e) => e.code === "01110")).toBe(true);
		});

		it("should get Belgian extensions for a NACE group", () => {
			const extensions = nacebel.getBelgianExtensions("01.1");
			expect(extensions.length).toBeGreaterThan(0);
		});

		it("should return empty array for invalid codes", () => {
			const extensions = nacebel.getBelgianExtensions("invalid");
			expect(extensions).toEqual([]);
		});
	});

	describe("getParent", () => {
		it("should get parent of NACEBEL 7-digit code", () => {
			const parent = nacebel.getParent("01.11001");
			expect(parent).toBeDefined();
			expect(parent?.code).toBe("01110");
		});

		it("should get parent of NACEBEL 5-digit code", () => {
			const parent = nacebel.getParent("01.110");
			expect(parent).toBeDefined();
			expect(parent?.code).toBe("0111");
		});
	});

	describe("getChildren", () => {
		it("should get children of NACEBEL 4-digit code", () => {
			const children = nacebel.getChildren("01.11");
			expect(children.length).toBeGreaterThan(0);
			expect(children.some((c) => c.level === 5)).toBe(true);
		});

		it("should get children of NACEBEL 5-digit code", () => {
			const children = nacebel.getChildren("01.110");
			expect(children.length).toBeGreaterThan(0);
			expect(children.every((c) => c.level === 7)).toBe(true);
		});
	});

	describe("multi-language support", () => {
		it("should have Belgian national titles", () => {
			const code = nacebel.getCode("01.110");
			expect(code?.nationalTitles?.nl).toBeDefined();
			expect(code?.nationalTitles?.fr).toBeDefined();
			expect(code?.nationalTitles?.de).toBeDefined();
			expect(code?.nationalTitles?.en).toBeDefined();
		});

		it("should have both NACE and NACEBEL descriptions", () => {
			const code = nacebel.getCode("01.11");
			expect(code?.description?.en).toBeDefined();
			const belCode = nacebel.getCode("01.11001");
			expect(belCode?.nationalTitles?.en).toBeDefined();
		});
	});

	describe("hierarchy navigation", () => {
		it("should navigate from NACEBEL to NACE codes", () => {
			const ancestors = nacebel.getAncestors("01.11001");

			expect(ancestors.length).toBeGreaterThan(3);
			expect(ancestors.some((a) => a.level === 5)).toBe(true);
			expect(ancestors.some((a) => a.level === 4)).toBe(true);
			expect(ancestors.some((a) => a.level === 3)).toBe(true);
			expect(ancestors.some((a) => a.level === 2)).toBe(true);
			expect(ancestors.some((a) => a.level === 1)).toBe(true);
		});

		it("should get all descendants including NACEBEL codes", () => {
			const descendants = nacebel.getDescendants("01.11");
			expect(descendants.length).toBeGreaterThan(1);
			expect(descendants.some((d) => d.level === 5)).toBe(true);
			expect(descendants.some((d) => d.level === 7)).toBe(true);
		});
	});

	describe("search", () => {
		it("should search in NACEBEL descriptions", () => {
			const results = nacebel.search("teelt", { language: "nl" });
			expect(results.length).toBeGreaterThan(0);
		});

		it("should search in French descriptions", () => {
			const results = nacebel.search("culture", { language: "fr" });
			expect(results.length).toBeGreaterThan(0);
		});
	});

	describe("language packs", () => {
		it("should ship national titles without any pack", () => {
			// nationalTitles stay eager: they are the primary Belgian display
			// strings and only cover three languages.
			const code = nacebel.getCode("01.11");
			expect(code?.nationalTitles.nl).toBeTruthy();
			expect(code?.nationalTitles.fr).toBeTruthy();
			expect(code?.nationalTitles.de).toBeTruthy();
		});

		it("should expose English-only explanatory notes by default", () => {
			expect(Object.keys(firstNoteCode(nacebel).explanatoryNote ?? {})).toEqual([
				"en",
			]);
		});

		it("should expose translated notes once the pack is passed", () => {
			const translated = new NACEBEL({ languages: [nacebelFr] });
			const code = translated.getCode(firstNoteCode(nacebel).code);
			expect(code?.explanatoryNote?.fr).toBeTruthy();
			expect(code?.explanatoryNote?.en).toBeTruthy();
		});

		it("should accept heading and note packs together", () => {
			const translated = new NACEBEL({ languages: [coreFr, nacebelFr] });
			const code = translated.getCode(firstNoteCode(nacebel).code);
			expect(code?.description.fr).toBeTruthy();
			expect(code?.explanatoryNote?.fr).toBeTruthy();
		});

		it("should not leak a pack into instances that did not ask for it", () => {
			const sample = firstNoteCode(nacebel).code;
			expect(
				new NACEBEL({ languages: [nacebelFr] }).getCode(sample)?.explanatoryNote
					?.fr,
			).toBeTruthy();
			expect(new NACEBEL().getCode(sample)?.explanatoryNote?.fr).toBeUndefined();
		});
	});
});
