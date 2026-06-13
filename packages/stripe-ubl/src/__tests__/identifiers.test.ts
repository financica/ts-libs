import { describe, expect, it } from "vitest";
import {
	buildCompanyId,
	extractCustomerTaxIdentifiers,
	listPeppolReceiverIdentifierCandidates,
	normalizeCompanyNumberForCountry,
	parsePeppolEndpoint,
	resolveCompanyIdScheme,
} from "../identifiers";

describe("normalizeCompanyNumberForCountry", () => {
	it("strips dots, spaces, and BE prefix for Belgian numbers", () => {
		expect(normalizeCompanyNumberForCountry("BE", "BE 0793.904.121")).toBe(
			"0793904121",
		);
	});

	it("trims but does not reformat numbers in unknown countries", () => {
		expect(normalizeCompanyNumberForCountry("US", "  12-3456789  ")).toBe(
			"12-3456789",
		);
	});

	it("returns empty string for empty input", () => {
		expect(normalizeCompanyNumberForCountry("BE", null)).toBe("");
	});
});

describe("resolveCompanyIdScheme", () => {
	it("maps BE/NL/FR country codes to ICD schemes", () => {
		expect(
			resolveCompanyIdScheme({ countryCode: "BE", companyNumber: "0793904121" }),
		).toBe("0208");
		expect(
			resolveCompanyIdScheme({ countryCode: "NL", companyNumber: "12345678" }),
		).toBe("0106");
		expect(
			resolveCompanyIdScheme({ countryCode: "FR", companyNumber: "123456789" }),
		).toBe("0002");
	});

	it("infers from the number prefix when country is unknown", () => {
		expect(
			resolveCompanyIdScheme({
				countryCode: null,
				companyNumber: "BE0793904121",
			}),
		).toBe("0208");
	});

	it("returns null for unsupported countries and empty input", () => {
		expect(
			resolveCompanyIdScheme({ countryCode: "DE", companyNumber: "12345" }),
		).toBeNull();
		expect(
			resolveCompanyIdScheme({ countryCode: "BE", companyNumber: null }),
		).toBeNull();
	});
});

describe("buildCompanyId", () => {
	it("normalizes the value and attaches the scheme", () => {
		expect(
			buildCompanyId({ countryCode: "BE", companyNumber: "BE 0793.904.121" }),
		).toEqual({ value: "0793904121", scheme: "0208" });
	});

	it("returns null when there is no company number", () => {
		expect(buildCompanyId({ countryCode: "BE", companyNumber: null })).toBeNull();
	});
});

describe("parsePeppolEndpoint", () => {
	it("splits scheme:value", () => {
		expect(parsePeppolEndpoint("0208:0800279001")).toEqual({
			scheme: "0208",
			value: "0800279001",
		});
	});

	it("returns null without an explicit scheme", () => {
		expect(parsePeppolEndpoint("0800279001")).toBeNull();
		expect(parsePeppolEndpoint(null)).toBeNull();
		expect(parsePeppolEndpoint(":value")).toBeNull();
	});
});

describe("extractCustomerTaxIdentifiers", () => {
	it("extracts VAT and Peppol identifiers from a Stripe-style array", () => {
		const ids = extractCustomerTaxIdentifiers([
			{ type: "eu_vat", value: "BE0793904121" },
			{ type: "peppol_id", value: "0208:0793904121" },
		]);
		expect(ids.vatNumber).toBe("BE0793904121");
		expect(ids.peppolID).toBe("0208:0793904121");
	});

	it("returns nulls for empty/non-array input", () => {
		expect(extractCustomerTaxIdentifiers(null)).toEqual({
			peppolID: null,
			glnNumber: null,
			taxNumber: null,
			vatNumber: null,
		});
	});
});

describe("listPeppolReceiverIdentifierCandidates", () => {
	it("deduplicates and filters null values", () => {
		expect(
			listPeppolReceiverIdentifierCandidates({
				peppolID: "0208:123",
				vatNumber: "BE123",
				taxNumber: "BE123",
				glnNumber: null,
			}),
		).toEqual(["0208:123", "BE123"]);
	});
});
