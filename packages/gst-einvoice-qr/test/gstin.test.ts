import { describe, expect, it } from "vitest";
import {
	gstinCheckCharacter,
	isSameLegalEntity,
	isUnregisteredPerson,
	isValidGstin,
	parseGstin,
} from "../src/index.js";

describe("isValidGstin", () => {
	it.each([
		"27AAPFU0939F1ZV",
		"24AAACC1206D1ZM",
		"09AAACH7409R1ZZ",
		"29AAPFU0939F1ZR",
	])("accepts the real GSTIN %s", (gstin) => {
		expect(isValidGstin(gstin)).toBe(true);
	});

	it("accepts lowercase and surrounding whitespace", () => {
		expect(isValidGstin("  27aapfu0939f1zv  ")).toBe(true);
	});

	it.each([
		["wrong check character", "27AAPFU0939F1ZA"],
		["too short", "27AAPFU0939F1Z"],
		["too long", "27AAPFU0939F1ZVV"],
		["letters where digits belong", "AAAAPFU0939F1ZV"],
		["empty", ""],
		["the URP placeholder", "URP"],
		// Same characters, two of them swapped: format still passes, checksum must not.
		["a transposition that keeps the format", "27AAPFU9039F1ZV"],
	])("rejects %s", (_case, gstin) => {
		expect(isValidGstin(gstin)).toBe(false);
	});
});

describe("gstinCheckCharacter", () => {
	it("reproduces the published check character", () => {
		expect(gstinCheckCharacter("27AAPFU0939F1ZV")).toBe("V");
	});

	it("returns empty for characters outside the base-36 alphabet", () => {
		// The bad character must sit in the scanned range: the final position is
		// the check character itself and is never read.
		expect(gstinCheckCharacter("27AAPFU0939F1*V")).toBe("");
	});
});

describe("parseGstin", () => {
	it("splits a GSTIN into its parts", () => {
		expect(parseGstin("27AAPFU0939F1ZV")).toEqual({
			gstin: "27AAPFU0939F1ZV",
			stateCode: "27",
			stateName: "Maharashtra",
			pan: "AAPFU0939F",
			panHolderCode: "F",
			panHolderType: "Firm / LLP",
			registrationNumber: 1,
			checkCharacter: "V",
		});
	});

	it("decodes the base-36 registration counter", () => {
		expect(parseGstin("33AAPFU0939F2Z1")?.registrationNumber).toBe(2);
	});

	it("returns null rather than partial data for an invalid GSTIN", () => {
		expect(parseGstin("27AAPFU0939F1ZA")).toBeNull();
	});
});

describe("isUnregisteredPerson", () => {
	it.each(["URP", "urp", " URP "])("recognises %s", (value) => {
		expect(isUnregisteredPerson(value)).toBe(true);
	});

	it("does not treat a real GSTIN as unregistered", () => {
		expect(isUnregisteredPerson("27AAPFU0939F1ZV")).toBe(false);
	});
});

describe("isSameLegalEntity", () => {
	it("matches two state registrations of one PAN", () => {
		expect(isSameLegalEntity("27AAPFU0939F1ZV", "29AAPFU0939F1ZR")).toBe(true);
	});

	it("does not match different PANs", () => {
		expect(isSameLegalEntity("27AAPFU0939F1ZV", "24AAACC1206D1ZM")).toBe(false);
	});

	it("is false when either side is invalid, rather than throwing", () => {
		expect(isSameLegalEntity("27AAPFU0939F1ZV", "URP")).toBe(false);
	});
});
