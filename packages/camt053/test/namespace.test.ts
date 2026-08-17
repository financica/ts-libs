import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAMT053_NS_PREFIX, parseCamt053 } from "../src/index.js";

const fixtureDir = join(import.meta.dirname, "fixtures");

describe("CAMT053_NS_PREFIX", () => {
	it("is the version-agnostic part of the namespace URI", () => {
		// Version-agnostic: the trailing version digits are deliberately absent, so
		// `camt.053.001.02` through `camt.053.001.10` all match.
		expect(CAMT053_NS_PREFIX).toBe("urn:iso:std:iso:20022:tech:xsd:camt.053.001.");
		expect(CAMT053_NS_PREFIX.endsWith(".")).toBe(true);
	});

	it("matches every document the parser accepts", () => {
		const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith(".xml"));
		expect(fixtures.length).toBeGreaterThan(0);

		for (const name of fixtures) {
			const xml = readFileSync(join(fixtureDir, name), "utf8");
			expect(parseCamt053(xml), name).not.toBeNull();
			expect(xml.includes(CAMT053_NS_PREFIX), name).toBe(true);
		}
	});

	it("does not match a sibling ISO 20022 message", () => {
		expect(
			"urn:iso:std:iso:20022:tech:xsd:camt.052.001.02".startsWith(
				CAMT053_NS_PREFIX,
			),
		).toBe(false);
		expect(
			"urn:iso:std:iso:20022:tech:xsd:pain.001.001.03".startsWith(
				CAMT053_NS_PREFIX,
			),
		).toBe(false);
	});
});
