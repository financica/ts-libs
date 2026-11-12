import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type BelcotaxLine, serializeBelcotaxBulk } from "../src/belcotax-bulk";

const fixture = (name: string): string =>
	readFileSync(new URL(`./fixtures/belcotax/${name}`, import.meta.url), "utf8");

const fixtureLines = (name: string): unknown[] =>
	fixture(name)
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown);

/** SPF's example bulk, one entry per line, looked up by key. */
const example = fixtureLines("exampleBelcotax2026.jsonl");
const exampleLine = (key: string): unknown => {
	const found = example.find(
		(line) =>
			typeof line === "object" &&
			line !== null &&
			(line as Record<string, unknown>)["k"] === key,
	);
	if (!found) throw new Error(`fixture has no line keyed ${key}`);
	return found;
};

const parse = (jsonl: string): unknown[] =>
	jsonl
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as unknown);

const BELGIAN_ADDRESS = {
	box: "1",
	number: "33  ",
	street: "Boulevard du Roi AlbertII",
	city: "Schaerbeek",
	postalCode: "1030",
	country: "150",
};

const PARTIES = {
	beneficiary: "testPersonWithNn",
	contact: "testContactData",
	debtor: "testOrganisation",
};

describe("serializeBelcotaxBulk: resources against SPF's examples", () => {
	it("serializes the contact, organisation and person lines", () => {
		const lines: BelcotaxLine[] = [
			{
				type: "contact",
				key: "testContactData",
				language: "fr",
				firstNames: ["FirstName1", "FirstName2"],
				lastNames: ["LastName1", "LastName2"],
				email: "test@test.be",
				preferredLanguage: "nl",
			},
			{
				type: "organisation",
				key: "testOrganisation",
				language: "fr",
				ids: { enterpriseNumber: "0308357159" },
				names: { fr: "Finances", nl: "Financiën", de: "Finanzen" },
				legalForm: "FPS",
				address: BELGIAN_ADDRESS,
			},
			{
				type: "person",
				key: "testPersonWithNn",
				language: "fr",
				ids: { ssin: "99090999997" },
				firstNames: ["FirstName"],
				lastNames: ["LastName"],
				address: BELGIAN_ADDRESS,
			},
			{
				type: "person",
				key: "personGermanWithBirthdate",
				language: "fr",
				firstNames: ["FirstName"],
				lastNames: ["LastName"],
				birthDate: "1980-01-05",
				address: {
					number: "12",
					street: "Musterstraße",
					city: "Berlin",
					postalCode: "10115",
					country: "103",
				},
			},
			{
				type: "person",
				key: "personWithTinAndNameAndAddress",
				language: "fr",
				ids: { tin: "F123456789" },
				lastNames: ["LastName"],
				address: {
					street: "Place de l'Hôtel de Ville",
					city: "Paris",
					postalCode: "75004",
					country: "111",
				},
			},
		];

		expect(parse(serializeBelcotaxBulk(lines, { incomeYear: 2026 }))).toEqual(
			[
				"testContactData",
				"testOrganisation",
				"testPersonWithNn",
				"personGermanWithBirthdate",
				"personWithTinAndNameAndAddress",
			].map(exampleLine),
		);
	});

	it("drops null and undefined optionals rather than writing them", () => {
		const out = serializeBelcotaxBulk(
			[
				{
					type: "person",
					key: "personWithOnlyNn",
					language: "fr",
					ids: { ssin: "99090999997", tin: null },
					firstNames: null,
					lastNames: undefined,
					birthDate: null,
					address: null,
				},
			],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([exampleLine("personWithOnlyNn")]);
	});
});

describe("serializeBelcotaxBulk: 281.50", () => {
	it.each([
		[
			"a9635d4b-175c-49fc-85b7-2d1262ce2264",
			{
				sequenceNumber: "1",
				commissions: 50,
				fees: 50,
				benefitsInKindAmount: 50,
				expensesOnBehalf: 50,
				amountsNote: "comment",
				benefitsInKindNature: "test",
				profession: "testJob",
			},
		],
		[
			"8f23ddcc-1be6-4df7-8b66-363131e56a6a",
			{
				noPayment: false,
				commissions: 50,
				fees: 50,
				benefitsInKindAmount: 50,
				expensesOnBehalf: 50,
				benefitsInKindNature: "test",
			},
		],
		[
			"fa46a041-a983-424e-ab12-a8dcffde6f39",
			{
				noPayment: true,
				commissions: 50,
				fees: 50,
				benefitsInKindAmount: 50,
				expensesOnBehalf: 50,
				amountActuallyPaid: 0,
				benefitsInKindNature: "test",
			},
		],
		[
			"6f6e3ddc-057e-4e8e-84d5-f0e0482d9d88",
			{
				commissions: 50,
				fees: 50,
				benefitsInKindAmount: 50,
				expensesOnBehalf: 50,
				sportsPerformers: 100,
				sportsTrainers: 100,
				benefitsInKindNature: "test",
			},
		],
	])("reproduces SPF's example fiche %s", (key, fields) => {
		const out = serializeBelcotaxBulk(
			[{ type: "281.50", key, ...PARTIES, ...fields }],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([exampleLine(key)]);
	});

	it("reproduces the guardianship fiche, whose debtor is FPS Justice", () => {
		const key = "7674d5e0-9798-420d-8c4b-d48ae2992a52";
		const out = serializeBelcotaxBulk(
			[
				{
					type: "281.50",
					key,
					...PARTIES,
					debtor: "Justice",
					guardianshipAllowances: 1000,
				},
			],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([exampleLine(key)]);
	});

	it("rounds amounts to the cent so float noise cannot fail multipleOf", () => {
		const out = serializeBelcotaxBulk(
			[{ type: "281.50", key: "F-1", ...PARTIES, fees: 0.1 + 0.2 }],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([
			{ $s: "urn:f:d:2026:50:2", "2061": 0.3, ...SHORT_PARTIES, k: "F-1" },
		]);
	});

	it("writes the replacement marker as zone 2205 = 3", () => {
		const out = serializeBelcotaxBulk(
			[{ type: "281.50", key: "F-1", ...PARTIES, fees: 10, replacesFiche: true }],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([
			{
				$s: "urn:f:d:2026:50:2",
				"2061": 10,
				"2205": "3",
				...SHORT_PARTIES,
				k: "F-1",
			},
		]);
	});
});

const SHORT_PARTIES = {
	b: "testPersonWithNn",
	c: "testContactData",
	d: "testOrganisation",
};

describe("serializeBelcotaxBulk: 281.20", () => {
	it.each([
		["9e6c6942-e803-425e-8bfa-6b071b979d01", { "2060": 10000 }],
		[
			"58bc0d57-e656-4aa3-81bd-1aa92ef5d738",
			{ "2060": 10000, "2068": 5000, "2099": ["A", "I"] as const },
		],
		[
			"0c348382-938e-495a-b799-86121412bffc",
			{
				"2060": 5000,
				"2079": 1000,
				"4220": [
					{ "2106": 0.23 },
					{ "2106": 0.535 },
					{ "2106": 0.115 },
					{ "2106": 0.2 },
				],
			},
		],
		[
			"b8b8dd38-565e-4aff-85e5-e2b7043f4fdf",
			{ "2033": "1", "2060": 5000, "2080": 1000, "4220": [{ "2106": 0 }] },
		],
		[
			"7226d8b3-7b49-4dbb-ab4b-d6f20ebb6b12",
			{ "2087": 10000, "2207": 5000, "2208": 5000 },
		],
	] as const)("reproduces SPF's example fiche %s", (key, zones) => {
		const out = serializeBelcotaxBulk(
			[{ type: "281.20", key, ...PARTIES, zones }],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([exampleLine(key)]);
	});

	it("writes other codes (4020) and kilometres as whole numbers", () => {
		const out = serializeBelcotaxBulk(
			[
				{
					type: "281.20",
					key: "F-2",
					...PARTIES,
					zones: {
						"2226": 1200,
						"4020": [{ "2092": "250", "2185": 12.345 }],
					},
				},
			],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual([
			{
				$s: "urn:f:d:2026:20:2",
				"2226": 1200,
				"4020": [{ "2092": "250", "2185": 12.35 }],
				...SHORT_PARTIES,
				k: "F-2",
			},
		]);
	});
});

describe("serializeBelcotaxBulk: deletions and replacements", () => {
	it("serializes deletions as SPF's example does", () => {
		const out = serializeBelcotaxBulk(
			[
				{ type: "delete-fiche", key: "bc060677-b166-4db8-9fc2-41e7611d0e1e" },
				{ type: "delete-resource", key: "testOrganisation" },
				{ type: "delete-resource", key: "testPersonWithNn" },
			],
			{ incomeYear: 2026 },
		);
		expect(parse(out)).toEqual(fixtureLines("delete_fiche_and_ressource.jsonl"));
	});
});

describe("serializeBelcotaxBulk: output shape", () => {
	it("writes one JSON object per line, newline-terminated, in input order", () => {
		const out = serializeBelcotaxBulk(
			[
				{ type: "delete-resource", key: "A" },
				{ type: "delete-fiche", key: "B" },
			],
			{ incomeYear: 2026 },
		);
		expect(out).toBe('{"$s":"urn:r:x:1","k":"A"}\n{"$s":"urn:f:x:1","k":"B"}\n');
	});

	it("applies the bulk language to every line that does not set its own", () => {
		const out = serializeBelcotaxBulk(
			[
				{ type: "281.50", key: "F-1", ...PARTIES, fees: 1 },
				{
					type: "contact",
					key: "C",
					email: "a@b.be",
					preferredLanguage: "fr",
					language: "de",
				},
			],
			{ incomeYear: 2026, language: "nl" },
		);
		expect(parse(out).map((line) => (line as { $s: string }).$s)).toEqual([
			"urn:f:d:2026:50:2:nl",
			"urn:r:d:c:1:de",
		]);
	});
});

describe("serializeBelcotaxBulk: refusals", () => {
	const fiche = (fields: object): BelcotaxLine => ({
		type: "281.50",
		key: "F-1",
		...PARTIES,
		...fields,
	});

	it.each<[string, BelcotaxLine[], RegExp]>([
		["a negative amount", [fiche({ fees: -1 })], /2061.*non-negative/],
		["a non-finite amount", [fiche({ fees: Number.NaN })], /2061.*finite/],
		[
			"hours above the 120 cap",
			[{ type: "281.20", key: "F", ...PARTIES, zones: { "2230": 121 } }],
			/2230.*120/,
		],
		[
			"a percentage of 100%",
			[
				{
					type: "281.20",
					key: "F",
					...PARTIES,
					zones: { "4220": [{ "2106": 1 }] },
				},
			],
			/2106.*0\.9999/,
		],
		[
			"a duplicate benefit-in-kind code",
			[{ type: "281.20", key: "F", ...PARTIES, zones: { "2099": ["A", "A"] } }],
			/2099.*duplicate/,
		],
		[
			"eleven other codes",
			[
				{
					type: "281.20",
					key: "F",
					...PARTIES,
					zones: {
						"4020": Array.from({ length: 11 }, () => ({
							"2092": "250",
							"2185": 1,
						})),
					},
				},
			],
			/4020.*10/,
		],
		[
			"a malformed SSIN",
			[{ type: "person", key: "P", ids: { ssin: "12345678901" } }],
			/SSIN/,
		],
		[
			"a person enterprise number starting with 9",
			[{ type: "person", key: "P", ids: { enterpriseNumber: "9123456789" } }],
			/enterprise number/,
		],
		[
			"an organisation without a name",
			[{ type: "organisation", key: "O", names: {} }],
			/name/,
		],
		[
			"a country that is not an INS code",
			[
				{
					type: "organisation",
					key: "O",
					names: { fr: "X" },
					address: { country: "BE" },
				},
			],
			/INS/,
		],
		[
			"an invalid e-mail",
			[{ type: "contact", key: "C", email: "nope", preferredLanguage: "fr" }],
			/e-mail/,
		],
		[
			"a phone number without +",
			[
				{
					type: "contact",
					key: "C",
					email: "a@b.be",
					preferredLanguage: "fr",
					mobilePhone: "0498123456",
				},
			],
			/phone/,
		],
		[
			"six first names",
			[
				{
					type: "person",
					key: "P",
					firstNames: ["a", "b", "c", "d", "e", "f"],
				},
			],
			/first names.*5/,
		],
		["an empty key", [fiche({ key: "" })], /key/],
		["a key over 255 characters", [fiche({ key: "x".repeat(256) })], /key/],
		[
			"two fiches with the same key",
			[fiche({}), fiche({ fees: 2 })],
			/duplicate fiche key F-1/,
		],
		[
			"two resources with the same key",
			[
				{ type: "contact", key: "C", email: "a@b.be", preferredLanguage: "fr" },
				{ type: "contact", key: "C", email: "c@d.be", preferredLanguage: "nl" },
			],
			/duplicate resource key C/,
		],
	])("refuses %s", (_label, lines, message) => {
		expect(() => serializeBelcotaxBulk(lines, { incomeYear: 2026 })).toThrow(
			message,
		);
	});

	it("refuses an income year it has no schema for", () => {
		expect(() =>
			serializeBelcotaxBulk([fiche({ fees: 1 })], { incomeYear: 2025 }),
		).toThrow(/2025/);
	});

	it("refuses an empty bulk", () => {
		expect(() => serializeBelcotaxBulk([], { incomeYear: 2026 })).toThrow(/empty/);
	});
});
