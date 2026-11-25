import type { Address, NbbFilingInput, RubricAmounts } from "../src/index.js";
import m04f from "../src/taxonomies/26.0/m04-f.js";
import m87f from "../src/taxonomies/26.0/m87-f.js";

/**
 * A complete micro filing for a company without capital, used as the starting
 * point for tests that vary one thing at a time.
 *
 * The figures satisfy the statutory arithmetic, which is the point: every
 * subtotal is the sum of the components also reported, and total assets equal
 * total liabilities. A fixture that merely looked plausible would let the
 * validator's own bugs pass unnoticed.
 */
export const MICRO_FILING: NbbFilingInput = {
	taxonomy: m87f,
	language: "fr",
	entity: {
		enterpriseNumber: "0925590628",
		name: "CALYX WORKS",
		legalForm: "m610",
		address: {
			street: "CHAUSSEE DE TIRLEMONT",
			houseNumber: "22",
			postbox: "7",
			postalCode: "5000",
		},
		// A mandatory mention: the filing application refuses a deposit without
		// one. Liège, division Namur, for the registered office above.
		businessCourt: "m19",
		statutesDate: "2019-03-22",
	},
	identification: {
		exercise: { startDate: "2025-01-01", endDate: "2025-12-31" },
		previousExercise: { startDate: "2024-01-01", endDate: "2024-12-31" },
		generalMeetingDate: "2026-06-15",
		previousPeriodDataUnchanged: true,
		pageCount: 12,
	},
	producer: { name: "Financica" },
	balanceSheet: {
		// Fixed assets: 21/28 = 21 + 22/27 + 28. The face of the balance sheet
		// carries these; the statement of fixed assets repeats the closing
		// figures under `(22/27)` and the like, and a filing reports the face.
		"20": { current: 0, previous: 0 },
		"21/28": { current: 40000, previous: 30000 },
		"21": { current: 0, previous: 0 },
		// 22/27 = 22 + 23 + 24 + 25 + 26 + 27, all of it furniture.
		"22/27": { current: 40000, previous: 30000 },
		"22": { current: 0, previous: 0 },
		"23": { current: 0, previous: 0 },
		"24": { current: 40000, previous: 30000 },
		"25": { current: 0, previous: 0 },
		"26": { current: 0, previous: 0 },
		"27": { current: 0, previous: 0 },
		"28": { current: 0, previous: 0 },

		// Current assets: 29/58 = 29 + 3 + 40/41 + 50/53 + 54/58 + 490/1
		"29": { current: 0, previous: 0 },
		"3": { current: 5000, previous: 4000 },
		"30/36": { current: 5000, previous: 4000 },
		"37": { current: 0, previous: 0 },
		"40/41": { current: 15000, previous: 12000 },
		"40": { current: 15000, previous: 12000 },
		"41": { current: 0, previous: 0 },
		"50/53": { current: 0, previous: 0 },
		"54/58": { current: 40000, previous: 34000 },
		"490/1": { current: 0, previous: 0 },
		"29/58": { current: 60000, previous: 50000 },

		// 20/58 = 20 + 21/28 + 29/58
		"20/58": { current: 100000, previous: 80000 },

		// Equity: 10/15 = 10/11 + 12 + 13 + (14) + 15 - 19
		"10/11": { current: 20000, previous: 20000 },
		// 10/11 = 110 + 111, and 13 = 130/1 + 132 + 133. The micro model prints
		// only the totals, but its own checks read the detail beneath them, so a
		// filing that reports the total alone fails at the NBB.
		"110": { current: 20000, previous: 20000 },
		"111": { current: 0, previous: 0 },
		"12": { current: 0, previous: 0 },
		"13": { current: 5000, previous: 5000 },
		// On 133, so that 130/1 = 1311 + 1312 + 1313 + 1319 holds at nil: the
		// checks run all the way down the breakdown, not just one level.
		"130/1": { current: 0, previous: 0 },
		"132": { current: 0, previous: 0 },
		"133": { current: 5000, previous: 5000 },
		// Last year's 20000 carried forward plus this year's 12000 result.
		"(14)": { current: 32000, previous: 20000 },
		"15": { current: 0, previous: 0 },
		"19": { current: 0, previous: 0 },
		"10/15": { current: 57000, previous: 45000 },

		"16": { current: 0, previous: 0 },
		// 17/49 = 17 + 42/48 + 492/3, and 42/48 down to its own components.
		"17/49": { current: 43000, previous: 35000 },
		"17": { current: 0, previous: 0 },
		"42/48": { current: 43000, previous: 35000 },
		"42": { current: 0, previous: 0 },
		"43": { current: 0, previous: 0 },
		"44": { current: 43000, previous: 35000 },
		"440/4": { current: 43000, previous: 35000 },
		"441": { current: 0, previous: 0 },
		"45": { current: 0, previous: 0 },
		"46": { current: 0, previous: 0 },
		"47/48": { current: 0, previous: 0 },
		"492/3": { current: 0, previous: 0 },
		"10/49": { current: 100000, previous: 80000 },
	},
	incomeStatement: {
		// 9900 = 70 - 60/61, then 9901 = 9900 less the operating charges, and
		// nothing financial or exceptional, so the result falls straight
		// through to 9905.
		"70": { current: 100000, previous: 84000 },
		"60/61": { current: 80000, previous: 67000 },
		"9900": { current: 20000, previous: 17000 },
		"62": { current: 8000, previous: 8000 },
		"630": { current: 0, previous: 0 },
		"631/4": { current: 0, previous: 0 },
		"635/8": { current: 0, previous: 0 },
		"640/8": { current: 0, previous: 0 },
		"649": { current: 0, previous: 0 },
		"66A": { current: 0, previous: 0 },
		"9901": { current: 12000, previous: 9000 },
		"75/76B": { current: 0, previous: 0 },
		"65/66B": { current: 0, previous: 0 },
		"9903": { current: 12000, previous: 9000 },
		"780": { current: 0, previous: 0 },
		"680": { current: 0, previous: 0 },
		"67/77": { current: 0, previous: 0 },
		"9904": { current: 12000, previous: 9000 },
		"789": { current: 0, previous: 0 },
		"689": { current: 0, previous: 0 },
		"9905": { current: 12000, previous: 9000 },
	},
	appropriation: {
		// 9906 = 9905 + last year's carried-forward result, all of it carried
		// forward again: no reserve movement and no distribution.
		"9906": { current: 32000, previous: 29000 },
		// The result carried forward into the exercise, which is its own rubric
		// in the appropriation account rather than last year's column of 14.
		"14P": { current: 20000, previous: 20000 },
		"791/2": { current: 0, previous: 0 },
		"691/2": { current: 0, previous: 0 },
		"794": { current: 0, previous: 0 },
		"694/7": { current: 0, previous: 0 },
	},
	notes: {
		// The statement of fixed assets foots to the face: 22/27 = 8199 + 8259
		// - 8329, and the closing cost is the opening cost plus the year's
		// acquisitions.
		"8199P": { current: 30000 },
		"8169": { current: 10000 },
		"8179": { current: 0 },
		"8199": { current: 40000 },
		"8259": { current: 0 },
		"8329": { current: 0 },
	},
	valuationRules:
		"Les immobilisations sont amorties linéairement sur leur durée d'utilité estimée.",
};

/** The filing with some balance sheet rubrics replaced, for failure cases. */
export function withBalanceSheet(overrides: RubricAmounts): NbbFilingInput {
	return {
		...MICRO_FILING,
		balanceSheet: { ...MICRO_FILING.balanceSheet, ...overrides },
	};
}

/**
 * A complete abbreviated filing for an association, `m04`. The passif spine
 * is the association's own: `10` is the association's funds rather than a
 * capital subtotal, `13` the allocated funds, and the income statement has
 * `73` — contributions, gifts, legacies and grants — which no company model
 * carries. Like {@link MICRO_FILING}, every subtotal foots.
 */
export const ASSOCIATION_FILING: NbbFilingInput = {
	taxonomy: m04f,
	language: "fr",
	entity: {
		enterpriseNumber: "0925590628",
		name: "LES AMIS DU CANAL",
		// ASBL.
		legalForm: "m017",
		address: {
			street: "QUAI DES PENICHES",
			houseNumber: "3",
			postalCode: "1000",
		},
		// Brussels, French-speaking.
		businessCourt: "m31",
		statutesDate: "2001-09-14",
	},
	identification: {
		exercise: { startDate: "2025-01-01", endDate: "2025-12-31" },
		previousExercise: { startDate: "2024-01-01", endDate: "2024-12-31" },
		generalMeetingDate: "2026-06-15",
		previousPeriodDataUnchanged: true,
		pageCount: 14,
	},
	producer: { name: "Financica" },
	balanceSheet: {
		// 21/28 = 21 + 22/27 + 28, and 22/27 = 22 + … + 27, all furniture.
		"20": { current: 0, previous: 0 },
		"21/28": { current: 40000, previous: 30000 },
		"21": { current: 0, previous: 0 },
		"22/27": { current: 40000, previous: 30000 },
		"22": { current: 0, previous: 0 },
		"23": { current: 0, previous: 0 },
		"24": { current: 40000, previous: 30000 },
		"25": { current: 0, previous: 0 },
		"26": { current: 0, previous: 0 },
		"27": { current: 0, previous: 0 },
		"28": { current: 0, previous: 0 },

		// 29/58 = 29 + 3 + 40/41 + 50/53 + 54/58 + 490/1
		"29": { current: 0, previous: 0 },
		"290": { current: 0, previous: 0 },
		"291": { current: 0, previous: 0 },
		"3": { current: 0, previous: 0 },
		"30/36": { current: 0, previous: 0 },
		"37": { current: 0, previous: 0 },
		"40/41": { current: 15000, previous: 12000 },
		"40": { current: 15000, previous: 12000 },
		"41": { current: 0, previous: 0 },
		"50/53": { current: 0, previous: 0 },
		"54/58": { current: 45000, previous: 38000 },
		"490/1": { current: 0, previous: 0 },
		"29/58": { current: 60000, previous: 50000 },
		"20/58": { current: 100000, previous: 80000 },

		// Equity: 10/15 = 10 + 12 + 13 + 14 + 15. No `10/11`, `110`, `111`
		// or `19` here: an association has funds, not capital.
		"10": { current: 20000, previous: 20000 },
		"12": { current: 0, previous: 0 },
		"13": { current: 5000, previous: 5000 },
		// Last year's 20000 carried forward plus this year's 12000 result.
		"14": { current: 32000, previous: 20000 },
		"15": { current: 0, previous: 0 },
		"10/15": { current: 57000, previous: 45000 },

		// 16 = 160/5 + 167 + 168, with 160/5 broken down to its five lines.
		"16": { current: 0, previous: 0 },
		"160/5": { current: 0, previous: 0 },
		"160": { current: 0, previous: 0 },
		"161": { current: 0, previous: 0 },
		"162": { current: 0, previous: 0 },
		"163": { current: 0, previous: 0 },
		"164/5": { current: 0, previous: 0 },
		"167": { current: 0, previous: 0 },
		"168": { current: 0, previous: 0 },

		// 17/49 = 17 + 42/48 + 492/3, and each of those to its own lines.
		"17/49": { current: 43000, previous: 35000 },
		"17": { current: 0, previous: 0 },
		"170/4": { current: 0, previous: 0 },
		"172/3": { current: 0, previous: 0 },
		"174/0": { current: 0, previous: 0 },
		"175": { current: 0, previous: 0 },
		"176": { current: 0, previous: 0 },
		"178/9": { current: 0, previous: 0 },
		"42/48": { current: 43000, previous: 35000 },
		"42": { current: 0, previous: 0 },
		"43": { current: 0, previous: 0 },
		"430/8": { current: 0, previous: 0 },
		"439": { current: 0, previous: 0 },
		"44": { current: 43000, previous: 35000 },
		"440/4": { current: 43000, previous: 35000 },
		"441": { current: 0, previous: 0 },
		"46": { current: 0, previous: 0 },
		"45": { current: 0, previous: 0 },
		"450/3": { current: 0, previous: 0 },
		"454/9": { current: 0, previous: 0 },
		"48": { current: 0, previous: 0 },
		"492/3": { current: 0, previous: 0 },
		"10/49": { current: 100000, previous: 80000 },
	},
	incomeStatement: {
		// Gross margin from turnover plus the class-73 income: 9900 = 70 + 73
		// - 60/61. Then nothing financial or exceptional, so the result falls
		// straight through to 9905.
		"70": { current: 60000, previous: 50000 },
		"73": { current: 40000, previous: 34000 },
		"60/61": { current: 80000, previous: 67000 },
		"9900": { current: 20000, previous: 17000 },
		"62": { current: 8000, previous: 8000 },
		"630": { current: 0, previous: 0 },
		"631/4": { current: 0, previous: 0 },
		"635/9": { current: 0, previous: 0 },
		"640/8": { current: 0, previous: 0 },
		"649": { current: 0, previous: 0 },
		"66A": { current: 0, previous: 0 },
		"9901": { current: 12000, previous: 9000 },
		"75/76B": { current: 0, previous: 0 },
		"75": { current: 0, previous: 0 },
		"76B": { current: 0, previous: 0 },
		"65/66B": { current: 0, previous: 0 },
		"65": { current: 0, previous: 0 },
		"66B": { current: 0, previous: 0 },
		"9903": { current: 12000, previous: 9000 },
		"780": { current: 0, previous: 0 },
		"680": { current: 0, previous: 0 },
		"67/77": { current: 0, previous: 0 },
		"9904": { current: 12000, previous: 9000 },
		"789": { current: 0, previous: 0 },
		"689": { current: 0, previous: 0 },
		"9905": { current: 12000, previous: 9000 },
	},
	appropriation: {
		// The association's section 5 has no dividends, no directors' fees and
		// no legal reserve: 9906 = 9905 + 14P, and 14 = 9906 + 791 - 691.
		"9906": { current: 32000, previous: 29000 },
		"14P": { current: 20000, previous: 20000 },
		"791": { current: 0, previous: 0 },
		"691": { current: 0, previous: 0 },
	},
	notes: {
		"8199P": { current: 30000 },
		"8169": { current: 10000 },
		"8179": { current: 0 },
		"8199": { current: 40000 },
		"8259": { current: 0 },
		"8329": { current: 0 },
	},
	valuationRules:
		"Les immobilisations sont amorties linéairement sur leur durée d'utilité estimée.",
};

const address = (
	street: string,
	houseNumber: string,
	postalCode: string,
	extra: Partial<Address> = {},
): Address => ({ street, houseNumber, postalCode, ...extra });

/**
 * The micro filing with every disclosure the model has filled in: directors,
 * auditors and representatives, the accountant declaration, the 6.3 lines,
 * 6.4, 6.6, participations and an unlimited-liability entity. Consistent with
 * the figures of {@link MICRO_FILING} and with the model's completeness rules,
 * so an external validator finds nothing to report on it.
 */
export const FULL_MICRO_FILING: NbbFilingInput = {
	...MICRO_FILING,
	entity: MICRO_FILING.entity,
	notes: {
		...MICRO_FILING.notes,
		"9149": { current: 5000 },
		"9220": { current: 1000 },
		"9072": { current: 0 },
		"9076": { current: 0 },
	},
	directors: [
		{
			holder: {
				kind: "natural",
				firstName: "Ana",
				lastName: "Silva",
				profession: "Ingénieure",
				address: address("Rue Haute", "16", "1000", { postbox: "3" }),
			},
			mandates: [
				{ function: "m30", start: "2021-03-01" },
				{ function: "m13", start: "2023-01-01", end: "2027-06-30" },
			],
		},
		{
			holder: {
				kind: "legal",
				name: "Holding BV",
				enterpriseNumber: "0403170701",
				address: address("Kerkstraat", "5", "2000"),
				representatives: [
					{
						firstName: "Jan",
						lastName: "Peeters",
						profession: "Bestuurder",
						address: address("Kerkstraat", "7", "2000"),
					},
				],
			},
			mandates: [{ function: "m13", start: "2022-05-01", end: "2028-05-01" }],
		},
		{
			role: "auditor",
			holder: {
				kind: "natural",
				firstName: "Marie",
				lastName: "Dubois",
				memberNumber: "A01234",
				profession: "Réviseur",
				address: address("Rue de Rivoli", "10", "75001", {
					city: "Paris",
					country: "FR",
				}),
			},
			mandates: [{ function: "m61", start: "2025-01-01", end: "2027-12-31" }],
		},
		{
			role: "auditor",
			holder: {
				kind: "legal",
				name: "Audit SRL",
				enterpriseNumber: "0228121630",
				memberNumber: "B0001",
				address: address("Rue X", "1", "5000"),
				representatives: [
					{
						firstName: "Luc",
						lastName: "Martin",
						memberNumber: "A0002",
						address: address("Rue Y", "2", "5000"),
					},
				],
			},
			mandates: [{ function: "m61" }],
		},
	],
	accountantDeclaration: {
		missionEntrusted: true,
		practitioners: [
			{
				holder: {
					kind: "natural",
					firstName: "Eva",
					lastName: "Claes",
					profession: "Accountant",
					memberNumber: "10.498.733",
					address: address("Markt", "1", "9000"),
				},
				missions: ["A", "B"],
			},
			{
				holder: {
					kind: "legal",
					name: "Fid SRL",
					enterpriseNumber: "0403170701",
					memberNumber: "80.304.372",
					address: address("Rue Haute", "16", "9000", { postbox: "12" }),
					representatives: [
						{
							firstName: "Paul",
							lastName: "Durand",
							profession: "Expert-comptable",
							memberNumber: "1.234.567",
							address: address("Rue Z", "3", "9000"),
						},
					],
				},
				missions: ["C", "D"],
			},
		],
	},
	disclosures: {
		offBalanceSheet: {
			litigationAndCommitments: [
				{ description: "Litige commercial", amount: 12000 },
				{ description: "Garantie locative non chiffrable" },
			],
			commitmentsToAffiliates: [
				{ description: "Caution envers filiale", amount: 3000 },
			],
			pensionPlans: "Assurance groupe",
			pensionCoverage: "Primes payées annuellement",
			pensionEstimateBasis: "Calcul actuariel",
			other: [{ description: "Leasing", amount: -300.5 }],
		},
		directorReceivableTerms: "Aucune créance",
		otherInformation: 'Ligne 1 & <deux>\n\nParagraphe "2"',
		participations: [
			{
				name: "Acme Inc.",
				legalFormOther: "Corporation",
				address: address("Main St", "1", "10001", {
					city: "New York",
					country: "US",
				}),
				rights: [
					{
						nature: "Common shares",
						heldDirectly: 600,
						percentageDirect: 0.6,
						percentageThroughSubsidiaries: 0.05,
					},
				],
				lastAccounts: {
					closingDate: "2024-12-31",
					currency: "USD",
					equity: -15000,
					netResult: -2500.25,
				},
			},
			{
				name: "Filiale SRL",
				enterpriseNumber: "0403170701",
				legalForm: "m610",
				address: address("Rue A", "1", "1000"),
				rights: [{ nature: "Parts", heldDirectly: 100, percentageDirect: 1 }],
				lastAccounts: {
					closingDate: "2024-12-31",
					currency: "EUR",
					equity: 50000,
					netResult: 4000,
				},
			},
		],
		unlimitedLiabilityEntities: [
			{
				name: "Partners SNC",
				enterpriseNumber: "0403170701",
				legalForm: "m612",
				address: address("Rue B", "2", "1000"),
				publicationCode: "A",
			},
		],
	},
};

const BELGIAN = address("Rue Neuve", "1", "1000");

const { statutesDate: _deed, ...ENTITY_WITHOUT_DEED } = MICRO_FILING.entity;

/**
 * {@link FULL_MICRO_FILING} broken once per row against the model's
 * completeness rules (`m87-f-other-formula.xml`): every row misses something
 * a different rule requires, so each rule fires from exactly one place. The
 * parity test checks that our findings name the same NBB rules Arelle reports.
 */
export const INCOMPLETE_MICRO_FILING: NbbFilingInput = {
	...FULL_MICRO_FILING,
	entity: ENTITY_WITHOUT_DEED,
	identification: {
		...MICRO_FILING.identification,
		exercise: { startDate: "2025-04-01", endDate: "2025-12-31" },
		previousExercise: { startDate: "2024-04-01", endDate: "2025-03-31" },
	},
	directors: [
		{
			holder: { kind: "natural", firstName: "Mandate", lastName: "Only" },
			mandates: [{ function: "m13" }],
		},
		{
			holder: {
				kind: "natural",
				firstName: "No",
				lastName: "Address",
				profession: "P",
			},
			mandates: [{ function: "m13" }],
		},
		{
			holder: { kind: "legal", name: "Name Only BV" },
			mandates: [{ function: "m13" }],
		},
		{
			holder: { kind: "legal", name: "Belgian Without Number", address: BELGIAN },
			mandates: [{ function: "m13" }],
		},
		{
			holder: {
				kind: "legal",
				name: "Firm Without Address",
				enterpriseNumber: "0403170701",
			},
			mandates: [{ function: "m13" }],
		},
		{
			role: "auditor",
			holder: { kind: "natural", firstName: "Auditor", lastName: "Bare" },
			mandates: [{ function: "m61" }],
		},
		{
			role: "auditor",
			holder: {
				kind: "natural",
				firstName: "Auditor",
				lastName: "Homeless",
				profession: "Réviseur",
				memberNumber: "A1",
			},
			mandates: [{ function: "m61" }],
		},
		{
			role: "auditor",
			holder: {
				kind: "natural",
				firstName: "Auditor",
				lastName: "Unlisted",
				address: BELGIAN,
			},
			mandates: [{ function: "m61" }],
		},
		{
			role: "auditor",
			holder: { kind: "legal", name: "Name Only Audit" },
			mandates: [{ function: "m61" }],
		},
		{
			role: "auditor",
			holder: { kind: "legal", name: "Audit Without Number", address: BELGIAN },
			mandates: [{ function: "m61" }],
		},
		{
			role: "auditor",
			holder: {
				kind: "legal",
				name: "Audit Without Address",
				enterpriseNumber: "0403170701",
				memberNumber: "B0002",
			},
			mandates: [{ function: "m61" }],
		},
	],
	accountantDeclaration: {
		missionEntrusted: true,
		practitioners: [
			{
				holder: { kind: "natural", firstName: "Expert", lastName: "Bare" },
				missions: ["C"],
			},
			{
				holder: {
					kind: "natural",
					firstName: "Expert",
					lastName: "Homeless",
					profession: "Accountant",
					memberNumber: "1",
				},
				missions: ["A"],
			},
			{
				holder: {
					kind: "natural",
					firstName: "Expert",
					lastName: "Unlisted",
					address: BELGIAN,
				},
				missions: ["B"],
			},
			{
				holder: { kind: "legal", name: "Name Only Fid" },
				missions: ["A"],
			},
			{
				holder: { kind: "legal", name: "Fid Without Number", address: BELGIAN },
				missions: ["D"],
			},
			{
				holder: {
					kind: "legal",
					name: "Fid Without Address",
					enterpriseNumber: "0403170701",
					memberNumber: "80.304.373",
				},
				missions: ["A"],
			},
		],
	},
	disclosures: {
		participations: [
			{
				name: "Nowhere Ltd",
				rights: [{ nature: "Shares", percentageDirect: 0.1 }],
			},
			{
				name: "Remote Co",
				legalFormOther: "Company",
				rights: [{ nature: "Shares", heldDirectly: 0, percentageDirect: 0.2 }],
			},
			{
				name: "Ourselves",
				enterpriseNumber: MICRO_FILING.entity.enterpriseNumber,
				legalForm: "m610",
				address: BELGIAN,
				rights: [{ nature: "Parts", percentageDirect: 0.5 }],
				lastAccounts: {
					closingDate: "2024-12-31",
					currency: "EUR",
					equity: 1,
					netResult: 1,
				},
			},
			{
				name: "Belgian Investee",
				legalForm: "m610",
				address: BELGIAN,
				rights: [{ nature: "Parts", percentageDirect: 0.5 }],
				lastAccounts: {
					closingDate: "2024-12-31",
					currency: "EUR",
					equity: 1,
					netResult: 1,
				},
			},
		],
		unlimitedLiabilityEntities: [
			{
				name: "Formless SNC",
				enterpriseNumber: "0403170701",
				publicationCode: "A",
			},
			{
				name: "Belgian SNC",
				legalForm: "m612",
				address: BELGIAN,
				publicationCode: "A",
			},
		],
	},
};
