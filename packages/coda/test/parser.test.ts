import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseCoda } from "../src/parser.js";
import type { CodaMovement, CodaStatement } from "../src/types.js";

function fixture(name: string): string {
	return readFileSync(join(import.meta.dirname, "fixtures", name), "utf-8");
}

const sumCredits = (movements: CodaMovement[]) =>
	movements
		.filter((m) => m.detailNumber === 0 && m.amount > 0)
		.reduce((acc, m) => acc + m.amount, 0);
const sumDebits = (movements: CodaMovement[]) =>
	movements
		.filter((m) => m.detailNumber === 0 && m.amount < 0)
		.reduce((acc, m) => acc - m.amount, 0);

/** Sum of top-level movements must equal the record-9 trailer totals. */
function expectMovementsReconcileWithTrailer(stmt: CodaStatement) {
	expect(sumCredits(stmt.movements)).toBeCloseTo(stmt.totalCredit, 2);
	expect(sumDebits(stmt.movements)).toBeCloseTo(stmt.totalDebit, 2);
}

/**
 * Build a 128-char CODA record. `fields` is a list of [1-indexed start, value];
 * everything else is space-padded. Positions cite the Febelfin CODA 2.6 layout.
 */
function record(fields: [number, string][]): string {
	const chars = Array.from({ length: 128 }, () => " ");
	for (const [start, value] of fields) {
		for (let i = 0; i < value.length; i++) chars[start - 1 + i] = value[i]!;
	}
	return chars.join("");
}

// Record 0 (header): pos 1 "0", 6-11 creation date DDMMYY, 12-14 bank id,
// 35-60 addressee, 128 version.
const header = (creationDate = "011017") =>
	record([
		[1, "0"],
		[6, creationDate],
		[12, "725"],
		[35, "TEST"],
		[128, "2"],
	]);

// Record 1 (old balance): pos 1 "1", 2 account structure, 3-5 paper seq,
// 6-42 account+currency field (37 chars), 43 sign, 44-58 amount, 59-64 date,
// 126-128 coda seq.
const oldBalance = (structure: string, accountField: string) =>
	record([
		[1, "1"],
		[2, structure],
		[3, "001"],
		[6, accountField],
		[43, "0"],
		[44, "000000000000000"],
		[59, "011017"],
		[126, "001"],
	]);

// Record 2.1 (movement): pos 1-2 "21", 3-6 seq, 7-10 detail, 32 sign,
// 33-47 amount, 48-53 value date, 54-61 transaction code, 62 comm type,
// 116-121 entry date.
const movement21 = (valueDate: string, entryDate = "011017") =>
	record([
		[1, "21"],
		[3, "0001"],
		[7, "0000"],
		[32, "0"],
		[33, "000000000001000"],
		[48, valueDate],
		[54, "00150000"],
		[62, "0"],
		[116, entryDate],
	]);

// Record 4 (free communication): pos 1 "4", 3-6 seq, 7-10 detail, 33-112 text.
const freeComm = (seq: string, detail: string, text: string) =>
	record([
		[1, "4"],
		[3, seq],
		[7, detail],
		[33, text],
	]);

// ── Validation & edge cases ───────────────────────────────────────────

describe("validation", () => {
	it.each([
		["empty string", ""],
		["whitespace-only input", "   \n\n  "],
		["non-CODA content", "this is not a coda file"],
		["input not starting with record 0", "1000000000000000"],
	])("returns null for %s", (_label, input) => {
		expect(parseCoda(input)).toBeNull();
	});

	it("returns null for a statement group with a header but no old-balance record", () => {
		expect(parseCoda(header())).toBeNull();
		expect(parseCoda([header(), movement21("011017")].join("\n"))).toBeNull();
	});

	it("parses CRLF line endings identically to LF", () => {
		for (const name of ["sample1.cod", "sample5.cod", "12298862.BC2"]) {
			const lf = fixture(name);
			expect(parseCoda(lf.replaceAll("\n", "\r\n"))).toEqual(parseCoda(lf));
		}
	});
});

// ── Synthetic records: date rules, account structures, free comms ─────

describe("date parsing (DDMMYY)", () => {
	it("pivots two-digit years at 80: >= 80 is 19xx, < 80 is 20xx", () => {
		const y1980 = parseCoda([header("150180"), oldBalance("0", "")].join("\n"))!;
		expect(y1980.statements[0]!.creationDate).toEqual(new Date(1980, 0, 15));
		const y2079 = parseCoda([header("150179"), oldBalance("0", "")].join("\n"))!;
		expect(y2079.statements[0]!.creationDate).toEqual(new Date(2079, 0, 15));
	});

	it("treats a 000000 value date as absent", () => {
		const file = parseCoda(
			[header(), oldBalance("0", ""), movement21("000000", "011017")].join("\n"),
		)!;
		const m = file.statements[0]!.movements[0]!;
		expect(m.valueDate).toBeUndefined();
		expect(m.entryDate).toEqual(new Date(2017, 9, 1));
	});
});

describe("account structures (record 1, pos 2)", () => {
	it("structure 1: foreign BBAN — 34AN number + 3AN currency", () => {
		const field = "1234567890123456789012345678901234USD";
		const file = parseCoda([header(), oldBalance("1", field)].join("\n"))!;
		expect(file.statements[0]!.account).toEqual({
			structure: "foreign-bban",
			number: "1234567890123456789012345678901234",
			currency: "USD",
		});
	});

	it("structure 3: foreign IBAN — 34AN IBAN + 3AN currency", () => {
		// FR IBAN (27 chars) left-aligned in the 34-char slot, currency at 35-37.
		const field = "FR7630006000011234567890189       EUR";
		const file = parseCoda([header(), oldBalance("3", field)].join("\n"))!;
		expect(file.statements[0]!.account).toEqual({
			structure: "foreign-iban",
			number: "FR7630006000011234567890189",
			currency: "EUR",
		});
	});
});

describe("free communications (record 4)", () => {
	it("joins continuation lines sharing a sequence number, keeps distinct sequences apart", () => {
		// Each line's text is trimmed and the parts are concatenated without a
		// separator (a word may be split across lines), which is the current rule.
		const file = parseCoda(
			[
				header(),
				oldBalance("0", ""),
				freeComm("0001", "0001", "FIRST HALF OF MESS"),
				freeComm("0001", "0002", "AGE ONE"),
				freeComm("0002", "0001", "MESSAGE TWO"),
			].join("\n"),
		)!;
		expect(file.statements[0]!.freeCommunications).toEqual([
			"FIRST HALF OF MESSAGE ONE",
			"MESSAGE TWO",
		]);
	});
});

// ── Sample 1: basic structured communications ─────────────────────────

describe("sample1 - structured communications", () => {
	const file = parseCoda(fixture("sample1.cod"));
	const stmt = file!.statements[0]!;

	it("parses header, account (Belgian BBAN, structure 0), balances and trailer", () => {
		expect(file!.statements).toHaveLength(1);
		expect(stmt).toMatchObject({
			creationDate: new Date(2017, 9, 11),
			bankId: 725,
			isDuplicate: false,
			addressee: "BOUWBEDRIJF VOOR GROTE WER",
			bic: "KREDBEBB",
			companyId: "00330158420",
			separateApplication: "00000",
			version: 2,
			account: {
				structure: "belgian-bban",
				number: "138536152215",
				currency: "EUR",
				countryCode: "BE",
			},
			paperStatementSequence: 139,
			codaStatementSequence: 138,
			accountHolderName: "BOUWBEDRIJF VOOR GROTE WER",
			accountDescription: "KBC-Bedrijfsrekening",
			oldBalance: { amount: 17752.12, date: new Date(2017, 9, 10) },
			newBalance: { amount: 17832.12, date: new Date(2017, 9, 11) },
			totalDebit: 0,
			totalCredit: 80,
			freeCommunications: [],
		});
	});

	it("movements reconcile with trailer totals and the balance change", () => {
		expectMovementsReconcileWithTrailer(stmt);
		expect(stmt.oldBalance.amount + stmt.totalCredit - stmt.totalDebit).toBeCloseTo(
			stmt.newBalance!.amount,
			2,
		);
	});

	it("parses 4 movements", () => {
		expect(stmt.movements).toHaveLength(4);
	});

	// Captured from sample1.cod records 2.1 / 2.2 / 2.3, one movement per line.
	it.each([
		[
			0,
			1,
			"JRFC00120DSCCOCACAERT",
			5,
			"000003505158",
			"KREDBEBB",
			"BE22313215646432",
			"KLANT1 MET NAAM1",
		],
		[
			1,
			2,
			"KLIM03284DSCICDEVATVA",
			25,
			"000003515846",
			"BBRUBEBB",
			"BE25646548413215",
			"KLANT2 NAAM2",
		],
		[
			2,
			3,
			"OL69IXSTASSCCOXSOVDGS",
			20,
			"000003154982",
			"KREDBEBB",
			"BE32135468465432",
			"KLANT3 NAAM3",
		],
		[
			3,
			4,
			"KACS00321DSCTIXEIKDVA",
			30,
			"000002133131",
			"GEBABEBB",
			"BE23156453132168",
			"KLANT4 - NAAM4 MET",
		],
	])(
		"movements[%i]: seq %i, ref %s, +%s, structured 101 comm %s, BIC %s, account %s, name %s",
		(idx, seq, ref, amount, comm, bic, account, name) => {
			expect(stmt.movements[idx]).toMatchObject({
				sequenceNumber: seq,
				detailNumber: 0,
				bankReference: ref,
				amount,
				valueDate: new Date(2017, 9, 11),
				entryDate: new Date(2017, 9, 11),
				// Transaction code 0 01 50 000: credit transfer (family 01, transaction 50)
				transactionCode: { type: 0, family: 1, transaction: 50, category: 0 },
				communicationType: "structured",
				structuredCommunicationType: 101,
				communication: comm,
				counterpartyBic: bic,
				counterpartyAccountNumber: account,
				counterpartyName: name,
			});
		},
	);

	it("joins 3.1 + 3.2 into one structured-001 information record", () => {
		const info = stmt.movements[0]!.information;
		expect(info).toHaveLength(1);
		expect(info[0]).toMatchObject({
			detailNumber: 1,
			communicationType: "structured",
			structuredCommunicationType: 1,
			// 3.1 content (pos 44-113, padded) followed by 3.2 content (pos 11-115), trailing spaces trimmed.
			communication:
				"KLANT1 MET NAAM1                                                      GROTE WEG            32            3215    HASSELT",
		});
	});
});

// ── Sample 2: complex information records ─────────────────────────────

describe("sample2 - information records", () => {
	const file = parseCoda(fixture("sample2.cod"));
	const stmt = file!.statements[0]!;

	it("parses Belgian IBAN account (structure 2), old balance and trailer", () => {
		expect(stmt).toMatchObject({
			account: {
				structure: "belgian-iban",
				number: "BE62354872126588",
				currency: "EUR",
			},
			oldBalance: { amount: 25846, date: new Date(2022, 0, 23) },
			totalDebit: 9.68,
			totalCredit: 0,
		});
	});

	it("parses one debit movement (detail 0) with two sub-details, globalisation code 1", () => {
		expect(stmt.movements.map((m) => m.detailNumber)).toEqual([0, 1, 2]);
		expect(stmt.movements[0]).toMatchObject({
			amount: -9.68,
			globalisationCode: 1,
		});
		expectMovementsReconcileWithTrailer(stmt);
	});

	it("attaches the nine 3.1 records (details 3-11) to the last movement of the sequence", () => {
		expect(stmt.movements[0]!.information).toHaveLength(0);
		expect(stmt.movements[1]!.information).toHaveLength(0);
		const info = stmt.movements[2]!.information;
		// sample2.cod has nine "3100010003" … "3100010011" lines.
		expect(info).toHaveLength(9);
		expect(info.map((i) => i.detailNumber)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
		for (const i of info) expect(i.sequenceNumber).toBe(1);
		// First 3.1 line, pos 41-113, trailing spaces trimmed.
		expect(info[0]!.communication).toBe(
			"INVOICE n  2011/02/000254882 du 30/06/2011 ING Belgique SA - Avenue Marni",
		);
	});
});

// ── Sample 3: multi-part transaction messages ─────────────────────────

describe("sample3 - multi-part messages", () => {
	const file = parseCoda(fixture("sample3.cod"));
	const stmt = file!.statements[0]!;

	it("parses account holder", () => {
		expect(stmt.accountHolderName).toBe("TIX02 SPRL");
	});

	it("parses one debit with two sub-details, each carrying its own unstructured message", () => {
		expect(stmt.movements.map((m) => m.detailNumber)).toEqual([0, 1, 2]);
		expect(stmt.movements.map((m) => m.amount)).toEqual([-812.69, -805.73, -6.96]);
		expect(stmt.movements[0]!.communicationType).toBe("unstructured");
		expect(stmt.movements[0]!.communication).toContain("Message goes here");
		expect(stmt.movements[1]!.communication).toContain("and continues here");
		expect(stmt.movements[2]!.communication).toContain("or here");
	});
});

// ── Sample 4: SEPA transfer with multi-line info ──────────────────────

describe("sample4 - SEPA transfer (misaligned fixture)", () => {
	const file = parseCoda(fixture("sample4.cod"));
	const stmt = file!.statements[0]!;
	const m = stmt.movements[0]!;

	it("parses credit movement amount, date and unstructured 2.1 communication", () => {
		expect(m).toMatchObject({
			amount: 17233.54,
			valueDate: new Date(2017, 4, 31),
			communicationType: "unstructured",
			// Globalisation code 0 → undefined
			globalisationCode: undefined,
		});
		expect(m.communication).toContain("Europese overschrijving");
	});

	it("reads record 2.3 by fixed position even when the source line is shifted", () => {
		// sample4's 2.3 line is one column short of the layout, so the account
		// field (pos 11-47) swallows the start of the name and the name field
		// (pos 48-82) starts mid-word. The parser does not try to heal this;
		// pinned so any heuristic realignment shows up as a deliberate change.
		expect(m.counterpartyAccountNumber).toBe(
			"BE34359648312345 EURCOMPANY BLABLABLA",
		);
		expect(m.counterpartyAccountCurrency).toBeUndefined();
		expect(m.counterpartyName).toBe("H BVBA 363120669252");
	});

	it("parses three information records; 3.1 + 3.2 join into the first", () => {
		expect(m.information.map((i) => i.detailNumber)).toEqual([1, 2, 3]);
		// 3.1 (detail 1) content followed by its 3.2 continuation, trailing spaces trimmed.
		expect(m.information[0]!.communication).toBe(
			"01COMPANY BLABLABLAH BVBA                                                STRAATSTREEEEEET 123 1111 PLACE",
		);
		expect(m.information[2]!.communication).toBe(
			"1111 PLACE Belgie IBAN: BE34359648312349",
		);
	});
});

// ── Sample 5: different sequence numbers ──────────────────────────────

describe("sample5 - sequence numbers", () => {
	const file = parseCoda(fixture("sample5.cod"));
	const stmt = file!.statements[0]!;

	it("parses header, debit new balance and 3 movements with non-contiguous sequence numbers", () => {
		expect(stmt.addressee).toBe("CODELICIOUS");
		expect(stmt.newBalance).toMatchObject({ amount: -500012.1 });
		expect(stmt.movements.map((m) => m.sequenceNumber)).toEqual([1, 2, 9]);
		expect(stmt.movements.map((m) => m.amount)).toEqual([
			1767.82, 2767.82, 1767.82,
		]);
	});

	it("parses counterparty only for movements that carry record 2.3", () => {
		expect(stmt.movements[0]).toMatchObject({
			counterpartyName: "BVBA.BAKKER PIET",
			counterpartyAccountNumber: "BE54805480215856",
			counterpartyAccountCurrency: "EUR",
		});
		expect(stmt.movements[1]!.counterpartyName).toBe("BVBA.BAKKER PIET");
		expect(stmt.movements[2]!.counterpartyName).toBeUndefined();
	});

	it("joins 3.1 + 3.2 + 3.3 into one structured-001 information record", () => {
		const info = stmt.movements[0]!.information;
		expect(info).toHaveLength(1);
		expect(info[0]).toMatchObject({
			structuredCommunicationType: 1,
			// 3.1 (pos 44-113) + 3.2 (pos 11-115) + 3.3 (pos 11-100), trailing spaces trimmed.
			communication:
				"BVBA.BAKKER PIET                                                      MAIN STREET 928                    5480 SOME CITY                                                        SOME INFORMATION ABOUT THIS TRANSACTION",
		});
	});
});

// ── Sample 6: free communications and debit movements ─────────────────

describe("sample6 - free communications & debit", () => {
	const file = parseCoda(fixture("sample6.cod"));
	const stmt = file!.statements[0]!;

	it("parses 3 movements (one debit, two credits) with their sequence numbers", () => {
		expect(stmt.movements.map((m) => [m.sequenceNumber, m.amount])).toEqual([
			[1, -767.823],
			[2, 2767.82],
			[9, 1767.82],
		]);
	});

	it("parses free communication from record 4", () => {
		expect(stmt.freeCommunications).toEqual(["THIS IS A PUBLIC MESSAGE"]);
	});
});

// ── 12298862.BC2: real-world comprehensive statement ──────────────────

describe("12298862.BC2 - real-world statement", () => {
	const file = parseCoda(fixture("12298862.BC2"));
	const stmt = file!.statements[0]!;
	const byName = (name: string) =>
		stmt.movements.find((m) => m.counterpartyName === name)!;

	it("parses header, account, balances and trailer", () => {
		expect(file!.statements).toHaveLength(1);
		expect(stmt).toMatchObject({
			creationDate: new Date(2023, 0, 26),
			addressee: "KRS LOGISTICS SPRL",
			bic: "BBRUBEBB",
			companyId: "00432308412",
			version: 2,
			account: {
				structure: "belgian-iban",
				number: "BE75363112201051",
				currency: "EUR",
			},
			oldBalance: { amount: 16300.11, date: new Date(2023, 0, 25) },
			newBalance: { amount: 17498.84, date: new Date(2023, 0, 26) },
			totalDebit: 68472.03,
			totalCredit: 69670.76,
		});
		expect(stmt.movements).toHaveLength(26);
	});

	it("movements reconcile with trailer totals and the balance change", () => {
		expectMovementsReconcileWithTrailer(stmt);
		expect(stmt.oldBalance.amount + stmt.totalCredit - stmt.totalDebit).toBeCloseTo(
			stmt.newBalance!.amount,
			2,
		);
	});

	it("parses first movement (debit transfer 0/01/01 - PROXIMUS)", () => {
		expect(stmt.movements[0]).toMatchObject({
			amount: -815.31,
			transactionCode: { family: 1, transaction: 1 },
			counterpartyName: "PROXIMUS",
			counterpartyAccountNumber: "BE82210000088968",
			counterpartyAccountCurrency: "EUR",
			counterpartyBic: "GEBABEBB",
		});
	});

	it.each([
		["KYOTEC LUXEMBOURG S.A R.L.", 375, "LU690030217994690000", "BGLLLULL"],
		["JACQUET DEUTSCHLAND GMBH", 325, "DE59370106001094001157", "BNPADEFF"],
		["BROEKMAN LOGISTICS BV", 5151.11, "NL41ABNA0830352414", "ABNANL2A"],
		["TRAXYS EUROPE S A", 26120, "GB71DEUT40508123386700", "DEUTGB2L"],
	])("parses foreign-IBAN counterparty %s", (name, amount, iban, bic) => {
		expect(byName(name)).toMatchObject({
			amount,
			counterpartyAccountNumber: iban,
			counterpartyBic: bic,
		});
	});

	it("parses purpose code from record 2.2", () => {
		expect(byName("JACQUET DEUTSCHLAND GMBH").purpose).toBe("SUPP");
	});

	it("parses both intracompany transfers as debits", () => {
		const transfers = stmt.movements.filter(
			(m) => m.counterpartyName === "KRS logistics",
		);
		expect(transfers.map((t) => t.amount)).toEqual([-23000, -30000]);
	});

	it("parses SEPA credit transfer (0/01/50) and instant transfer (0/02/50) codes", () => {
		expect(byName("SA ICARUS")).toMatchObject({
			amount: 302.5,
			counterpartyAccountNumber: "BE79240081900033",
			counterpartyAccountCurrency: "EUR",
			transactionCode: { type: 0, family: 1, transaction: 50, category: 0 },
		});
		expect(byName("ASIA EUROPE TRADE CO SA")).toMatchObject({
			amount: 526.35,
			transactionCode: { family: 2, transaction: 50 },
		});
	});

	it("parses the five information records of the SA ICARUS movement", () => {
		const info = byName("SA ICARUS").information;
		expect(info.map((i) => [i.sequenceNumber, i.detailNumber])).toEqual([
			[3, 1],
			[3, 2],
			[3, 3],
			[3, 4],
			[3, 5],
		]);
		expect(info[0]).toMatchObject({
			communicationType: "structured",
			structuredCommunicationType: 1,
			// 3.1 (pos 44-113) + 3.2 (pos 11-115), trailing spaces trimmed.
			communication:
				"SA ICARUS                                                             Rue des Alouettes 100              4041 HERSTAL",
		});
		expect(info[1]).toMatchObject({
			communicationType: "unstructured",
			communication:
				"Virement en euros (SEPA) De: SA ICARUS Rue des Alouettes 100 4041 HERSTAL",
		});
	});
});

// ── Multi-statement files ─────────────────────────────────────────────

describe("multi-statement handling", () => {
	it("parses multiple statements from concatenated files", () => {
		const content = fixture("sample1.cod") + "\n" + fixture("sample6.cod");
		const file = parseCoda(content);
		expect(file).not.toBeNull();
		expect(file!.statements).toHaveLength(2);
		expect(file!.statements[0]!.addressee).toBe("BOUWBEDRIJF VOOR GROTE WER");
		expect(file!.statements[1]!.addressee).toBe("CODELICIOUS");
	});
});
