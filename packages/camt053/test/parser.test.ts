import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Camt053ParseError, parseCamt053 } from "../src/parser.js";
import type { Camt053Entry } from "../src/types.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

const sum = (entries: Camt053Entry[]) => entries.reduce((acc, e) => acc + e.amount, 0);

/** Wrap a single <Ntry> body into a minimal camt.053.001.02 document. */
const wrapEntry = (ntry: string) => `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
	<BkToCstmrStmt>
		<GrpHdr><MsgId>M</MsgId><CreDtTm>2025-01-01T00:00:00Z</CreDtTm></GrpHdr>
		<Stmt>
			<Id>S</Id>
			<CreDtTm>2025-01-01T00:00:00Z</CreDtTm>
			<Acct><Id><IBAN>BE68539007547034</IBAN></Id><Ccy>EUR</Ccy></Acct>
			<Ntry>${ntry}</Ntry>
		</Stmt>
	</BkToCstmrStmt>
</Document>`;

const camtDoc = (body: string) => `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">${body}</Document>`;

describe("parseCamt053", () => {
	// -----------------------------------------------------------------------
	// Validation & error handling
	// -----------------------------------------------------------------------

	it.each([
		["non-XML input", "not xml at all"],
		["empty string", ""],
		["unbalanced tags", "<Document><BkToCstmrStmt></Document>"],
	])("throws Camt053ParseError for %s", (_label, xml) => {
		expect(() => parseCamt053(xml)).toThrow(Camt053ParseError);
	});

	it.each([
		[
			"valid XML that is not a CAMT.053 document",
			"<root><child>value</child></root>",
		],
		[
			"a different ISO 20022 namespace",
			`<?xml version="1.0"?>
			<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
				<CstmrCdtTrfInitn></CstmrCdtTrfInitn>
			</Document>`,
		],
	])("returns null for %s", (_label, xml) => {
		expect(parseCamt053(xml)).toBeNull();
	});

	// Known bug: a namespace-prefixed root (`<ns:Document xmlns:ns="…">`) is a
	// valid serialisation of the same document, but the parser only looks up
	// the literal `Document` key and the `@_xmlns` attribute, so it returns null.
	// fast-xml-parser's `removeNSPrefix` is not a drop-in fix (it strips the
	// xmlns attribute the namespace check relies on), so this needs a local-name
	// lookup — left as a documented failure.
	it.fails("parses a namespace-prefixed Document root", () => {
		const xml = `<?xml version="1.0"?>
			<ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
				<ns:BkToCstmrStmt>
					<ns:GrpHdr><ns:MsgId>PFX-1</ns:MsgId></ns:GrpHdr>
				</ns:BkToCstmrStmt>
			</ns:Document>`;
		expect(parseCamt053(xml)?.messageId).toBe("PFX-1");
	});

	// -----------------------------------------------------------------------
	// Minimal fixture — core parsing
	// -----------------------------------------------------------------------

	describe("minimal fixture", () => {
		const report = parseCamt053(readFixture("minimal.xml"))!;
		const stmt = report.statements[0]!;

		it("extracts group header, statement and account details", () => {
			expect(report).toMatchObject({
				messageId: "MSG-001",
				creationDate: new Date("2025-06-15T10:30:00Z"),
			});
			expect(report).not.toHaveProperty("recipient");
			expect(report.statements).toHaveLength(1);
			expect(stmt).toMatchObject({
				id: "STMT-001",
				creationDate: new Date("2025-06-15T10:30:00Z"),
				fromDate: new Date("2025-01-01T00:00:00+01:00"),
				toDate: new Date("2025-07-01T00:00:00+01:00"),
				account: {
					iban: "BE68539007547034",
					currency: "EUR",
					owner: {
						name: "Test Company BV",
						postalAddress: {
							addressType: "ADDR",
							postalCode: "1000",
							townName: "Brussels",
							addressLines: ["Rue de la Loi 42"],
						},
						identification: {
							organisationId: "0123.456.789",
							organisationIdScheme: "COID",
						},
					},
					servicer: {
						name: "Test Bank SA",
						postalAddress: {
							postalCode: "1050",
							townName: "Brussels",
							addressLines: ["Avenue Louise 100"],
						},
					},
				},
			});
		});

		it("extracts balances and transaction summary", () => {
			expect(stmt.balances).toHaveLength(2);
			expect(stmt.balances.find((b) => b.type === "OPBD")).toMatchObject({
				amount: 1000.0,
				currency: "EUR",
				creditDebitIndicator: "CRDT",
				date: new Date("2025-01-01T00:00:00+01:00"),
			});
			expect(stmt.balances.find((b) => b.type === "CLBD")).toMatchObject({
				amount: 2500.5,
				currency: "EUR",
			});
			expect(stmt.transactionSummary).toEqual({
				totalEntries: 5,
				totalEntriesSum: 3000.0,
				netAmount: 1500.5,
				netCreditDebitIndicator: "CRDT",
				totalCreditEntries: 3,
				totalCreditEntriesSum: 2250.25,
				totalDebitEntries: 2,
				totalDebitEntriesSum: -749.75,
			});
		});

		it("extracts all 5 entries", () => {
			expect(stmt.entries).toHaveLength(5);
		});

		it("parses a simple card entry (no NtryRef, no NtryDtls)", () => {
			expect(stmt.entries[0]).toMatchObject({
				amount: 42.5,
				currency: "EUR",
				creditDebitIndicator: "DBIT",
				status: "BOOK",
				bookingDate: new Date("2025-03-15T14:30:00+01:00"),
				bankTransactionCode: { proprietaryCode: "CARD-1234567890" },
				charges: { totalAmount: 0, totalCurrency: "EUR" },
				additionalInformation:
					"Card transaction of 42.50 EUR issued by Coffee Shop BRUSSELS",
				entryDetails: [],
			});
		});

		it("parses an entry with NtryRef and a creditor party", () => {
			expect(stmt.entries[1]).toMatchObject({
				entryReference: "INV-2025-001",
				amount: 1500.0,
				creditDebitIndicator: "CRDT",
				bankTransactionCode: { proprietaryCode: "TRANSFER-9876543210" },
				entryDetails: [
					{
						transactionDetails: [
							{
								relatedParties: {
									creditor: { name: "Acme Corporation" },
								},
							},
						],
					},
				],
			});
			expect(stmt.entries[1]!.entryDetails).toHaveLength(1);
			expect(stmt.entries[1]!.entryDetails[0]!.transactionDetails).toHaveLength(
				1,
			);
		});

		it("parses an entry with currency exchange details and charges", () => {
			expect(stmt.entries[2]).toMatchObject({
				amount: 25.99,
				amountDetails: {
					transactionAmount: 25.99,
					transactionCurrency: "EUR",
					currencyExchange: {
						sourceCurrency: "EUR",
						targetCurrency: "USD",
						unitCurrency: "EUR",
						exchangeRate: 1.085,
					},
				},
				charges: { totalAmount: 0.15 },
			});
		});

		it("parses a direct debit entry with creditor party", () => {
			expect(stmt.entries[3]).toMatchObject({
				entryReference: "DD-MONTHLY-001",
				bankTransactionCode: { proprietaryCode: "DIRECT_DEBIT-7777777777" },
				entryDetails: [
					{
						transactionDetails: [
							{
								relatedParties: {
									creditor: { name: "Telecom Provider NV" },
								},
							},
						],
					},
				],
			});
		});

		it("parses an entry with references, creditor account, and remittance info", () => {
			expect(stmt.entries[4]).toMatchObject({
				entryReference: "SALARY-2025-06",
				amount: 3500.0,
				entryDetails: [
					{
						transactionDetails: [
							{
								references: { endToEndId: "SALARY-JUN-2025" },
								relatedParties: {
									creditor: { name: "John Employee" },
									creditorAccount: { iban: "BE71096123456769" },
								},
								remittanceInformation: {
									unstructured: ["Salary June 2025"],
								},
							},
						],
					},
				],
			});
		});
	});

	// -----------------------------------------------------------------------
	// Advanced fixture — edge cases & full feature coverage
	// -----------------------------------------------------------------------

	describe("advanced fixture (camt.053.001.08)", () => {
		const report = parseCamt053(readFixture("advanced.xml"))!;
		const stmt = report.statements[0]!;
		const entry = stmt.entries[0]!;

		it("extracts report and statement-level fields", () => {
			expect(report).toMatchObject({
				messageId: "ADV-MSG-001",
				recipient: {
					name: "Treasury Department",
					identification: { organisationId: "TREAS-001" },
				},
			});
			expect(report.statements.map((s) => s.id)).toEqual([
				"STMT-ADV-001",
				"STMT-ADV-002",
			]);
			expect(stmt).toMatchObject({
				electronicSequenceNumber: 42,
				legalSequenceNumber: 7,
				account: { servicer: { bic: "COBADEFFXXX", name: "Commerzbank AG" } },
			});
		});

		it("parses Dt-only dates (no DtTm) as UTC midnight", () => {
			// ECMAScript parses a date-only ISO string ("2025-06-01") as UTC midnight,
			// not local midnight. Pinned so a switch to local-time parsing shows up.
			expect(stmt.balances[0]!.date).toEqual(new Date("2025-06-01T00:00:00Z"));
			expect(entry.valueDate).toEqual(new Date("2025-06-15T00:00:00Z"));
		});

		it("extracts entry-level fields (servicer ref, domain BkTxCd, reversal indicator)", () => {
			expect(entry).toMatchObject({
				accountServicerReference: "ACCTSVCRREF-001",
				reversalIndicator: false,
				bankTransactionCode: {
					domainCode: "PMNT",
					domainFamilyCode: "ICDT",
					domainSubFamilyCode: "ESCT",
					proprietaryCode: "SEPA-CT",
					proprietaryIssuer: "CAMT",
				},
			});
			expect(stmt.entries[1]!.reversalIndicator).toBe(true);
		});

		it("extracts the full entry-detail tree (batch, references, parties, agents, remittance)", () => {
			expect(entry.entryDetails).toHaveLength(1);
			const detail = entry.entryDetails[0]!;
			expect(detail.batch).toEqual({
				messageId: "BATCH-MSG-001",
				paymentInformationId: "PMT-INF-001",
				numberOfTransactions: 2,
				totalAmount: 5000.0,
				totalCurrency: "EUR",
				creditDebitIndicator: "DBIT",
			});
			expect(detail.transactionDetails).toHaveLength(2);
			expect(detail.transactionDetails[0]).toMatchObject({
				references: {
					messageId: "PAIN-MSG-001",
					accountServicerReference: "ACCTSVCRREF-TX-001",
					paymentInformationId: "PMT-INF-001",
					instructionId: "INSTR-001",
					endToEndId: "E2E-001",
					transactionId: "TX-001",
					mandateId: "MNDT-001",
				},
				amountDetails: {
					transactionAmount: 3000.0,
					transactionCurrency: "EUR",
				},
				bankTransactionCode: { domainCode: "PMNT" },
				relatedParties: {
					debtor: { name: "Our Company GmbH" },
					debtorAccount: { iban: "DE89370400440532013000" },
					creditor: {
						name: "Supplier AG",
						postalAddress: {
							streetName: "Hauptstraße",
							buildingNumber: "10",
							postalCode: "60311",
							townName: "Frankfurt",
							country: "DE",
						},
					},
					creditorAccount: { iban: "DE27100777770209299700" },
					ultimateCreditor: { name: "Supplier Parent Holding" },
				},
				relatedAgents: {
					debtorAgent: { bic: "COBADEFFXXX" },
					creditorAgent: { bic: "DEUTDEFFXXX", name: "Deutsche Bank AG" },
				},
				purpose: { code: "SUPP" },
				remittanceInformation: {
					unstructured: ["Invoice INV-2025-0042"],
					structured: [
						{
							creditorReferenceType: "SCOR",
							creditorReference: "RF18539007547034",
						},
					],
				},
				additionalInformation: "SEPA Credit Transfer to supplier",
			});
			expect(detail.transactionDetails[1]).toMatchObject({
				references: { endToEndId: "E2E-002" },
				relatedParties: { creditor: { name: "Another Supplier" } },
			});
		});

		it("extracts return information with reason and additional info", () => {
			expect(
				stmt.entries[1]!.entryDetails[0]!.transactionDetails[0]!
					.returnInformation,
			).toEqual({
				reasonCode: "AC04",
				additionalInformation: ["Account closed", "Contact beneficiary"],
			});
		});

		it("extracts second statement with other-ID account, proprietary balance, no entries", () => {
			expect(report.statements[1]).toMatchObject({
				account: { otherId: "123456789", currency: "USD" },
				balances: [
					{
						proprietaryType: "CUSTOM_BAL",
						amount: 10000.0,
						currency: "USD",
					},
				],
				entries: [],
			});
			expect(report.statements[1]!.balances[0]).not.toHaveProperty("type");
		});
	});

	// -----------------------------------------------------------------------
	// Wise bank statement — real-world parsing (camt.053.001.10)
	// -----------------------------------------------------------------------

	describe("Wise bank statement (real-world, camt.053.001.10)", () => {
		const report = parseCamt053(readFixture("wise-statement.xml"))!;
		const stmt = report.statements[0]!;
		const entries = stmt.entries;

		it("extracts report, statement, account and balance details", () => {
			expect(report.messageId).toBe("20101509-1772897175925");
			expect(report.statements).toHaveLength(1);
			expect(stmt).toMatchObject({
				fromDate: new Date("2025-01-01T00:00:00+01:00"),
				toDate: new Date("2026-01-01T00:00:00+01:00"),
				account: {
					iban: "BE31967195551255",
					currency: "EUR",
					owner: {
						name: "Ingram Technologies",
						postalAddress: {
							postalCode: "1000",
							townName: "Bruxelles",
							addressLines: ["Rue du Poinçon 51A"],
						},
						identification: {
							organisationId: "0766.280.697",
							organisationIdScheme: "COID",
						},
					},
					servicer: {
						name: "Wise Europe SA",
						postalAddress: {
							postalCode: "1050",
							townName: "Brussels",
							addressLines: ["Rue du Trône 100, 3rd floor"],
						},
					},
				},
			});
			expect(stmt.balances).toHaveLength(2);
			expect(stmt.balances.find((b) => b.type === "OPBD")).toMatchObject({
				amount: 1695.35,
				currency: "EUR",
			});
			expect(stmt.balances.find((b) => b.type === "CLBD")).toMatchObject({
				amount: 9703.06,
				currency: "EUR",
				creditDebitIndicator: "CRDT",
			});
			// Captured from <TxsSummry> in wise-statement.xml.
			expect(stmt.transactionSummary).toEqual({
				totalEntries: 489,
				totalEntriesSum: 8007.71,
				netAmount: 8007.71,
				netCreditDebitIndicator: "CRDT",
				totalCreditEntries: 157,
				totalCreditEntriesSum: 230459.62,
				totalDebitEntries: 332,
				totalDebitEntriesSum: -222451.91,
			});
		});

		it("entries reconcile with the transaction summary and balances (conservation)", () => {
			const summary = stmt.transactionSummary!;
			const credits = entries.filter((e) => e.creditDebitIndicator === "CRDT");
			const debits = entries.filter((e) => e.creditDebitIndicator === "DBIT");
			expect(entries).toHaveLength(summary.totalEntries!);
			expect(credits).toHaveLength(summary.totalCreditEntries!);
			expect(debits).toHaveLength(summary.totalDebitEntries!);
			// Entry amounts are unsigned; the summary carries the debit sum negative.
			expect(sum(credits)).toBeCloseTo(summary.totalCreditEntriesSum!, 2);
			expect(-sum(debits)).toBeCloseTo(summary.totalDebitEntriesSum!, 2);
			expect(sum(credits) - sum(debits)).toBeCloseTo(summary.netAmount!, 2);
			// Opening balance + net movement = closing balance (1695.35 + 8007.71 = 9703.06).
			const opbd = stmt.balances.find((b) => b.type === "OPBD")!;
			const clbd = stmt.balances.find((b) => b.type === "CLBD")!;
			expect(opbd.amount + summary.netAmount!).toBeCloseTo(clbd.amount, 2);
		});

		it("every entry is well-formed relative to its statement", () => {
			for (const entry of entries) {
				expect(entry.amount).toBeGreaterThan(0);
				expect(entry.currency).toBe(stmt.account.currency);
				expect(["CRDT", "DBIT"]).toContain(entry.creditDebitIndicator);
				expect(["BOOK", "PDNG", "INFO"]).toContain(entry.status);
				expect(entry.bookingDate).toBeInstanceOf(Date);
				expect(entry.bookingDate!.getTime()).not.toBeNaN();
				expect(entry.bankTransactionCode?.proprietaryCode).toBeTruthy();
			}
		});

		it("parses a card entry without NtryRef (entries[0])", () => {
			expect(entries[0]).toMatchObject({
				amount: 13.99,
				currency: "EUR",
				creditDebitIndicator: "DBIT",
				status: "BOOK",
				bankTransactionCode: { proprietaryCode: "CARD-3288528719" },
				charges: { totalAmount: 0, totalCurrency: "EUR" },
				additionalInformation:
					"Card transaction of 13.99 EUR issued by Brico 3322 Anspach BRUXELLES",
				entryDetails: [],
			});
		});

		it("parses an incoming transfer with NtryRef (entries[2])", () => {
			expect(entries[2]).toMatchObject({
				entryReference: "INGRAM0172 Ingram..ram technologies",
				amount: 20,
				creditDebitIndicator: "CRDT",
				bankTransactionCode: { proprietaryCode: "TRANSFER-1892759203" },
			});
		});

		it("parses creditor parties through the v10 <Cdtr><Pty> wrapper", () => {
			// 153 <Pty> wrappers in wise-statement.xml, one per entry with NtryDtls.
			const withDetails = entries.filter((e) => e.entryDetails.length > 0);
			expect(withDetails).toHaveLength(153);
			// entries[6]: <NtryRef>+++015/0271/24711+++</NtryRef>, Cdtr/Pty/Nm "EMA Consult".
			expect(entries[6]).toMatchObject({
				entryReference: "+++015/0271/24711+++",
				amount: 423.5,
				creditDebitIndicator: "DBIT",
				entryDetails: [
					{
						transactionDetails: [
							{ relatedParties: { creditor: { name: "EMA Consult" } } },
						],
					},
				],
			});
		});

		it("preserves Belgian structured communication in entry references", () => {
			// +++015/0271/24711+++ — three groups of 3/4/5 digits, the last two being
			// the mod-97 check on the first ten.
			const ref = entries[6]!.entryReference!;
			expect(ref).toMatch(/^\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+$/);
			const digits = ref.replaceAll(/\D/g, "");
			expect(Number(digits.slice(0, 10)) % 97).toBe(Number(digits.slice(10)));
		});

		it("parses entry-level currency exchange details (entries[24])", () => {
			expect(entries[24]!.amountDetails).toEqual({
				transactionAmount: 14.69,
				transactionCurrency: "EUR",
				currencyExchange: {
					sourceCurrency: "EUR",
					targetCurrency: "USD",
					unitCurrency: "EUR",
					exchangeRate: 1.1633,
				},
			});
		});

		it("parses an entry carrying both AmtDtls (FX) and NtryDtls (entries[144])", () => {
			// <NtryRef>BMM-116</NtryRef>, <XchgRate>103.03600</XchgRate>, Cdtr/Pty/Nm
			// "BROWN MEN MARKETING PRIVATE LIMITED".
			expect(entries[144]).toMatchObject({
				entryReference: "BMM-116",
				amount: 603.04,
				amountDetails: {
					transactionAmount: 603.04,
					currencyExchange: { targetCurrency: "INR", exchangeRate: 103.036 },
				},
				entryDetails: [
					{
						transactionDetails: [
							{
								relatedParties: {
									creditor: {
										name: "BROWN MEN MARKETING PRIVATE LIMITED",
									},
								},
							},
						],
					},
				],
			});
		});
	});

	// -----------------------------------------------------------------------
	// Entry-level edge cases (synthetic)
	// -----------------------------------------------------------------------

	describe("entry edge cases", () => {
		it("keeps the first <Chrgs> block when an entry repeats it", () => {
			// The schema allows Chrgs 0..n on an entry; the parser exposes a single
			// `charges` object and takes the first block. Pinned as the current rule.
			const xml = wrapEntry(`
				<Amt Ccy="EUR">10.00</Amt>
				<CdtDbtInd>DBIT</CdtDbtInd>
				<Sts><Cd>BOOK</Cd></Sts>
				<Chrgs><TtlChrgsAndTaxAmt Ccy="EUR">0.15</TtlChrgsAndTaxAmt></Chrgs>
				<Chrgs><TtlChrgsAndTaxAmt Ccy="EUR">0.30</TtlChrgsAndTaxAmt></Chrgs>`);
			const entry = parseCamt053(xml)!.statements[0]!.entries[0]!;
			expect(entry.charges).toEqual({ totalAmount: 0.15, totalCurrency: "EUR" });
		});

		it("throws Camt053ParseError for an entry without <Amt>", () => {
			const xml = wrapEntry(`
				<CdtDbtInd>DBIT</CdtDbtInd>
				<Sts><Cd>BOOK</Cd></Sts>`);
			expect(() => parseCamt053(xml)).toThrow(Camt053ParseError);
		});

		it("throws Camt053ParseError for a CdtDbtInd outside the union", () => {
			const xml = wrapEntry(`
				<Amt Ccy="EUR">10.00</Amt>
				<CdtDbtInd>CREDIT</CdtDbtInd>`);
			expect(() => parseCamt053(xml)).toThrow(Camt053ParseError);
		});

		it("leaves optional entry fields absent rather than filled", () => {
			const xml = wrapEntry(`
				<Amt Ccy="EUR">10.00</Amt>
				<CdtDbtInd>DBIT</CdtDbtInd>`);
			const entry = parseCamt053(xml)!.statements[0]!.entries[0]!;
			expect(entry.bookingDate).toBeUndefined();
			expect(entry.valueDate).toBeUndefined();
			expect(entry.status).toBeUndefined();
			expect(entry.reversalIndicator).toBeUndefined();
			expect(entry.entryDetails).toEqual([]);
		});

		it("validates the batch CdtDbtInd instead of casting it", () => {
			const xml = wrapEntry(`
				<Amt Ccy="EUR">10.00</Amt>
				<CdtDbtInd>DBIT</CdtDbtInd>
				<NtryDtls><Btch><MsgId>B1</MsgId><CdtDbtInd>BOGUS</CdtDbtInd></Btch></NtryDtls>`);
			const detail =
				parseCamt053(xml)!.statements[0]!.entries[0]!.entryDetails[0]!;
			expect(detail.batch?.messageId).toBe("B1");
			expect(detail.batch?.creditDebitIndicator).toBeUndefined();
		});
	});

	describe("broken documents", () => {
		it("throws Camt053ParseError for malformed XML in the CAMT.053 namespace", () => {
			const xml = camtDoc(
				"<BkToCstmrStmt><GrpHdr><MsgId>M</MsgId></BkToCstmrStmt>",
			);
			expect(() => parseCamt053(xml)).toThrow(Camt053ParseError);
		});

		it("sets cause on the wrapped XML error", () => {
			const xml = camtDoc("<BkToCstmrStmt><GrpHdr></BkToCstmrStmt>");
			let error: unknown;
			try {
				parseCamt053(xml);
			} catch (e) {
				error = e;
			}
			expect(error).toBeInstanceOf(Camt053ParseError);
			expect((error as Camt053ParseError).name).toBe("Camt053ParseError");
			expect((error as Camt053ParseError).cause).toBeDefined();
		});

		it.each([
			[
				"GrpHdr/MsgId",
				"<BkToCstmrStmt><GrpHdr><CreDtTm>2025-01-01T00:00:00Z</CreDtTm></GrpHdr></BkToCstmrStmt>",
			],
			[
				"GrpHdr/CreDtTm",
				"<BkToCstmrStmt><GrpHdr><MsgId>M</MsgId></GrpHdr></BkToCstmrStmt>",
			],
			[
				"Stmt/Id",
				`<BkToCstmrStmt><GrpHdr><MsgId>M</MsgId><CreDtTm>2025-01-01T00:00:00Z</CreDtTm></GrpHdr>
				<Stmt><CreDtTm>2025-01-01T00:00:00Z</CreDtTm><Acct><Id><IBAN>X</IBAN></Id></Acct></Stmt></BkToCstmrStmt>`,
			],
			[
				"Bal/Dt",
				`<BkToCstmrStmt><GrpHdr><MsgId>M</MsgId><CreDtTm>2025-01-01T00:00:00Z</CreDtTm></GrpHdr>
				<Stmt><Id>S</Id><CreDtTm>2025-01-01T00:00:00Z</CreDtTm><Acct><Id><IBAN>X</IBAN></Id></Acct>
				<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal></Stmt></BkToCstmrStmt>`,
			],
		])("throws Camt053ParseError when %s is missing", (_label, body) => {
			expect(() => parseCamt053(camtDoc(body))).toThrow(Camt053ParseError);
		});
	});
});
