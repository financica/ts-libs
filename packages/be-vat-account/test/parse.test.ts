import { describe, expect, it } from "vitest";
import { groupIntoRows } from "../src/layout.js";
import { isVatAccountStatement, parseVatAccountStatementRows } from "../src/parse.js";
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
		expect(parsed.header).toMatchObject({
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

	it("reads every table row as its own kind, in printed order, and nothing else", () => {
		// Column labels, the wrapped "d'effet" fragment and the section headings
		// sit inside the table but are not rows: exactly the five data rows come
		// out, numbered in the order they are printed.
		expect(parsed.entries).toMatchObject([
			{
				entryType: "previous_balance",
				lineOrder: 0,
				effectiveDate: "2024-10-31",
				amountInFavor: 100,
				amountOwed: null,
			},
			{
				entryType: "transaction",
				lineOrder: 1,
				registrationDate: "2024-11-20",
				operationCode: "A-10.2024",
				effectiveDate: "2024-11-20",
				amountInFavor: null,
				amountOwed: 1500,
			},
			{
				entryType: "transaction",
				lineOrder: 2,
				operationCode: "P",
				amountInFavor: 38.34,
				amountOwed: null,
			},
			{
				entryType: "situation",
				lineOrder: 3,
				situationMonth: 11,
				situationYear: 2024,
				amountOwed: 1400,
			},
			{
				entryType: "situation",
				lineOrder: 4,
				situationMonth: 12,
				situationYear: 2024,
			},
		]);
	});

	it("keeps reading the table when it continues on the next page", () => {
		// The heading and column labels close page 1; the movements and the
		// closing notice are on page 2. Rows are grouped per page, so the
		// "inside the table" state and the line numbering must carry across.
		const pageBreak = PFORM_PAGE.findIndex(([, cells]) =>
			cells.some(([, text]) => text === "d'effet"),
		);
		const split = parsePages(
			PFORM_PAGE.slice(0, pageBreak + 1),
			PFORM_PAGE.slice(pageBreak + 1),
		);

		expect(split.entries).toEqual(parsed.entries);
		expect(split.header).toEqual(parsed.header);
	});
});

describe("PFORM671 layout, Dutch edition", () => {
	const parsed = parsePages([
		[800, [[50, "Uittreksel btw-rekening"]]],
		[790, [[50, "BE0766280697/PFORM671/20250207/123456"]]],
		[780, [[50, "Brussel, op 7 februari 2025"]]],
		[770, [[50, "uw situatie op 31.01.2025"]]],
		[760, [[50, "op datum van : 31.10.2024"]]],
		[
			750,
			[
				[330, "Te betalen saldo"],
				[500, "2.561,66"],
			],
		],
		[700, [[50, "Gedetailleerd overzicht"]]],
		[
			690,
			[
				[50, "Datum van inschrijving"],
				[130, "Voorwerp"],
				[220, "Datum van uitwerking"],
				[330, "Bedrag in uw voordeel"],
				[440, "Bedrag verschuldigd"],
			],
		],
		[
			680,
			[
				[50, "Vorig saldo op 31.10.2024"],
				[330, "100,00"],
			],
		],
		[670, [[50, "Verrichtingen en saldi sinds 31.10.2024"]]],
		[
			660,
			[
				[50, "20.11.2024"],
				[130, "A-10.2024"],
				[220, "20.11.2024"],
				[440, "1.500,00"],
			],
		],
		[
			650,
			[
				[50, "Situatie einde november 2024"],
				[440, "1.400,00"],
			],
		],
		[600, [[50, "Zie belangrijke opmerking"]]],
	]);

	it("reads the Dutch statement date and balance label", () => {
		expect(parsed.header).toMatchObject({
			language: "nl",
			layout: "pform671",
			statementDate: "2025-02-07",
			situationDate: "2025-01-31",
			periodStartDate: "2024-10-31",
			balanceType: "to_pay",
			balanceAmount: 2561.66,
		});
	});

	it("reads the Dutch headings and month names", () => {
		expect(parsed.entries).toMatchObject([
			{ entryType: "previous_balance", effectiveDate: "2024-10-31" },
			{ entryType: "transaction", operationCode: "A-10.2024" },
			{ entryType: "situation", situationMonth: 11, situationYear: 2024 },
		]);
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

describe("legacy layout, French edition", () => {
	const parsed = parsePages([
		[800, [[50, "Extrait de compte TVA"]]],
		[
			790,
			[
				[50, "Numéro de TVA"],
				[150, ":"],
				[170, "0766.280.697"],
			],
		],
		[780, [[50, "Bruxelles, 20/05/2021"]]],
		[770, [[50, "situation au 30/04/2021"]]],
		[760, [[50, "à la date du : 31/01/2021"]]],
		[
			750,
			[
				[330, "À reporter"],
				[500, "12,50"],
			],
		],
		[700, [[50, "Aperçu détaillé"]]],
		[
			690,
			[
				[50, "15/02/2021"],
				[130, "B"],
				[220, "15/02/2021"],
				[330, "12,50"],
			],
		],
		[
			680,
			[
				[50, "Situation fin 02/2021"],
				[330, "12,50"],
			],
		],
		[660, [[50, "Voir notice importante au verso"]]],
	]);

	it("reads the slashed dates, the dotted VAT number and the carry-forward label", () => {
		expect(parsed.header).toMatchObject({
			vatNumber: "0766280697",
			formReference: "BE0766280697/VAT-STATEMENT/2021-04-30",
			language: "fr",
			layout: "legacy",
			statementDate: "2021-05-20",
			situationDate: "2021-04-30",
			periodStartDate: "2021-01-31",
			balanceType: "to_carry_forward",
			balanceAmount: 12.5,
		});
		expect(parsed.entries).toMatchObject([
			{
				entryType: "transaction",
				registrationDate: "2021-02-15",
				amountInFavor: 12.5,
			},
			{ entryType: "situation", situationMonth: 2, situationYear: 2021 },
		]);
	});
});

describe("edge cases", () => {
	/** The header lines printed above the balance line. */
	const HEADER_ABOVE_BALANCE = PFORM_PAGE.slice(
		0,
		PFORM_PAGE.findIndex(([, cells]) =>
			cells.some(([, text]) => text === "Solde à payer"),
		),
	);

	/** A page whose balance label wrapped, its figure landing `gap` rows below. */
	const wrappedBalancePage = (gap: number): Line[] => {
		const lines: Line[] = [
			...HEADER_ABOVE_BALANCE,
			[740, [[330, "Solde à payer"]]],
		];
		for (let filler = 1; filler <= gap - 1; filler++) {
			lines.push([740 - 10 * filler, [[330, "(suite)"]]]);
		}
		lines.push([740 - 10 * gap, [[500, "2.561,66"]]]);
		return lines;
	};

	it.each([1, 2, 3])(
		"finds the figure of a wrapped balance label %i rows below",
		(gap) => {
			expect(parsePages(wrappedBalancePage(gap)).header).toMatchObject({
				balanceType: "to_pay",
				balanceAmount: 2561.66,
			});
		},
	);

	it("does not read an amount four or more rows below the label as the balance", () => {
		// Past three rows the figure belongs to something else — the table's
		// first row, typically — and the balance is reported as unprinted.
		expect(parsePages(wrappedBalancePage(4)).header).toMatchObject({
			balanceType: "to_pay",
			balanceAmount: 0,
		});
	});

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

	it.each([
		[
			"a PFORM671 statement cut before its situation date",
			[
				[800, [[50, "Extrait de compte TVA"]]],
				[790, [[50, "BE0766280697/PFORM671/20250207/123456"]]],
				[780, [[50, "Bruxelles, le 7 février 2025"]]],
			] satisfies Line[],
		],
		[
			"a PFORM671 marker without a form reference",
			[
				[800, [[50, "Extrait de compte TVA"]]],
				[790, [[50, "PFORM671"]]],
				[780, [[50, "Bruxelles, le 7 février 2025"]]],
				[770, [[50, "votre situation au 31.01.2025"]]],
				[760, [[50, "à la date du : 31.10.2024"]]],
			] satisfies Line[],
		],
		[
			"a legacy statement without a VAT number",
			[
				[800, [[50, "Uittreksel btw-rekening"]]],
				[780, [[50, "Brussel, 20/05/2021"]]],
				[770, [[50, "situatie op 30/04/2021"]]],
				[760, [[50, "op datum van : 31/01/2021"]]],
			] satisfies Line[],
		],
	])("reports a missing header field for %s", (_name, page) => {
		expect(() => parsePages(page)).toThrow(
			expect.objectContaining({
				name: "VatAccountParseError",
				code: "missing_field",
			}),
		);
	});

	it("says no to garbage bytes instead of throwing", async () => {
		await expect(
			isVatAccountStatement(
				new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff]),
			),
		).resolves.toBe(false);
	});
});
