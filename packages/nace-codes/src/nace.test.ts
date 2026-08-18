import { beforeAll, describe, expect, it } from "vitest";
import da from "./generated/lang/da";
import fr from "./generated/lang/fr";
import { NACE } from "./nace";
import { getParentCode } from "./utils";

const sorted = (codes: string[]) => [...codes].sort((a, b) => a.localeCompare(b));

describe("NACE", () => {
	let nace: NACE;

	beforeAll(() => {
		nace = new NACE();
	});

	describe("getCode", () => {
		// Codes and headings from NACE Rev. 2.1 (Regulation (EU) 2023/137, Annex).
		it.each([
			["A", "A", 1, "AGRICULTURE"],
			["01", "01", 2, "Crop and animal production"],
			["01.1", "011", 3, "non-perennial crops"],
			["01.11", "0111", 4, "cereals"],
		])("should retrieve %s as level %i", (input, code, level, fragment) => {
			const result = nace.getCode(input);
			expect(result).toMatchObject({ code, level });
			expect(result?.description.en).toContain(fragment);
		});

		it.each([
			["70.20", "7020"],
			["a", "A"],
		])("should treat %s and %s as the same code", (raw, normalized) => {
			expect(nace.getCode(raw)).not.toBeNull();
			expect(nace.getCode(raw)).toEqual(nace.getCode(normalized));
		});

		it("should return null for invalid codes", () => {
			expect(nace.getCode("ZZ")).toBeNull();
			expect(nace.getCode("99.99")).toBeNull();
			expect(nace.getCode("invalid")).toBeNull();
		});
	});

	describe("getParent", () => {
		it.each([
			["01.11", "011"],
			["01.1", "01"],
			["01", "A"],
		])("should get parent of %s", (code, parent) => {
			expect(nace.getParent(code)?.code).toBe(parent);
		});

		it("should return null for section codes", () => {
			expect(nace.getParent("A")).toBeNull();
		});

		it("should return null for invalid codes", () => {
			expect(nace.getParent("invalid")).toBeNull();
		});
	});

	describe("getChildren", () => {
		it.each([
			["A", 2, "01"],
			["01", 3, "011"],
			["01.1", 4, "0111"],
		])("should get children of %s", (code, level, child) => {
			const children = nace.getChildren(code);
			expect(children.length).toBeGreaterThan(0);
			expect(children.every((c) => c.level === level)).toBe(true);
			expect(children.some((c) => c.code === child)).toBe(true);
		});

		it("should return empty array for class codes", () => {
			expect(nace.getChildren("01.11")).toEqual([]);
		});

		it("should return empty array for invalid codes", () => {
			expect(nace.getChildren("invalid")).toEqual([]);
		});
	});

	describe("getAncestors", () => {
		it.each([
			["01.11", ["011", "01", "A"]],
			["01.1", ["01", "A"]],
			["A", []],
		])("should get ancestors of %s", (code, ancestors) => {
			expect(nace.getAncestors(code).map((a) => a.code)).toEqual(ancestors);
		});
	});

	describe("getDescendants", () => {
		it("should get all descendants of a division", () => {
			const descendants = nace.getDescendants("01");
			expect(descendants.some((d) => d.level === 3)).toBe(true);
			expect(descendants.some((d) => d.level === 4)).toBe(true);
			expect(descendants.every((d) => d.code.startsWith("01"))).toBe(true);
		});

		it("should get all descendants of a group", () => {
			const descendants = nace.getDescendants("01.1");
			expect(descendants.length).toBeGreaterThan(0);
			expect(descendants.every((d) => d.level === 4)).toBe(true);
		});

		it("should return empty array for class codes", () => {
			expect(nace.getDescendants("01.11")).toEqual([]);
		});
	});

	describe("getSiblings", () => {
		it("should get siblings of a division", () => {
			const siblings = nace.getSiblings("01");
			// Section A = divisions 01, 02, 03 (NACE Rev. 2.1).
			expect(siblings.map((s) => s.code)).toEqual(["02", "03"]);
		});

		it("should get siblings of a class", () => {
			const siblings = nace.getSiblings("01.11");
			expect(siblings.length).toBeGreaterThan(0);
			expect(siblings.every((s) => s.level === 4)).toBe(true);
			expect(siblings.every((s) => s.code !== "0111")).toBe(true);
			expect(siblings.some((s) => s.code === "0112")).toBe(true);
		});

		it("should return empty array for invalid codes", () => {
			expect(nace.getSiblings("invalid")).toEqual([]);
		});
	});

	describe("getLevel", () => {
		it("should return correct levels", () => {
			expect(nace.getLevel("A")).toBe(1);
			expect(nace.getLevel("01")).toBe(2);
			expect(nace.getLevel("01.1")).toBe(3);
			expect(nace.getLevel("01.11")).toBe(4);
		});

		it("should return 0 for invalid codes", () => {
			expect(nace.getLevel("invalid")).toBe(0);
		});
	});

	describe("getAllCodes", () => {
		// Statutory structure of NACE Rev. 2.1 (Regulation (EU) 2023/137;
		// Eurostat "NACE Rev. 2.1 – Statistical classification of economic
		// activities", 2023): 22 sections, 87 divisions, 287 groups, 651 classes.
		it.each([
			[1, 22],
			[2, 87],
			[3, 287],
			[4, 651],
		])("should hold the statutory number of level-%i codes", (level, count) => {
			const codes = nace.getAllCodes(level);
			expect(codes).toHaveLength(count);
			expect(codes.every((c) => c.level === level)).toBe(true);
		});

		it("should return every level when unfiltered", () => {
			expect(nace.getAllCodes()).toHaveLength(22 + 87 + 287 + 651);
		});
	});

	describe("hierarchy invariants", () => {
		it("should derive the same parent from the code as the data declares", () => {
			// Guards the hand-typed division-to-section map in utils.ts against the
			// PARENT_CODE column of the Eurostat structure file.
			const mismatches = nace
				.getAllCodes()
				.filter((c) => (getParentCode(c.code) ?? undefined) !== c.parent)
				.map((c) => [c.code, c.parent, getParentCode(c.code)]);
			expect(mismatches).toEqual([]);
		});

		it("should have every non-section code point at an existing parent", () => {
			for (const code of nace.getAllCodes()) {
				if (code.level === 1) {
					expect(code.parent).toBeUndefined();
				} else {
					expect(nace.getCode(code.parent!)).not.toBeNull();
				}
			}
		});

		it("should round-trip getChildren and getParent", () => {
			// One pass to invert getParent, then compare against getChildren:
			// the pairwise form is quadratic over the ~1000-code dataset.
			const all = nace.getAllCodes();
			const byParent = new Map<string, string[]>();
			for (const code of all) {
				const parent = nace.getParent(code.code);
				if (!parent) continue;
				byParent.set(parent.code, [
					...(byParent.get(parent.code) ?? []),
					code.code,
				]);
			}
			for (const parent of all) {
				const codes = nace.getChildren(parent.code).map((c) => c.code);
				expect(codes, `${parent.code} children are sorted`).toEqual(
					sorted(codes),
				);
				expect(codes, `${parent.code} children invert getParent`).toEqual(
					sorted(byParent.get(parent.code) ?? []),
				);
			}
		});

		it("should make getDescendants the transitive closure of getChildren", () => {
			for (const section of nace.getAllCodes(1)) {
				const descendants = nace.getDescendants(section.code);
				const closure = new Set<string>();
				const stack = [section.code];
				while (stack.length > 0) {
					for (const child of nace.getChildren(stack.pop()!)) {
						closure.add(child.code);
						stack.push(child.code);
					}
				}
				expect(new Set(descendants.map((d) => d.code))).toEqual(closure);
				for (const d of descendants) {
					expect(nace.getAncestors(d.code).map((a) => a.code)).toContain(
						section.code,
					);
				}
			}
		});
	});

	describe("search", () => {
		it("should find codes by description", () => {
			const results = nace.search("agriculture");
			expect(results.length).toBeGreaterThan(0);
			expect(results.some((r) => r.code === "A")).toBe(true);
		});

		it("should only return codes whose description contains the query", () => {
			const results = nace.search("cereals", { limit: 1000 });
			expect(results.length).toBeGreaterThan(0);
			for (const r of results) {
				expect(r.description.en.toLowerCase()).toContain("cereals");
			}
		});

		it("should make fuzzy results a superset of exact results", () => {
			const exact = new Set(
				nace.search("growing of cereals", { limit: 1000 }).map((r) => r.code),
			);
			const fuzzy = nace.search("growing cereals", {
				fuzzy: true,
				limit: 1000,
			});
			expect(exact.size).toBeGreaterThan(0);
			for (const code of exact) {
				expect(fuzzy.map((r) => r.code)).toContain(code);
			}
			for (const r of fuzzy) {
				const text = r.description.en.toLowerCase();
				expect(text).toContain("growing");
				expect(text).toContain("cereals");
			}
		});

		it("should find nothing in a language whose pack was not loaded", () => {
			// Only English ships in the default bundle, so searching an unloaded
			// language has nothing to match against.
			expect(nace.search("agriculture", { language: "fr" })).toEqual([]);
		});

		it("should respect language option once the pack is loaded", () => {
			const translated = new NACE({ languages: [fr] });
			const results = translated.search("agriculture", { language: "fr" });
			expect(results.length).toBeGreaterThan(0);
		});

		it("should respect limit option", () => {
			const unlimited = nace.search("a", { limit: Number.MAX_SAFE_INTEGER });
			expect(unlimited.length).toBeGreaterThan(5);
			expect(nace.search("a", { limit: 5 })).toHaveLength(5);
			expect(nace.search("a")).toHaveLength(10); // default limit
		});

		it("should return empty array for no matches", () => {
			expect(nace.search("xyzabc123")).toEqual([]);
		});
	});

	describe("includes/excludes metadata", () => {
		it("should have includes/excludes for relevant codes", () => {
			// Explanatory notes for 01.11 (NACE Rev. 2.1): includes cereals,
			// excludes growing of rice (01.12).
			const code = nace.getCode("01.11");
			expect(code?.includes).toContain("cereals");
			expect(code?.excludes).toContain("rice");
		});

		it("should only reference existing codes from includes/excludes", () => {
			// Cross-references such as "see 01.12" / "see division 56" must resolve.
			const pattern = /(?:see |class |group |division )(\d\d(?:\.\d\d?)?)/g;
			for (const code of nace.getAllCodes()) {
				for (const text of [code.includes, code.includesAlso, code.excludes]) {
					for (const [, ref] of text?.matchAll(pattern) ?? []) {
						expect(
							nace.getCode(ref!),
							`${code.code} -> ${ref}`,
						).not.toBeNull();
					}
				}
			}
		});
	});

	describe("language packs", () => {
		it("should expose a language once its pack is passed", () => {
			const code = new NACE({ languages: [fr] }).getCode("A");
			expect(code?.description.fr).toBeTruthy();
			expect(code?.description.fr).not.toBe(code?.description.en);
		});

		it("should expose several packs at once and no others", () => {
			const code = new NACE({ languages: [fr, da] }).getCode("01.11");
			expect(Object.keys(code?.description ?? {}).sort()).toEqual([
				"da",
				"en",
				"fr",
			]);
		});

		it("should keep English intact when a pack is applied", () => {
			const base = nace.getCode("01.11");
			const translated = new NACE({ languages: [fr] }).getCode("01.11");
			expect(translated?.description.en).toBe(base?.description.en);
		});

		it("should not leak a pack into instances that did not ask for it", () => {
			const translated = new NACE({ languages: [fr] });
			expect(translated.getCode("A")?.description.fr).toBeTruthy();
			// Shares the cached base map, so the overlay must not have mutated it;
			// this also pins that only English ships by default.
			expect(Object.keys(new NACE().getCode("A")?.description ?? {})).toEqual([
				"en",
			]);
		});

		it("should apply packs under preload too", () => {
			const code = new NACE({ preload: true, languages: [fr] }).getCode("A");
			expect(code?.description.fr).toBeTruthy();
		});

		it("should cover every code the English data covers", () => {
			const translated = new NACE({ languages: [fr] });
			const missing = translated
				.getAllCodes()
				.filter((code) => code.description.fr === undefined);
			expect(missing).toEqual([]);
		});
	});
});
