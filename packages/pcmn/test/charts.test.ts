import { describe, expect, it } from "vitest";
import {
	accountByCode,
	coversCode,
	labelFor,
	PCMN_ASSOCIATIONS,
	PCMN_CHARTS,
	PCMN_ENTREPRISES,
	PCMN_LANGUAGES,
	type PcmnChart,
	resolveCode,
} from "../src/charts/index.js";

const charts: PcmnChart[] = [PCMN_ENTREPRISES, PCMN_ASSOCIATIONS];

describe.each(charts)("$id", (chart) => {
	it("has unique codes in the order the annexe prints them", () => {
		const codes = chart.accounts.map((a) => a.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("gives every account a depth matching its number, and a parent", () => {
		const codes = new Set(chart.accounts.map((a) => a.code));
		const ranges = chart.accounts.filter((a) => a.codeTo);
		for (const a of chart.accounts) {
			expect(a.depth).toBe(a.code.length);
			if (a.depth <= 1) continue;
			const parent = a.code.slice(0, -1);
			const covered =
				codes.has(parent) ||
				ranges.some(
					(r) => r.code.length === parent.length && coversCode(r, parent),
				);
			expect(covered, `${a.code} has no parent ${parent}`).toBe(true);
		}
	});

	it("names every account in at least one language", () => {
		for (const a of chart.accounts) {
			expect(
				Object.keys(a.label).length,
				`${a.code} has no language`,
			).toBeGreaterThan(0);
		}
	});

	it("only ever uses the four published languages", () => {
		for (const a of chart.accounts) {
			for (const key of Object.keys(a.label)) {
				expect(PCMN_LANGUAGES).toContain(key);
			}
		}
	});
});

describe("the annexe's own gaps are preserved, not papered over", () => {
	it("leaves the French 550 range unnamed, as the French page does", () => {
		const range = accountByCode(PCMN_ASSOCIATIONS, "550");
		expect(range?.codeTo).toBe("559");
		expect(range?.label.fr).toBeUndefined();
		expect(range?.label.nl).toBeDefined();
		// falls back rather than pretending French has it
		expect(labelFor(range!, "fr")).toBe(range?.label.nl);
	});

	it("leaves 6702 without Dutch, which the Dutch page misnumbers as 6701", () => {
		const account = accountByCode(PCMN_ASSOCIATIONS, "6702");
		expect(account?.label.nl).toBeUndefined();
		expect(account?.label.fr).toBe("Charges fiscales estimées");
	});

	it("distinguishes an unnamed account from a missing one", () => {
		// 669 is a heading the annexe prints without wording: present, unnamed.
		const unnamed = accountByCode(PCMN_ENTREPRISES, "669");
		expect(unnamed).toBeDefined();
		expect(labelFor(unnamed!, "fr")).toBe("");
		// 203 is repealed — shown as "[...]" — and kept the same way.
		expect(labelFor(accountByCode(PCMN_ENTREPRISES, "203")!, "en")).toBe("");
		// 610-616 are not in the annexe at all: the law leaves 61 for the entity
		// to subdivide, so an application adds them, not this table.
		expect(accountByCode(PCMN_ENTREPRISES, "610")).toBeUndefined();
	});
});

describe("resolveCode", () => {
	it("resolves a sub-account to the rubric that governs it", () => {
		expect(resolveCode(PCMN_ENTREPRISES, "620100")?.code).toBe("6201");
	});

	it("resolves through a range", () => {
		const hit = resolveCode(PCMN_ENTREPRISES, "5551");
		expect(hit?.code).toBe("550");
		expect(hit?.codeTo).toBe("559");
	});

	it("returns nothing for a code no class covers", () => {
		expect(resolveCode(PCMN_ENTREPRISES, "9999")).toBeUndefined();
	});
});

describe("the two charts differ where the law differs", () => {
	it("redefines equity for associations", () => {
		expect(accountByCode(PCMN_ENTREPRISES, "10")?.label.fr).toBe("Capital");
		expect(accountByCode(PCMN_ASSOCIATIONS, "10")?.label.fr).toBe(
			"Fonds de l’association ou de la fondation",
		);
	});

	it("shifts 643 from miscellaneous charges to donations", () => {
		expect(accountByCode(PCMN_ENTREPRISES, "643")?.codeTo).toBe("648");
		expect(accountByCode(PCMN_ASSOCIATIONS, "643")?.label.en).toBe("Gifts");
	});

	it("gives associations their own revenue, and carries NBB rubrics", () => {
		const contributions = accountByCode(PCMN_ASSOCIATIONS, "73");
		expect(contributions?.label.en).toBe(
			"Membership fees, gifts, legacies and subsidies",
		);
		expect(contributions?.rubric).toBe("I.D");
		expect(accountByCode(PCMN_ENTREPRISES, "73")).toBeUndefined();
	});
});

describe("the registry", () => {
	it("keys each chart by its own id", () => {
		for (const [id, chart] of Object.entries(PCMN_CHARTS)) {
			expect(chart.id).toBe(id);
		}
	});
});
