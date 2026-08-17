import { describe, expect, it } from "vitest";
import {
	buildParticipantId,
	normalizeParticipantValue,
	PEPPOL_PARTICIPANT_SCHEMES,
} from "../src/identifiers";

/**
 * The SML name is `base32(sha256(lowercase("<scheme>:<value>")))`, so each pair
 * below is a registered-vs-NXDOMAIN fact, not a style preference: the expected
 * values were confirmed against the live production SML by NAPTR query.
 */
describe("normalizeParticipantValue", () => {
	it.each([
		// 0208 BE:EN — the enterprise number registers as 10 bare digits, but users
		// type it in its printed `0762.747.721` form.
		["0208", "0762.747.721", "0762747721"],
		// 9925 BE:VAT — the `BE` prefix is part of the registered value and must
		// survive; only the spacing and dots are decoration.
		["9925", "BE 0762.747.721", "BE0762747721"],
		// 0007 SE:ORGNR — printed with a hyphen before the last four digits,
		// registered as 10 bare digits.
		["0007", "212000-0787", "2120000787"],
		// 0204 DE:LWID — the Leitweg-ID's hyphens ARE the identifier. Stripping
		// them is the production bug this guards: `9910733568` is NXDOMAIN.
		["0204", "991-07335-68", "991-07335-68"],
		// 0246 DE:GEBA — DE[0-9]{9}(-[0-9]{5})?(\.[0-9A-Z]{1,8})?
		["0246", "DE123456789-12345.AB", "DE123456789-12345.AB"],
		// An uncatalogued scheme must fail safe and keep its separators.
		["0299", "abc-123.456", "abc-123.456"],
	])("normalizes %s:%s", (scheme, value, expected) => {
		expect(normalizeParticipantValue(scheme, value)).toBe(expected);
	});

	it("removes whitespace and illegal characters for every scheme", () => {
		// Whitespace is never legal in a value (POLICY 1), catalogued or not.
		expect(normalizeParticipantValue("0204", "  991-07335-68\t")).toBe(
			"991-07335-68",
		);
		expect(normalizeParticipantValue("0204", "991-073 35-68")).toBe("991-07335-68");
		expect(normalizeParticipantValue("0299", "a/b c:d")).toBe("abcd");
	});

	it("keeps the unreserved marks POLICY 1 allows on an uncatalogued scheme", () => {
		expect(normalizeParticipantValue("0299", "a-b.c_d~e")).toBe("a-b.c_d~e");
	});

	it("does not case-fold (buildSmlHostname lowercases before hashing)", () => {
		expect(normalizeParticipantValue("9925", "be0762747721")).toBe("be0762747721");
	});
});

describe("buildParticipantId", () => {
	it("joins the trimmed scheme to the normalized value", () => {
		expect(buildParticipantId(" 0208 ", "0762.747.721")).toBe("0208:0762747721");
		expect(buildParticipantId("0204", "991-07335-68")).toBe("0204:991-07335-68");
	});
});

const SEPARATOR = /[.\-_~]/;

describe("PEPPOL_PARTICIPANT_SCHEMES", () => {
	// Maintenance guard: the strip set is derived from `separatorFree`, so an
	// entry can only be marked strippable if its recorded structure really has no
	// separator. Adding a scheme without checking the code list fails here.
	it("marks a scheme separator-free only when its structure has no separator", () => {
		const wrong = PEPPOL_PARTICIPANT_SCHEMES.filter(
			(entry) => entry.separatorFree && SEPARATOR.test(entry.structure),
		);
		expect(wrong).toEqual([]);
	});

	it("records a separator-bearing structure for every preserved scheme", () => {
		// Non-vacuity: the predicate above actually discriminates.
		const preserved = PEPPOL_PARTICIPANT_SCHEMES.filter(
			(entry) => !entry.separatorFree,
		);
		expect(preserved.length).toBeGreaterThan(0);
		for (const entry of preserved) {
			expect(SEPARATOR.test(entry.structure)).toBe(true);
		}
	});

	it("catalogues each scheme once", () => {
		const codes = PEPPOL_PARTICIPANT_SCHEMES.map((entry) => entry.scheme);
		expect(codes).toHaveLength(new Set(codes).size);
	});

	it("covers the schemes the normalizer is asserted on", () => {
		const codes = new Set(PEPPOL_PARTICIPANT_SCHEMES.map((entry) => entry.scheme));
		for (const scheme of ["0007", "0208", "9925", "0204", "0225", "0246"]) {
			expect(codes.has(scheme)).toBe(true);
		}
	});
});
