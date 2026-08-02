import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
	generateClientListingXml,
	MIN_TURNOVER_THRESHOLD,
	type ClientListingClient,
	type ClientListingInput,
} from "../src/client-listing";

const sampleData: ClientListingInput = {
	declarant: {
		vatNumber: "1024232601",
		name: "Leclanche Consulting",
		street: "Rue du Poincon 51A",
		postCode: "1000",
		city: "Brussels",
		countryCode: "BE",
		email: "jerome@leclan.ch",
		phone: "32494646278",
	},
	period: 2025,
	clients: [
		{
			vatNumber: "0766280697",
			countryCode: "BE",
			turnover: 10500,
			vatAmount: 2205,
		},
		{
			vatNumber: "0803774662",
			countryCode: "BE",
			turnover: 10500,
			vatAmount: 2205,
		},
	],
};

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
	parseTagValue: false,
	parseAttributeValue: false,
});

const node = (value: unknown): Record<string, unknown> =>
	value as Record<string, unknown>;

const parseListing = (xml: string) => {
	const parsed = node(parser.parse(xml));
	const consignment = node(parsed.ClientListingConsignment);
	return { consignment, listing: node(consignment.ClientListing) };
};

describe("generateClientListingXml", () => {
	it("declares the XML prolog and ClientListing consignment root", () => {
		const xml = generateClientListingXml(sampleData);
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

		const { consignment } = parseListing(xml);
		expect(consignment["@_ClientListingsNbr"]).toBe("1");
		expect(xml).toMatch(
			/xmlns="http:\/\/www\.minfin\.fgov\.be\/ClientListingConsignment"/,
		);
		expect(xml).toMatch(
			/xmlns:common="http:\/\/www\.minfin\.fgov\.be\/InputCommon"/,
		);
	});

	it("includes the declarant block with all provided fields", () => {
		const { listing } = parseListing(generateClientListingXml(sampleData));
		expect(node(listing.Declarant)).toMatchObject({
			VATNumber: "1024232601",
			Name: "Leclanche Consulting",
			Street: "Rue du Poincon 51A",
			PostCode: "1000",
			City: "Brussels",
			CountryCode: "BE",
			EmailAddress: "jerome@leclan.ch",
			Phone: "32494646278",
		});
	});

	it("computes per-listing totals from the client rows", () => {
		const { listing } = parseListing(generateClientListingXml(sampleData));
		expect(listing["@_ClientsNbr"]).toBe("2");
		expect(listing["@_TurnOverSum"]).toBe("21000.00");
		expect(listing["@_VATAmountSum"]).toBe("4410.00");
		expect(listing.TurnOver).toBe("21000.00");
	});

	it("emits one Client element per row with sequence numbers and issuer", () => {
		const { listing } = parseListing(generateClientListingXml(sampleData));
		const clients = listing.Client as Record<string, unknown>[];
		expect(clients).toHaveLength(2);
		expect(clients[0]?.["@_SequenceNumber"]).toBe("1");
		expect(clients[1]?.["@_SequenceNumber"]).toBe("2");
		expect(node(clients[0]?.CompanyVATNumber)).toMatchObject({
			"#text": "0766280697",
			"@_issuedBy": "BE",
		});
		expect(node(clients[0]).TurnOver).toBe("10500.00");
		expect(node(clients[0]).VATAmount).toBe("2205.00");
	});

	it("includes the reporting period", () => {
		const { listing } = parseListing(generateClientListingXml(sampleData));
		expect(listing.Period).toBe("2025");
	});

	it("omits optional declarant fields when not provided", () => {
		const xml = generateClientListingXml({
			...sampleData,
			declarant: {
				vatNumber: "1024232601",
				name: "Test Company",
				street: "Test Street",
				postCode: "1000",
				city: "Brussels",
				countryCode: "BE",
			},
		});
		const declarant = node(parseListing(xml).listing.Declarant);
		expect(declarant.EmailAddress).toBeUndefined();
		expect(declarant.Phone).toBeUndefined();
	});

	it("emits zeroed totals and no Client elements for an empty client list", () => {
		const { listing } = parseListing(
			generateClientListingXml({ ...sampleData, clients: [] }),
		);
		expect(listing["@_ClientsNbr"]).toBe("0");
		expect(listing["@_TurnOverSum"]).toBe("0.00");
		expect(listing["@_VATAmountSum"]).toBe("0.00");
		expect(listing.Client).toBeUndefined();
	});

	it("MIN_TURNOVER_THRESHOLD selects the customers that must be reported", () => {
		const clients: ClientListingClient[] = [
			{
				vatNumber: "0111111111",
				countryCode: "BE",
				turnover: 100,
				vatAmount: 21,
			},
			{
				vatNumber: "0222222222",
				countryCode: "BE",
				turnover: 250,
				vatAmount: 52,
			},
			{
				vatNumber: "0333333333",
				countryCode: "BE",
				turnover: 251,
				vatAmount: 53,
			},
		];
		const reportable = clients.filter((c) => c.turnover > MIN_TURNOVER_THRESHOLD);
		expect(reportable.map((c) => c.vatNumber)).toEqual(["0333333333"]);
	});

	it("escapes XML special characters in declarant text content", () => {
		const xml = generateClientListingXml({
			...sampleData,
			declarant: {
				...sampleData.declarant,
				name: "Test & Co <Ltd>",
				street: 'Rue "des" Fleurs',
			},
		});
		const declarant = node(parseListing(xml).listing.Declarant);
		expect(declarant.Name).toBe("Test & Co <Ltd>");
		expect(declarant.Street).toBe('Rue "des" Fleurs');
	});
});
