import { describe, expect, it } from "vitest";
import {
	CASH_CLASSES,
	DIRECTOR_REMUNERATION_ACCOUNT,
	isCashClass,
	PCMN_PL_CLASSES,
	type PlCategory,
	plCategoryForCode,
} from "../src/pl.js";

describe("plCategoryForCode", () => {
	// (account code, expected category) picked from the Belgian PCMN, not
	// re-derived from the table under test.
	const cases: [string, PlCategory][] = [
		["700000", "revenue"],
		["70", "revenue"],
		["600000", "goods"],
		["610000", "services"],
		["620200", "personnel"],
		["630000", "depreciation"],
		["640000", "otherCharges"],
		["650000", "financialCharges"],
		["660000", "exceptionalCharges"],
		["740000", "otherIncome"],
		["750000", "financialIncome"],
		["760000", "exceptionalIncome"],
	];
	it.each(cases)("%s -> %s", (code, category) => {
		expect(plCategoryForCode(code)).toBe(category);
	});

	it("classes director remuneration (618) as services, not personnel", () => {
		expect(plCategoryForCode("618")).toBe("services");
		expect(plCategoryForCode("618000")).toBe("services");
		// The generic 62 leaf that IS personnel, for contrast.
		expect(plCategoryForCode("620000")).toBe("personnel");
	});

	it("returns null for classes outside the compared P&L set", () => {
		expect(plCategoryForCode("710000")).toBeNull(); // stock variation
		expect(plCategoryForCode("440000")).toBeNull(); // suppliers (balance sheet)
		expect(plCategoryForCode("")).toBeNull();
	});

	it("tolerates surrounding whitespace", () => {
		expect(plCategoryForCode("  700000 ")).toBe("revenue");
	});
});

describe("PCMN_PL_CLASSES", () => {
	it("marks charge classes debit and income classes credit", () => {
		expect(PCMN_PL_CLASSES["60"]?.side).toBe("debit");
		expect(PCMN_PL_CLASSES["70"]?.side).toBe("credit");
		expect(PCMN_PL_CLASSES["75"]?.side).toBe("credit");
	});
});

describe("cash classes", () => {
	it("recognises 54/55/57 and nothing else", () => {
		expect(CASH_CLASSES).toEqual(["54", "55", "57"]);
		expect(isCashClass("550000")).toBe(true);
		expect(isCashClass("570000")).toBe(true);
		expect(isCashClass("540000")).toBe(true);
		expect(isCashClass("560000")).toBe(false); // transfers
		expect(isCashClass("400000")).toBe(false); // receivables
	});
});

describe("constants", () => {
	it("names the director-remuneration account", () => {
		expect(DIRECTOR_REMUNERATION_ACCOUNT).toBe("618");
	});
});
