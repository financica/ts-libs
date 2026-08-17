import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DDV_O_FIELD_BY_ID, DDV_O_FIELDS } from "../src/index.js";

describe("DDV_O_FIELDS registry", () => {
	it("has unique ids and a matching lookup map", () => {
		const ids = DDV_O_FIELDS.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const field of DDV_O_FIELDS) {
			expect(DDV_O_FIELD_BY_ID[field.id]).toBe(field);
		}
	});

	it("places the settlement boxes last and marks them as VAT amounts", () => {
		const settlement = DDV_O_FIELDS.filter((f) => f.section === "settlement");
		expect(settlement.map((f) => f.id)).toEqual(["f51", "f52"]);
		expect(settlement.every((f) => f.kind === "vat")).toBe(true);
	});

	it("tags each rate-specific charged box with its rate", () => {
		// The three standard-rate output boxes for domestic supplies / EU goods /
		// EU services all carry the 22 % rate.
		expect(DDV_O_FIELD_BY_ID.f21.rate).toBe(22);
		expect(DDV_O_FIELD_BY_ID.f23.rate).toBe(22);
		expect(DDV_O_FIELD_BY_ID.f25.rate).toBe(22);
		expect(DDV_O_FIELD_BY_ID.f22.rate).toBe(9.5);
		expect(DDV_O_FIELD_BY_ID.f22a.rate).toBe(5);
		expect(DDV_O_FIELD_BY_ID.f43.rate).toBe(8);
	});

	it("classifies tax-base vs VAT-amount sections correctly", () => {
		const bySection = (section: string) =>
			DDV_O_FIELDS.filter((f) => f.section === section);
		expect(bySection("supplies").every((f) => f.kind === "base")).toBe(true);
		expect(bySection("purchases").every((f) => f.kind === "base")).toBe(true);
		expect(bySection("vatCharged").every((f) => f.kind === "vat")).toBe(true);
		expect(bySection("vatDeducted").every((f) => f.kind === "vat")).toBe(true);
	});

	it("matches the monetary f* boxes of DDV_O_11.xsd, in schema order", () => {
		const xsd = readFileSync(
			fileURLToPath(new URL("../schemas/DDV_O_11.xsd", import.meta.url)),
			"utf8",
		);
		// The 32 xs:decimal boxes f11..f52; f02/f03/f04 are the integer/boolean
		// header flags, not registry fields.
		const decimalBoxes = [
			...xsd.matchAll(/<xs:element name="(f\d+[a-z]?)" type="xs:decimal"/g),
		].map((m) => m[1]);
		expect(decimalBoxes).toHaveLength(32);
		expect(DDV_O_FIELDS.map((f) => f.id)).toEqual(decimalBoxes);
	});
});
