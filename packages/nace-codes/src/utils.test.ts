import { describe, expect, it } from "vitest";
import { determineLevel, normalizeCode } from "./utils";

describe("normalizeCode", () => {
	it("should normalize section codes to uppercase", () => {
		expect(normalizeCode("a")).toBe("A");
		expect(normalizeCode("m")).toBe("M");
		expect(normalizeCode("A")).toBe("A");
	});

	it("should normalize 2-digit codes", () => {
		expect(normalizeCode("01")).toBe("01");
		expect(normalizeCode("70")).toBe("70");
	});

	it("should normalize codes with dots by removing them", () => {
		expect(normalizeCode("01.1")).toBe("011");
		expect(normalizeCode("01.11")).toBe("0111");
		expect(normalizeCode("70.20")).toBe("7020");
	});

	it("should normalize NACEBEL codes", () => {
		expect(normalizeCode("01.110")).toBe("01110");
		expect(normalizeCode("01.11001")).toBe("0111001");
	});

	it("should trim whitespace", () => {
		expect(normalizeCode(" A ")).toBe("A");
		expect(normalizeCode(" 70.20 ")).toBe("7020");
	});

	it("should handle codes with trailing spaces (from TSV)", () => {
		expect(normalizeCode("A      ")).toBe("A");
		expect(normalizeCode("01.11  ")).toBe("0111");
	});
});

describe("determineLevel", () => {
	it("should determine section level (1)", () => {
		expect(determineLevel("A")).toBe(1);
		expect(determineLevel("M")).toBe(1);
		expect(determineLevel("U")).toBe(1);
	});

	it("should determine division level (2)", () => {
		expect(determineLevel("01")).toBe(2);
		expect(determineLevel("70")).toBe(2);
		expect(determineLevel("99")).toBe(2);
	});

	it("should determine group level (3)", () => {
		expect(determineLevel("011")).toBe(3);
		expect(determineLevel("01.1")).toBe(3);
		expect(determineLevel("702")).toBe(3);
		expect(determineLevel("70.2")).toBe(3);
	});

	it("should determine class level (4)", () => {
		expect(determineLevel("0111")).toBe(4);
		expect(determineLevel("01.11")).toBe(4);
		expect(determineLevel("7020")).toBe(4);
		expect(determineLevel("70.20")).toBe(4);
	});

	it("should determine NACEBEL subclass level (5)", () => {
		expect(determineLevel("01110")).toBe(5);
		expect(determineLevel("01.110")).toBe(5);
		expect(determineLevel("70201")).toBe(5);
		expect(determineLevel("70.201")).toBe(5);
	});

	it("should determine NACEBEL detailed level (7)", () => {
		expect(determineLevel("0111001")).toBe(7);
		expect(determineLevel("01.11001")).toBe(7);
		expect(determineLevel("7020101")).toBe(7);
		expect(determineLevel("70.20101")).toBe(7);
	});
});
