import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { generateIntraListingXml, type IntraListingInput } from "../src/intra-listing";

const sample: IntraListingInput = {
	declarant: {
		vatNumber: "BE1006119434",
		name: "Seven Camp",
		street: "Rue du Poinçon 51A",
		postCode: "1000",
		city: "Bruxelles",
		countryCode: "BE",
		email: "billing@seven.camp",
	},
	period: { year: 2026, quarter: 3 },
	clients: [
		{ vatNumber: "U16090307", countryCode: "AT", code: "S", amount: 25000 },
		{ vatNumber: "72879981983", countryCode: "FR", code: "S", amount: 10000 },
		{ vatNumber: "862488084B01", countryCode: "NL", code: "L", amount: -1250.5 },
	],
};

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
	parseTagValue: false,
	parseAttributeValue: false,
	isArray: (name) => name === "IntraClient",
});

const node = (value: unknown): Record<string, unknown> =>
	value as Record<string, unknown>;

const parseListing = (xml: string) => {
	const consignment = node(node(parser.parse(xml))["IntraConsignment"]);
	return { consignment, listing: node(consignment["IntraListing"]) };
};

describe("generateIntraListingXml", () => {
	it("binds InputCommon as default and IntraConsignment as ns2", () => {
		const xml = generateIntraListingXml(sample);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(xml).toContain('xmlns="http://www.minfin.fgov.be/InputCommon"');
		expect(xml).toContain('xmlns:ns2="http://www.minfin.fgov.be/IntraConsignment"');
		expect(parseListing(xml).consignment["@_IntraListingsNbr"]).toBe("1");
	});

	it("derives the client count and signed total, with the declarant and period", () => {
		const { listing } = parseListing(generateIntraListingXml(sample));
		expect(listing).toMatchObject({
			"@_SequenceNumber": "1",
			"@_ClientsNbr": "3",
			"@_AmountSum": "33749.50",
			Period: { Quarter: "3", Year: "2026" },
		});
		expect(node(listing["Declarant"])).toMatchObject({
			VATNumber: "1006119434",
			Name: "Seven Camp",
			CountryCode: "BE",
		});
	});

	it("emits one IntraClient per row, in order", () => {
		const { listing } = parseListing(generateIntraListingXml(sample));
		expect(listing["IntraClient"]).toEqual([
			{
				"@_SequenceNumber": "1",
				CompanyVATNumber: { "#text": "U16090307", "@_issuedBy": "AT" },
				Code: "S",
				Amount: "25000.00",
			},
			{
				"@_SequenceNumber": "2",
				CompanyVATNumber: { "#text": "72879981983", "@_issuedBy": "FR" },
				Code: "S",
				Amount: "10000.00",
			},
			{
				"@_SequenceNumber": "3",
				CompanyVATNumber: { "#text": "862488084B01", "@_issuedBy": "NL" },
				Code: "L",
				Amount: "-1250.50",
			},
		]);
	});

	it("places a replaced listing before the declarant and a correcting period last", () => {
		const xml = generateIntraListingXml({
			...sample,
			replacedListing: "2-1006119434-202603",
			clients: [
				{
					vatNumber: "862488084B01",
					countryCode: "NL",
					code: "L",
					amount: -500,
					correctingPeriod: { year: 2026, month: 2 },
				},
			],
		});
		expect(xml.indexOf("ReplacedIntraListing")).toBeLessThan(
			xml.indexOf("Declarant"),
		);
		const [client] = parseListing(xml).listing["IntraClient"] as unknown[];
		expect(node(client)["CorrectingPeriod"]).toEqual({ Month: "2", Year: "2026" });
	});

	it.each([
		["Belgium", { countryCode: "BE" }, /member state other than BE/],
		["GR instead of EL", { countryCode: "GR" }, /member state other than BE/],
		[
			"a VAT number over 12 characters",
			{ vatNumber: "1234567890123" },
			/1-12 characters/,
		],
		[
			"a services correction",
			{ correctingPeriod: { year: 2026, quarter: 2 } },
			/cannot correct an earlier period/,
		],
	] as const)("refuses %s", (_label, override, message) => {
		expect(() =>
			generateIntraListingXml({
				...sample,
				clients: [
					{
						...sample.clients[0],
						...override,
					} as IntraListingInput["clients"][number],
				],
			}),
		).toThrow(message);
	});

	it("refuses an empty listing", () => {
		expect(() => generateIntraListingXml({ ...sample, clients: [] })).toThrow(
			/at least one client/,
		);
	});
});
