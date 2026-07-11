import { describe, expect, it } from "vitest";
import {
	type FixedAssetGroup,
	fixedAssetGroupForCode,
	PCMN_FIXED_ASSET_CLASSES,
} from "../src/assets.js";

describe("fixedAssetGroupForCode", () => {
	const cases: [string, FixedAssetGroup][] = [
		["200000", "formationExpenses"],
		["210000", "intangible"],
		["220000", "tangible"], // terrains et constructions
		["230000", "tangible"], // installations, machines
		["240000", "tangible"], // mobilier et matériel roulant
		["260000", "tangible"],
		["280000", "financial"],
	];
	it.each(cases)("%s -> %s", (code, group) => {
		expect(fixedAssetGroupForCode(code)).toBe(group);
	});

	it("returns null outside classes 20-28", () => {
		expect(fixedAssetGroupForCode("290000")).toBeNull(); // amortisations (contra)
		expect(fixedAssetGroupForCode("610000")).toBeNull();
	});
});

describe("PCMN_FIXED_ASSET_CLASSES", () => {
	it("does not depreciate financial assets (28) or assets under construction (27)", () => {
		expect(PCMN_FIXED_ASSET_CLASSES["28"]?.depreciable).toBe(false);
		expect(PCMN_FIXED_ASSET_CLASSES["27"]?.depreciable).toBe(false);
		expect(PCMN_FIXED_ASSET_CLASSES["21"]?.depreciable).toBe(true);
	});
});
