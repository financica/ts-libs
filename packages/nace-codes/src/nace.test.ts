import { beforeAll, describe, expect, it } from "vitest";
import { NACE } from "./nace";

describe("NACE", () => {
	let nace: NACE;

	beforeAll(() => {
		nace = new NACE();
	});

	describe("getCode", () => {
		it("should retrieve a section code", () => {
			const code = nace.getCode("A");
			expect(code).toBeDefined();
			expect(code?.code).toBe("A");
			expect(code?.level).toBe(1);
			expect(code?.description.en).toContain("AGRICULTURE");
		});

		it("should retrieve a division code", () => {
			const code = nace.getCode("01");
			expect(code).toBeDefined();
			expect(code?.code).toBe("01");
			expect(code?.level).toBe(2);
			expect(code?.description.en).toContain("Crop and animal production");
		});

		it("should retrieve a group code", () => {
			const code = nace.getCode("01.1");
			expect(code).toBeDefined();
			expect(code?.code).toBe("011");
			expect(code?.level).toBe(3);
			expect(code?.description.en).toContain("non-perennial crops");
		});

		it("should retrieve a class code", () => {
			const code = nace.getCode("01.11");
			expect(code).toBeDefined();
			expect(code?.code).toBe("0111");
			expect(code?.level).toBe(4);
			expect(code?.description.en).toContain("cereals");
		});

		it("should handle normalized codes", () => {
			const code1 = nace.getCode("70.20");
			const code2 = nace.getCode("7020");
			expect(code1).toEqual(code2);
		});

		it("should return null for invalid codes", () => {
			expect(nace.getCode("ZZ")).toBeNull();
			expect(nace.getCode("99.99")).toBeNull();
			expect(nace.getCode("invalid")).toBeNull();
		});

		it("should be case-insensitive for section codes", () => {
			const code1 = nace.getCode("a");
			const code2 = nace.getCode("A");
			expect(code1).toEqual(code2);
		});
	});

	describe("getParent", () => {
		it("should get parent of a class", () => {
			const parent = nace.getParent("01.11");
			expect(parent).toBeDefined();
			expect(parent?.code).toBe("011");
		});

		it("should get parent of a group", () => {
			const parent = nace.getParent("01.1");
			expect(parent).toBeDefined();
			expect(parent?.code).toBe("01");
		});

		it("should get parent of a division", () => {
			const parent = nace.getParent("01");
			expect(parent).toBeDefined();
			expect(parent?.code).toBe("A");
		});

		it("should return null for section codes", () => {
			const parent = nace.getParent("A");
			expect(parent).toBeNull();
		});

		it("should return null for invalid codes", () => {
			const parent = nace.getParent("invalid");
			expect(parent).toBeNull();
		});
	});

	describe("getChildren", () => {
		it("should get children of a section", () => {
			const children = nace.getChildren("A");
			expect(children.length).toBeGreaterThan(0);
			expect(children.every((c) => c.level === 2)).toBe(true);
			expect(children.some((c) => c.code === "01")).toBe(true);
		});

		it("should get children of a division", () => {
			const children = nace.getChildren("01");
			expect(children.length).toBeGreaterThan(0);
			expect(children.every((c) => c.level === 3)).toBe(true);
			expect(children.some((c) => c.code === "011")).toBe(true);
		});

		it("should get children of a group", () => {
			const children = nace.getChildren("01.1");
			expect(children.length).toBeGreaterThan(0);
			expect(children.every((c) => c.level === 4)).toBe(true);
			expect(children.some((c) => c.code === "0111")).toBe(true);
		});

		it("should return empty array for class codes", () => {
			const children = nace.getChildren("01.11");
			expect(children).toEqual([]);
		});

		it("should return empty array for invalid codes", () => {
			const children = nace.getChildren("invalid");
			expect(children).toEqual([]);
		});
	});

	describe("getAncestors", () => {
		it("should get all ancestors of a class", () => {
			const ancestors = nace.getAncestors("01.11");
			expect(ancestors).toHaveLength(3);
			expect(ancestors.map((a) => a.code)).toEqual(["011", "01", "A"]);
		});

		it("should get all ancestors of a group", () => {
			const ancestors = nace.getAncestors("01.1");
			expect(ancestors).toHaveLength(2);
			expect(ancestors.map((a) => a.code)).toEqual(["01", "A"]);
		});

		it("should return empty array for section codes", () => {
			const ancestors = nace.getAncestors("A");
			expect(ancestors).toEqual([]);
		});
	});

	describe("getDescendants", () => {
		it("should get all descendants of a division", () => {
			const descendants = nace.getDescendants("01");
			expect(descendants.length).toBeGreaterThan(5);
			expect(descendants.some((d) => d.level === 3)).toBe(true);
			expect(descendants.some((d) => d.level === 4)).toBe(true);
		});

		it("should get all descendants of a group", () => {
			const descendants = nace.getDescendants("01.1");
			expect(descendants.length).toBeGreaterThan(0);
			expect(descendants.every((d) => d.level === 4)).toBe(true);
		});

		it("should return empty array for class codes", () => {
			const descendants = nace.getDescendants("01.11");
			expect(descendants).toEqual([]);
		});
	});

	describe("getSiblings", () => {
		it("should get siblings of a division", () => {
			const siblings = nace.getSiblings("01");
			expect(siblings.length).toBeGreaterThan(0);
			expect(siblings.every((s) => s.level === 2)).toBe(true);
			expect(siblings.every((s) => s.code !== "01")).toBe(true);
		});

		it("should get siblings of a class", () => {
			const siblings = nace.getSiblings("01.11");
			expect(siblings.length).toBeGreaterThan(0);
			expect(siblings.every((s) => s.level === 4)).toBe(true);
			expect(siblings.every((s) => s.code !== "0111")).toBe(true);
			expect(siblings.some((s) => s.code === "0112")).toBe(true);
		});

		it("should return empty array for invalid codes", () => {
			const siblings = nace.getSiblings("invalid");
			expect(siblings).toEqual([]);
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
		it("should get all codes", () => {
			const allCodes = nace.getAllCodes();
			expect(allCodes.length).toBeGreaterThan(100);
		});

		it("should get all section codes", () => {
			const sections = nace.getAllCodes(1);
			expect(sections.length).toBeGreaterThan(10);
			expect(sections.length).toBeLessThan(30);
			expect(sections.every((s) => s.level === 1)).toBe(true);
		});

		it("should get all division codes", () => {
			const divisions = nace.getAllCodes(2);
			expect(divisions.length).toBeGreaterThan(50);
			expect(divisions.every((d) => d.level === 2)).toBe(true);
		});
	});

	describe("search", () => {
		it("should find codes by description", () => {
			const results = nace.search("agriculture");
			expect(results.length).toBeGreaterThan(0);
			expect(results.some((r) => r.code === "A")).toBe(true);
		});

		it("should respect language option", () => {
			const results = nace.search("agriculture", { language: "fr" });
			expect(results.length).toBeGreaterThan(0);
		});

		it("should respect limit option", () => {
			const results = nace.search("a", { limit: 5 });
			expect(results.length).toBeLessThanOrEqual(5);
		});

		it("should return empty array for no matches", () => {
			const results = nace.search("xyzabc123");
			expect(results).toEqual([]);
		});
	});

	describe("includes/excludes metadata", () => {
		it("should have includes/excludes for relevant codes", () => {
			const code = nace.getCode("01.11");
			expect(code?.includes).toBeDefined();
			expect(code?.includes).toContain("cereals");
			expect(code?.excludes).toBeDefined();
			expect(code?.excludes).toContain("rice");
		});
	});
});
