import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseCoda } from "../src/parser.js";

function fixture(name: string): string {
	return readFileSync(join(import.meta.dirname, "fixtures", name), "utf-8");
}

// ── Validation & edge cases ───────────────────────────────────────────

describe("validation", () => {
	it("returns null for empty string", () => {
		expect(parseCoda("")).toBeNull();
	});

	it("returns null for whitespace-only input", () => {
		expect(parseCoda("   \n\n  ")).toBeNull();
	});

	it("returns null for non-CODA content", () => {
		expect(parseCoda("this is not a coda file")).toBeNull();
	});

	it("returns null for input not starting with record 0", () => {
		expect(parseCoda("1000000000000000")).toBeNull();
	});
});

// ── Sample 1: basic structured communications ─────────────────────────

describe("sample1 - structured communications", () => {
	const file = parseCoda(fixture("sample1.cod"));

	it("parses successfully with one statement", () => {
		expect(file).not.toBeNull();
		expect(file!.statements).toHaveLength(1);
	});

	const stmt = file!.statements[0]!;

	it("parses header fields", () => {
		expect(stmt.creationDate).toEqual(new Date(2017, 9, 11));
		expect(stmt.bankId).toBe(725);
		expect(stmt.isDuplicate).toBe(false);
		expect(stmt.addressee).toBe("BOUWBEDRIJF VOOR GROTE WER");
		expect(stmt.bic).toBe("KREDBEBB");
		expect(stmt.companyId).toBe("00330158420");
		expect(stmt.separateApplication).toBe("00000");
		expect(stmt.version).toBe(2);
	});

	it("parses account as Belgian BBAN", () => {
		expect(stmt.account.structure).toBe("belgian-bban");
		expect(stmt.account.number).toBe("138536152215");
		expect(stmt.account.currency).toBe("EUR");
		expect(stmt.account.countryCode).toBe("BE");
	});

	it("parses paper and CODA statement sequences", () => {
		expect(stmt.paperStatementSequence).toBe(139);
		expect(stmt.codaStatementSequence).toBe(138);
	});

	it("parses account holder name", () => {
		expect(stmt.accountHolderName).toBe("BOUWBEDRIJF VOOR GROTE WER");
	});

	it("parses account description", () => {
		expect(stmt.accountDescription).toBe("KBC-Bedrijfsrekening");
	});

	it("parses old balance as credit", () => {
		expect(stmt.oldBalance.amount).toBe(17752.12);
		expect(stmt.oldBalance.date).toEqual(new Date(2017, 9, 10));
	});

	it("parses new balance", () => {
		expect(stmt.newBalance).toBeDefined();
		expect(stmt.newBalance!.amount).toBe(17832.12);
		expect(stmt.newBalance!.date).toEqual(new Date(2017, 9, 11));
	});

	it("parses 4 movements", () => {
		expect(stmt.movements).toHaveLength(4);
	});

	it("parses first movement as structured type 101", () => {
		const m = stmt.movements[0]!;
		expect(m.sequenceNumber).toBe(1);
		expect(m.detailNumber).toBe(0);
		expect(m.bankReference).toBe("JRFC00120DSCCOCACAERT");
		expect(m.amount).toBe(5);
		expect(m.valueDate).toEqual(new Date(2017, 9, 11));
		expect(m.entryDate).toEqual(new Date(2017, 9, 11));
		expect(m.communicationType).toBe("structured");
		expect(m.structuredCommunicationType).toBe(101);
		expect(m.communication).toBe("000003505158");
	});

	it("parses transaction codes", () => {
		const tc = stmt.movements[0]!.transactionCode;
		expect(tc.type).toBe(0);
		expect(tc.family).toBe(1);
		expect(tc.transaction).toBe(50);
		expect(tc.category).toBe(0);
	});

	it("parses counterparty BIC from record 2.2", () => {
		expect(stmt.movements[0]!.counterpartyBic).toBe("KREDBEBB");
		expect(stmt.movements[1]!.counterpartyBic).toBe("BBRUBEBB");
		expect(stmt.movements[3]!.counterpartyBic).toBe("GEBABEBB");
	});

	it("parses counterparty account and name from record 2.3", () => {
		const m = stmt.movements[0]!;
		expect(m.counterpartyAccountNumber).toBe("BE22313215646432");
		expect(m.counterpartyName).toBe("KLANT1 MET NAAM1");
	});

	it("parses all movement amounts as credits", () => {
		expect(stmt.movements[0]!.amount).toBe(5);
		expect(stmt.movements[1]!.amount).toBe(25);
		expect(stmt.movements[2]!.amount).toBe(20);
		expect(stmt.movements[3]!.amount).toBe(30);
	});

	it("parses structured communication for all movements", () => {
		expect(stmt.movements[0]!.communication).toBe("000003505158");
		expect(stmt.movements[1]!.communication).toBe("000003515846");
		expect(stmt.movements[2]!.communication).toBe("000003154982");
		expect(stmt.movements[3]!.communication).toBe("000002133131");
	});

	it("parses information record with structured type 001 and address", () => {
		const info = stmt.movements[0]!.information;
		// 3.1 + 3.2 form one combined info record
		expect(info).toHaveLength(1);
		expect(info[0]!.detailNumber).toBe(1);
		expect(info[0]!.communicationType).toBe("structured");
		expect(info[0]!.structuredCommunicationType).toBe(1);
		expect(info[0]!.communication).toContain("KLANT1 MET NAAM1");
		expect(info[0]!.communication).toContain("GROTE WEG");
		expect(info[0]!.communication).toContain("HASSELT");
	});

	it("parses trailer totals", () => {
		expect(stmt.totalDebit).toBe(0);
		expect(stmt.totalCredit).toBe(80);
	});

	it("has no free communications", () => {
		expect(stmt.freeCommunications).toHaveLength(0);
	});
});

// ── Sample 2: complex information records ─────────────────────────────

describe("sample2 - information records", () => {
	const file = parseCoda(fixture("sample2.cod"));
	const stmt = file!.statements[0]!;

	it("parses Belgian IBAN account", () => {
		expect(stmt.account.structure).toBe("belgian-iban");
		expect(stmt.account.number).toBe("BE62354872126588");
		expect(stmt.account.currency).toBe("EUR");
	});

	it("parses old balance", () => {
		expect(stmt.oldBalance.amount).toBe(25846);
		expect(stmt.oldBalance.date).toEqual(new Date(2022, 0, 23));
	});

	it("parses movements with multiple detail numbers", () => {
		// 3 movements: detail 0, detail 1, detail 2
		expect(stmt.movements).toHaveLength(3);
		expect(stmt.movements[0]!.detailNumber).toBe(0);
		expect(stmt.movements[1]!.detailNumber).toBe(1);
		expect(stmt.movements[2]!.detailNumber).toBe(2);
	});

	it("parses debit movement", () => {
		expect(stmt.movements[0]!.amount).toBe(-9.68);
	});

	it("parses multiple information records linked to last movement in sequence", () => {
		// Info records (det 3-11) are linked to the last movement (det=2)
		const m = stmt.movements[2]!;
		expect(m.information.length).toBeGreaterThan(0);
		for (const info of m.information) {
			expect(info.sequenceNumber).toBe(1);
		}
	});

	it("parses info record communication content", () => {
		const m = stmt.movements[2]!;
		const invoiceInfo = m.information.find((i) =>
			i.communication.includes("INVOICE"),
		);
		expect(invoiceInfo).toBeDefined();
	});

	it("parses trailer with debit total", () => {
		expect(stmt.totalDebit).toBe(9.68);
		expect(stmt.totalCredit).toBe(0);
	});
});

// ── Sample 3: multi-part transaction messages ─────────────────────────

describe("sample3 - multi-part messages", () => {
	const file = parseCoda(fixture("sample3.cod"));
	const stmt = file!.statements[0]!;

	it("parses account holder", () => {
		expect(stmt.accountHolderName).toBe("TIX02 SPRL");
	});

	it("parses movement with unstructured communication", () => {
		const m = stmt.movements[0]!;
		expect(m.communicationType).toBe("unstructured");
		expect(m.communication).toContain("Message goes here");
	});

	it("parses multiple movements under same sequence with different details", () => {
		expect(stmt.movements).toHaveLength(3);
		expect(stmt.movements[0]!.detailNumber).toBe(0);
		expect(stmt.movements[1]!.detailNumber).toBe(1);
		expect(stmt.movements[2]!.detailNumber).toBe(2);
	});

	it("parses debit movement amounts", () => {
		expect(stmt.movements[0]!.amount).toBe(-812.69);
		expect(stmt.movements[1]!.amount).toBe(-805.73);
		expect(stmt.movements[2]!.amount).toBe(-6.96);
	});

	it("parses communication for sub-detail movements", () => {
		expect(stmt.movements[1]!.communication).toContain("and continues here");
		expect(stmt.movements[2]!.communication).toContain("or here");
	});
});

// ── Sample 4: SEPA transfer with multi-line info ──────────────────────

describe("sample4 - SEPA transfer", () => {
	const file = parseCoda(fixture("sample4.cod"));
	const stmt = file!.statements[0]!;

	it("parses credit movement amount and date", () => {
		const m = stmt.movements[0]!;
		expect(m.amount).toBe(17233.54);
		expect(m.valueDate).toEqual(new Date(2017, 4, 31));
	});

	it("parses unstructured communication from record 2.1", () => {
		const m = stmt.movements[0]!;
		expect(m.communicationType).toBe("unstructured");
		expect(m.communication).toContain("Europese overschrijving");
	});

	it("parses counterparty name from record 2.3", () => {
		const m = stmt.movements[0]!;
		// Note: sample4 has non-standard field formatting
		expect(m.counterpartyName).toBeDefined();
	});

	it("parses multiple information records", () => {
		const info = stmt.movements[0]!.information;
		expect(info.length).toBeGreaterThanOrEqual(2);
		// Sample4 info records contain counterparty and transfer details
		const companyInfo = info.find((i) =>
			i.communication.includes("COMPANY BLABLABLAH BVBA"),
		);
		expect(companyInfo).toBeDefined();
	});

	it("parses info record with address continuation in 3.2", () => {
		const info = stmt.movements[0]!.information;
		const addrInfo = info.find((i) => i.communication.includes("STRAATSTREEEEEET"));
		expect(addrInfo).toBeDefined();
		expect(addrInfo!.communication).toContain("1111 PLACE");
	});
});

// ── Sample 5: different sequence numbers ──────────────────────────────

describe("sample5 - sequence numbers", () => {
	const file = parseCoda(fixture("sample5.cod"));
	const stmt = file!.statements[0]!;

	it("parses header with company name", () => {
		expect(stmt.addressee).toBe("CODELICIOUS");
	});

	it("parses 3 movements with correct sequence numbers", () => {
		expect(stmt.movements).toHaveLength(3);
		expect(stmt.movements[0]!.sequenceNumber).toBe(1);
		expect(stmt.movements[1]!.sequenceNumber).toBe(2);
		expect(stmt.movements[2]!.sequenceNumber).toBe(9);
	});

	it("parses credit amounts", () => {
		expect(stmt.movements[0]!.amount).toBe(1767.82);
		expect(stmt.movements[1]!.amount).toBe(2767.82);
		expect(stmt.movements[2]!.amount).toBe(1767.82);
	});

	it("parses counterparty for movements with record 2.3", () => {
		// First two movements have 2.3, third (seq=9) does not
		expect(stmt.movements[0]!.counterpartyName).toBe("BVBA.BAKKER PIET");
		expect(stmt.movements[0]!.counterpartyAccountNumber).toBe("BE54805480215856");
		expect(stmt.movements[0]!.counterpartyAccountCurrency).toBe("EUR");
		expect(stmt.movements[1]!.counterpartyName).toBe("BVBA.BAKKER PIET");
		expect(stmt.movements[2]!.counterpartyName).toBeUndefined();
	});

	it("parses information record with 3.2 and 3.3 continuations", () => {
		const info = stmt.movements[0]!.information;
		expect(info.length).toBeGreaterThanOrEqual(1);
		expect(info[0]!.structuredCommunicationType).toBe(1);
	});

	it("parses info with 3.3 continuation content", () => {
		const m = stmt.movements[0]!;
		const info3 = m.information.find((i) =>
			i.communication.includes("SOME INFORMATION"),
		);
		expect(info3).toBeDefined();
	});

	it("parses debit new balance", () => {
		expect(stmt.newBalance).toBeDefined();
		expect(stmt.newBalance!.amount).toBe(-500012.1);
	});
});

// ── Sample 6: free communications and debit movements ─────────────────

describe("sample6 - free communications & debit", () => {
	const file = parseCoda(fixture("sample6.cod"));
	const stmt = file!.statements[0]!;

	it("parses 3 movements", () => {
		expect(stmt.movements).toHaveLength(3);
	});

	it("parses debit amounts", () => {
		expect(stmt.movements[0]!.amount).toBe(-767.823);
	});

	it("parses credit amounts", () => {
		expect(stmt.movements[1]!.amount).toBe(2767.82);
		expect(stmt.movements[2]!.amount).toBe(1767.82);
	});

	it("parses free communication from record 4", () => {
		expect(stmt.freeCommunications).toHaveLength(1);
		expect(stmt.freeCommunications[0]).toBe("THIS IS A PUBLIC MESSAGE");
	});

	it("parses movement sequence numbers", () => {
		expect(stmt.movements[0]!.sequenceNumber).toBe(1);
		expect(stmt.movements[1]!.sequenceNumber).toBe(2);
		expect(stmt.movements[2]!.sequenceNumber).toBe(9);
	});
});

// ── 12298862.BC2: real-world comprehensive statement ──────────────────

describe("12298862.BC2 - real-world statement", () => {
	const file = parseCoda(fixture("12298862.BC2"));

	it("parses successfully", () => {
		expect(file).not.toBeNull();
		expect(file!.statements).toHaveLength(1);
	});

	const stmt = file!.statements[0]!;

	it("parses header", () => {
		expect(stmt.creationDate).toEqual(new Date(2023, 0, 26));
		expect(stmt.addressee).toBe("KRS LOGISTICS SPRL");
		expect(stmt.bic).toBe("BBRUBEBB");
		expect(stmt.companyId).toBe("00432308412");
		expect(stmt.version).toBe(2);
	});

	it("parses Belgian IBAN account", () => {
		expect(stmt.account.structure).toBe("belgian-iban");
		expect(stmt.account.number).toBe("BE75363112201051");
		expect(stmt.account.currency).toBe("EUR");
	});

	it("parses old balance", () => {
		expect(stmt.oldBalance.amount).toBe(16300.11);
		expect(stmt.oldBalance.date).toEqual(new Date(2023, 0, 25));
	});

	it("parses new balance", () => {
		expect(stmt.newBalance!.amount).toBe(17498.84);
		expect(stmt.newBalance!.date).toEqual(new Date(2023, 0, 26));
	});

	it("parses 26 movements", () => {
		expect(stmt.movements).toHaveLength(26);
	});

	it("parses first movement (debit - PROXIMUS)", () => {
		const m = stmt.movements[0]!;
		expect(m.amount).toBe(-815.31);
		expect(m.counterpartyName).toBe("PROXIMUS");
		expect(m.counterpartyAccountNumber).toBe("BE82210000088968");
		expect(m.counterpartyAccountCurrency).toBe("EUR");
		expect(m.counterpartyBic).toBe("GEBABEBB");
	});

	it("parses credit movement (SA ICARUS)", () => {
		const m = stmt.movements.find((m) => m.counterpartyName === "SA ICARUS");
		expect(m).toBeDefined();
		expect(m!.amount).toBe(302.5);
		expect(m!.counterpartyAccountNumber).toBe("BE79240081900033");
		expect(m!.counterpartyAccountCurrency).toBe("EUR");
	});

	it("parses movement with foreign IBAN (Luxembourg)", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "KYOTEC LUXEMBOURG S.A R.L.",
		);
		expect(m).toBeDefined();
		expect(m!.amount).toBe(375);
		expect(m!.counterpartyAccountNumber).toBe("LU690030217994690000");
		expect(m!.counterpartyBic).toBe("BGLLLULL");
	});

	it("parses movement with German IBAN", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "JACQUET DEUTSCHLAND GMBH",
		);
		expect(m).toBeDefined();
		expect(m!.amount).toBe(325);
		expect(m!.counterpartyAccountNumber).toBe("DE59370106001094001157");
		expect(m!.counterpartyBic).toBe("BNPADEFF");
	});

	it("parses movement with purpose field", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "JACQUET DEUTSCHLAND GMBH",
		);
		expect(m!.purpose).toBe("SUPP");
	});

	it("parses movement with Dutch IBAN", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "BROEKMAN LOGISTICS BV",
		);
		expect(m).toBeDefined();
		expect(m!.amount).toBe(5151.11);
		expect(m!.counterpartyAccountNumber).toBe("NL41ABNA0830352414");
		expect(m!.counterpartyBic).toBe("ABNANL2A");
	});

	it("parses movement with GB IBAN", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "TRAXYS EUROPE S A",
		);
		expect(m).toBeDefined();
		expect(m!.amount).toBe(26120);
		expect(m!.counterpartyAccountNumber).toBe("GB71DEUT40508123386700");
		expect(m!.counterpartyBic).toBe("DEUTGB2L");
	});

	it("parses large intracompany transfers", () => {
		const transfers = stmt.movements.filter(
			(m) => m.counterpartyName === "KRS logistics",
		);
		expect(transfers).toHaveLength(2);
		for (const t of transfers) {
			expect(t.amount).toBeLessThan(0);
		}
	});

	it("parses information records for movements", () => {
		const m = stmt.movements.find((m) => m.counterpartyName === "SA ICARUS");
		expect(m).toBeDefined();
		expect(m!.information.length).toBeGreaterThanOrEqual(1);
		expect(m!.information[0]!.communicationType).toBe("structured");
		expect(m!.information[0]!.structuredCommunicationType).toBe(1);
	});

	it("parses info records with address details", () => {
		const m = stmt.movements.find((m) => m.counterpartyName === "SA ICARUS");
		const addrInfo = m!.information.find((i) =>
			i.communication.includes("Rue des Alouettes"),
		);
		expect(addrInfo).toBeDefined();
		expect(addrInfo!.communication).toContain("HERSTAL");
	});

	it("parses instant SEPA transfer", () => {
		const m = stmt.movements.find(
			(m) => m.counterpartyName === "ASIA EUROPE TRADE CO SA",
		);
		expect(m).toBeDefined();
		expect(m!.amount).toBe(526.35);
		expect(m!.transactionCode.family).toBe(2);
		expect(m!.transactionCode.transaction).toBe(50);
	});

	it("parses trailer totals", () => {
		expect(stmt.totalDebit).toBe(68472.03);
		expect(stmt.totalCredit).toBe(69670.76);
	});

	it("balance change matches totals", () => {
		const netMovements = stmt.totalCredit - stmt.totalDebit;
		const balanceChange = stmt.newBalance!.amount - stmt.oldBalance.amount;
		expect(Math.abs(netMovements - balanceChange)).toBeLessThan(0.01);
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

// ── Account structure variants ────────────────────────────────────────

describe("account structures", () => {
	it("parses Belgian BBAN (structure 0)", () => {
		const file = parseCoda(fixture("sample1.cod"));
		const acct = file!.statements[0]!.account;
		expect(acct.structure).toBe("belgian-bban");
		expect(acct.number).toBe("138536152215");
		expect(acct.currency).toBe("EUR");
		expect(acct.countryCode).toBe("BE");
	});

	it("parses Belgian IBAN (structure 2)", () => {
		const file = parseCoda(fixture("sample2.cod"));
		const acct = file!.statements[0]!.account;
		expect(acct.structure).toBe("belgian-iban");
		expect(acct.number).toBe("BE62354872126588");
		expect(acct.currency).toBe("EUR");
	});
});

// ── Transaction code parsing ──────────────────────────────────────────

describe("transaction codes", () => {
	it("parses SEPA credit transfer code", () => {
		const file = parseCoda(fixture("12298862.BC2"));
		const m = file!.statements[0]!.movements.find(
			(m) => m.counterpartyName === "SA ICARUS",
		);
		expect(m!.transactionCode).toEqual({
			type: 0,
			family: 1,
			transaction: 50,
			category: 0,
		});
	});

	it("parses debit transfer code", () => {
		const file = parseCoda(fixture("12298862.BC2"));
		const m = file!.statements[0]!.movements[0]!;
		expect(m.transactionCode.family).toBe(1);
		expect(m.transactionCode.transaction).toBe(1);
	});
});

// ── Globalisation codes ───────────────────────────────────────────────

describe("globalisation codes", () => {
	it("parses globalisation code when present", () => {
		const file = parseCoda(fixture("sample2.cod"));
		const m = file!.statements[0]!.movements[0]!;
		expect(m.globalisationCode).toBe(1);
	});

	it("returns undefined when globalisation code is 0", () => {
		const file = parseCoda(fixture("sample4.cod"));
		const m = file!.statements[0]!.movements[0]!;
		expect(m.globalisationCode).toBeUndefined();
	});
});
