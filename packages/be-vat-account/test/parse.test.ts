import { describe, expect, it } from "vitest";
import { VatAccountParseError } from "../src/errors.js";
import { groupIntoRows } from "../src/layout.js";
import { parseVatAccountStatementRows } from "../src/parse.js";
import type { TextItem, TextRow } from "../src/types.js";

/** One printed line: a baseline plus the `[x, text]` runs sitting on it. */
type Line = [y: number, cells: Array<[x: number, text: string]>];

/**
 * Parse printed lines, page by page, exactly as the PDF reader hands them over:
 * items in document order, rows grouped per page and concatenated.
 */
const parsePages = (...pages: Line[][]) => {
	const items: TextItem[] = [];
	const rows: TextRow[] = [];
	for (const page of pages) {
		const pageItems = page.flatMap(([y, cells]) =>
			cells.map(([x, str]) => ({ str, x, y })),
		);
		items.push(...pageItems);
		rows.push(...groupIntoRows(pageItems));
	}
	return parseVatAccountStatementRows(items, rows);
};

const PFORM_PAGE: Line[] = [
	[800, [[50, "Extrait de compte TVA"]]],
	[790, [[50, "BE0766280697/PFORM671/20250207/123456"]]],
	[780, [[50, "Bruxelles, le 7 février 2025"]]],
	[770, [[50, "3f0a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8"]]],
	[760, [[50, "votre situation au 31.01.2025"]]],
	[750, [[50, "à la date du : 31.10.2024"]]],
	[
		740,
		[
			[330, "Solde à payer"],
			[500, "2.561,66"],
		],
	],
	[730, [[50, "+++123/4567/89012+++"]]],
	[700, [[50, "Aperçu détaillé"]]],
	[
		690,
		[
			[50, "Date d'inscription"],
			[130, "Objet de l'inscription"],
			[220, "Date de prise"],
			[330, "Montant en votre faveur"],
			[440, "Montant dû"],
		],
	],
	[682, [[220, "d'effet"]]],
	[
		670,
		[
			[50, "Solde précédent au 31.10.2024"],
			[330, "100,00"],
		],
	],
	[660, [[50, "Opérations et soldes depuis le 31.10.2024"]]],
	[
		650,
		[
			[50, "20.11.2024"],
			[130, "A-10.2024"],
			[220, "20.11.2024"],
			[440, "1.500,00"],
		],
	],
	[
		640,
		[
			[50, "05.12.2024"],
			[130, "P"],
			[220, "05.12.2024"],
			[330, "38,34"],
		],
	],
	[
		630,
		[
			[50, "Situation fin novembre 2024"],
			[440, "1.400,00"],
		],
	],
	[
		620,
		[
			[50, "Situation fin décembre 2024"],
			[440, "1.361,66"],
		],
	],
	[600, [[50, "Voir notice importante au verso"]]],
];

describe("PFORM671 layout", () => {
	const parsed = parsePages(PFORM_PAGE);

	it("reads the header", () => {
		expect(parsed.header).toEqual({
			vatNumber: "0766280697",
			formReference: "BE0766280697/PFORM671/20250207/123456",
			documentUuid: "3f0a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
			statementDate: "2025-02-07",
			situationDate: "2025-01-31",
			periodStartDate: "2024-10-31",
			language: "fr",
			layout: "pform671",
			balanceType: "to_pay",
			balanceAmount: 2561.66,
			structuredCommunication: "+++123/4567/89012+++",
		});
	});

	it("reads each table row as its own kind, in printed order", () => {
		expect(parsed.entries.map((e) => [e.entryType, e.lineOrder])).toEqual([
			["previous_balance", 0],
			["transaction", 1],
			["transaction", 2],
			["situation", 3],
			["situation", 4],
		]);
	});

	it("splits the two money columns by direction", () => {
		const [, charge, payment] = parsed.entries;
		expect(charge).toMatchObject({
			registrationDate: "2024-11-20",
			operationCode: "A-10.2024",
			effectiveDate: "2024-11-20",
			amountInFavor: null,
			amountOwed: 1500,
		});
		expect(payment).toMatchObject({
			operationCode: "P",
			amountInFavor: 38.34,
			amountOwed: null,
		});
	});

	it("reads a situation row's month from its name", () => {
		expect(parsed.entries.at(-2)).toMatchObject({
			situationMonth: 11,
			situationYear: 2024,
			amountOwed: 1400,
		});
		expect(parsed.entries.at(-1)).toMatchObject({
			situationMonth: 12,
			situationYear: 2024,
		});
	});

	it("excludes the column labels and the section headings", () => {
		expect(parsed.entries).toHaveLength(5);
	});
});

describe("legacy layout", () => {
	const parsed = parsePages([
		[800, [[50, "Uittreksel btw-rekening"]]],
		[
			790,
			[
				[50, "Btw-nummer"],
				[150, ":"],
				[170, "0766.280.697"],
			],
		],
		[780, [[50, "Brussel, 20/05/2021"]]],
		[770, [[50, "situatie op 30/04/2021"]]],
		[760, [[50, "op datum van : 31/01/2021"]]],
		[
			750,
			[
				[330, "Terug te betalen"],
				[500, "927,41"],
			],
		],
		[700, [[50, "Gedetailleerd overzicht"]]],
		[
			690,
			[
				[50, "15/02/2021"],
				[130, "B"],
				[220, "15/02/2021"],
				[330, "927,41"],
			],
		],
		[
			680,
			[
				[50, "Situatie einde 02/2021"],
				[330, "927,41"],
			],
		],
		[660, [[50, "Zie belangrijke opmerking"]]],
	]);

	it("reads the dotted VAT number and the Dutch title", () => {
		expect(parsed.header).toMatchObject({
			vatNumber: "0766280697",
			language: "nl",
			layout: "legacy",
			statementDate: "2021-05-20",
			situationDate: "2021-04-30",
			periodStartDate: "2021-01-31",
			balanceType: "to_reimburse",
			balanceAmount: 927.41,
		});
	});

	it("synthesizes a reference, since the layout prints none", () => {
		expect(parsed.header.formReference).toBe(
			"BE0766280697/VAT-STATEMENT/2021-04-30",
		);
	});

	it("reads a numeric situation month", () => {
		expect(parsed.entries).toMatchObject([
			{ entryType: "transaction", registrationDate: "2021-02-15" },
			{ entryType: "situation", situationMonth: 2, situationYear: 2021 },
		]);
	});
});

describe("edge cases", () => {
	it("takes the header's balance label, not the notice text on a later page", () => {
		// The explanatory notice quotes all three labels; reading the last match
		// would report whichever the boilerplate happens to end on.
		const parsed = parsePages(PFORM_PAGE, [
			[
				800,
				[
					[50, "Cette notice explique aussi le"],
					[240, "Solde à payer"],
					[400, "et le"],
					[450, "À reporter"],
				],
			],
		]);

		expect(parsed.header.balanceType).toBe("to_pay");
		expect(parsed.header.balanceAmount).toBe(2561.66);
	});

	it("falls back to zero when no balance label is printed", () => {
		const parsed = parsePages(
			PFORM_PAGE.filter(([, cells]) =>
				cells.every(([, text]) => text !== "Solde à payer"),
			),
		);

		expect(parsed.header).toMatchObject({ balanceType: "zero", balanceAmount: 0 });
	});

	it("reports a document that is not a statement", () => {
		expect(() => parsePages([[800, [[50, "Facture"]]]])).toThrow(
			expect.objectContaining({
				name: "VatAccountParseError",
				code: "not_a_vat_statement",
			}),
		);
	});

	it("reports which header field a truncated statement is missing", () => {
		const call = () =>
			parsePages([
				[800, [[50, "Extrait de compte TVA"]]],
				[790, [[50, "BE0766280697/PFORM671/20250207/123456"]]],
				[780, [[50, "Bruxelles, le 7 février 2025"]]],
			]);

		expect(call).toThrow(VatAccountParseError);
		expect(call).toThrow(/situation date/);
	});
});
