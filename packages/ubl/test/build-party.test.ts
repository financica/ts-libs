import { describe, expect, it } from "vitest";
import { buildCustomerParty, normalizeAddress } from "../src/build/index.js";

const addressIn = (countryCode: string | null) =>
	normalizeAddress({ country: countryCode }, null);

describe("buildCustomerParty", () => {
	it("routes a VAT-only customer via the country's VAT EAS scheme (BE → 9925)", () => {
		const party = buildCustomerParty({
			name: "Seven Camp",
			address: addressIn("BE"),
			countryCode: "BE",
			vatNumber: "BE1006119434",
		});
		expect(party.endpoint).toEqual({ scheme: "9925", value: "BE1006119434" });
	});

	it("derives the VAT scheme from the number's own prefix when countryCode is absent", () => {
		const party = buildCustomerParty({
			name: "Seven Camp",
			address: addressIn(null),
			vatNumber: "BE1006119434",
		});
		expect(party.endpoint).toEqual({ scheme: "9925", value: "BE1006119434" });
	});

	it("prefers an explicit Peppol ID over the VAT fallback", () => {
		const party = buildCustomerParty({
			name: "Acme",
			address: addressIn("BE"),
			countryCode: "BE",
			peppolID: "0208:0800279001",
			vatNumber: "BE0800279001",
		});
		expect(party.endpoint).toEqual({ scheme: "0208", value: "0800279001" });
	});

	it("prefers a GLN over the VAT fallback", () => {
		const party = buildCustomerParty({
			name: "Acme",
			address: addressIn("BE"),
			countryCode: "BE",
			glnNumber: "5400112233445",
			vatNumber: "BE0800279001",
		});
		expect(party.endpoint).toEqual({ scheme: "0088", value: "5400112233445" });
	});

	it("honours an explicit endpoint override (e.g. the registered identifier)", () => {
		const party = buildCustomerParty(
			{
				name: "Acme",
				address: addressIn("BE"),
				countryCode: "BE",
				vatNumber: "BE0800279001",
			},
			{ scheme: "0208", value: "0800279001" },
		);
		expect(party.endpoint).toEqual({ scheme: "0208", value: "0800279001" });
	});

	it("leaves the endpoint null when no identifier resolves to a scheme", () => {
		const party = buildCustomerParty({
			name: "Cash customer",
			address: addressIn("US"),
			countryCode: "US",
		});
		expect(party.endpoint).toBeNull();
	});

	it("carries the VAT number and a scheme-qualified CompanyID onto the party", () => {
		const party = buildCustomerParty({
			name: "Seven Camp",
			address: addressIn("BE"),
			countryCode: "BE",
			vatNumber: "BE1006119434",
			taxNumber: "BE1006119434",
		});
		expect(party.vatNumber).toBe("BE1006119434");
		expect(party.companyId).toEqual({ scheme: "0208", value: "1006119434" });
		expect(party.legalName).toBe("Seven Camp");
	});
});
