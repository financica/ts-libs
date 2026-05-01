import { describe, expect, it } from "vitest";
import {
	extractCustomerTaxIdentifiers,
	listPeppolReceiverIdentifierCandidates,
	normalizeCompanyNumberForCountry,
	resolveTaxNumberType,
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

describe("resolveTaxNumberType", () => {
	it("maps BE/NL/FR country codes", () => {
		expect(
			resolveTaxNumberType({ countryCode: "BE", taxNumber: "0793904121" }),
		).toBe(1);
		expect(resolveTaxNumberType({ countryCode: "NL", taxNumber: "12345678" })).toBe(
			2,
		);
		expect(
			resolveTaxNumberType({ countryCode: "FR", taxNumber: "123456789" }),
		).toBe(3);
	});

	it("infers from the tax-number prefix when country is unknown", () => {
		expect(
			resolveTaxNumberType({ countryCode: null, taxNumber: "BE0793904121" }),
		).toBe(1);
	});

	it("returns null when no tax number is provided", () => {
		expect(resolveTaxNumberType({ countryCode: "BE", taxNumber: null })).toBeNull();
	});

	it("returns null for unsupported countries", () => {
		expect(
			resolveTaxNumberType({ countryCode: "DE", taxNumber: "12345" }),
		).toBeNull();
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
