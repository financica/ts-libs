import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCamt053 } from "../src/parser.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("parseCamt053", () => {
	// -----------------------------------------------------------------------
	// Validation & error handling
	// -----------------------------------------------------------------------

	it("returns null for non-XML input", () => {
		expect(parseCamt053("not xml at all")).toBeNull();
	});

	it("returns null for valid XML that is not a CAMT.053 document", () => {
		expect(parseCamt053("<root><child>value</child></root>")).toBeNull();
	});

	it("returns null for a different ISO 20022 namespace", () => {
		const xml = `<?xml version="1.0"?>
			<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
				<CstmrCdtTrfInitn></CstmrCdtTrfInitn>
			</Document>`;
		expect(parseCamt053(xml)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseCamt053("")).toBeNull();
	});

	// -----------------------------------------------------------------------
	// Minimal fixture — core parsing
	// -----------------------------------------------------------------------

	describe("minimal fixture", () => {
		const xml = readFixture("minimal.xml");
		const report = parseCamt053(xml)!;

		it("parses successfully", () => {
			expect(report).not.toBeNull();
		});

		it("extracts group header fields", () => {
			expect(report.messageId).toBe("MSG-001");
			expect(report.creationDate).toEqual(new Date("2025-06-15T10:30:00Z"));
			expect(report.recipient).toBeUndefined();
		});

		it("extracts statement-level fields", () => {
			expect(report.statements).toHaveLength(1);
			const stmt = report.statements[0]!;
			expect(stmt.id).toBe("STMT-001");
			expect(stmt.creationDate).toEqual(new Date("2025-06-15T10:30:00Z"));
			expect(stmt.fromDate).toEqual(new Date("2025-01-01T00:00:00+01:00"));
			expect(stmt.toDate).toEqual(new Date("2025-07-01T00:00:00+01:00"));
		});

		it("extracts account IBAN and currency", () => {
			const acct = report.statements[0]!.account;
			expect(acct.iban).toBe("BE68539007547034");
			expect(acct.currency).toBe("EUR");
		});

		it("extracts account owner name and postal address", () => {
			const owner = report.statements[0]!.account.owner;
			expect(owner).toBeDefined();
			expect(owner!.name).toBe("Test Company BV");
			expect(owner!.postalAddress).toMatchObject({
				addressType: "ADDR",
				postalCode: "1000",
				townName: "Brussels",
				addressLines: ["Rue de la Loi 42"],
			});
		});

		it("extracts account owner organisation ID", () => {
			const id = report.statements[0]!.account.owner!.identification;
			expect(id).toBeDefined();
			expect(id!.organisationId).toBe("0123.456.789");
			expect(id!.organisationIdScheme).toBe("COID");
		});

		it("extracts account servicer (bank) details", () => {
			const svcr = report.statements[0]!.account.servicer;
			expect(svcr).toBeDefined();
			expect(svcr!.name).toBe("Test Bank SA");
			expect(svcr!.postalAddress).toMatchObject({
				postalCode: "1050",
				townName: "Brussels",
				addressLines: ["Avenue Louise 100"],
			});
		});

		it("extracts balances", () => {
			const balances = report.statements[0]!.balances;
			expect(balances).toHaveLength(2);

			const opbd = balances.find((b) => b.type === "OPBD")!;
			expect(opbd.amount).toBe(1000.0);
			expect(opbd.currency).toBe("EUR");
			expect(opbd.creditDebitIndicator).toBe("CRDT");
			expect(opbd.date).toEqual(new Date("2025-01-01T00:00:00+01:00"));

			const clbd = balances.find((b) => b.type === "CLBD")!;
			expect(clbd.amount).toBe(2500.5);
			expect(clbd.currency).toBe("EUR");
		});

		it("extracts transaction summary", () => {
			const summary = report.statements[0]!.transactionSummary;
			expect(summary).toBeDefined();
			expect(summary!.totalEntries).toBe(5);
			expect(summary!.totalEntriesSum).toBe(3000.0);
			expect(summary!.netAmount).toBe(1500.5);
			expect(summary!.netCreditDebitIndicator).toBe("CRDT");
			expect(summary!.totalCreditEntries).toBe(3);
			expect(summary!.totalCreditEntriesSum).toBe(2250.25);
			expect(summary!.totalDebitEntries).toBe(2);
			expect(summary!.totalDebitEntriesSum).toBe(-749.75);
		});

		it("extracts all 5 entries", () => {
			expect(report.statements[0]!.entries).toHaveLength(5);
		});

		it("parses a simple card entry (no NtryRef, no NtryDtls)", () => {
			const entry = report.statements[0]!.entries[0]!;
			expect(entry.entryReference).toBeUndefined();
			expect(entry.amount).toBe(42.5);
			expect(entry.currency).toBe("EUR");
			expect(entry.creditDebitIndicator).toBe("DBIT");
			expect(entry.status).toBe("BOOK");
			expect(entry.bookingDate).toEqual(new Date("2025-03-15T14:30:00+01:00"));
			expect(entry.bankTransactionCode?.proprietaryCode).toBe("CARD-1234567890");
			expect(entry.charges?.totalAmount).toBe(0);
			expect(entry.charges?.totalCurrency).toBe("EUR");
			expect(entry.additionalInformation).toBe(
				"Card transaction of 42.50 EUR issued by Coffee Shop BRUSSELS",
			);
			expect(entry.entryDetails).toHaveLength(0);
		});

		it("parses an entry with NtryRef and transaction details (creditor party)", () => {
			const entry = report.statements[0]!.entries[1]!;
			expect(entry.entryReference).toBe("INV-2025-001");
			expect(entry.amount).toBe(1500.0);
			expect(entry.creditDebitIndicator).toBe("CRDT");
			expect(entry.bankTransactionCode?.proprietaryCode).toBe(
				"TRANSFER-9876543210",
			);
			expect(entry.entryDetails).toHaveLength(1);
			const txDtls = entry.entryDetails[0]!.transactionDetails;
			expect(txDtls).toHaveLength(1);
			expect(txDtls[0]!.relatedParties?.creditor?.name).toBe("Acme Corporation");
		});

		it("parses an entry with currency exchange details", () => {
			const entry = report.statements[0]!.entries[2]!;
			expect(entry.amount).toBe(25.99);
			expect(entry.amountDetails).toBeDefined();
			expect(entry.amountDetails!.transactionAmount).toBe(25.99);
			expect(entry.amountDetails!.transactionCurrency).toBe("EUR");

			const fx = entry.amountDetails!.currencyExchange;
			expect(fx).toBeDefined();
			expect(fx!.sourceCurrency).toBe("EUR");
			expect(fx!.targetCurrency).toBe("USD");
			expect(fx!.unitCurrency).toBe("EUR");
			expect(fx!.exchangeRate).toBe(1.085);

			expect(entry.charges?.totalAmount).toBe(0.15);
		});

		it("parses a direct debit entry with creditor party", () => {
			const entry = report.statements[0]!.entries[3]!;
			expect(entry.entryReference).toBe("DD-MONTHLY-001");
			expect(entry.bankTransactionCode?.proprietaryCode).toBe(
				"DIRECT_DEBIT-7777777777",
			);
			const creditor =
				entry.entryDetails[0]!.transactionDetails[0]!.relatedParties?.creditor;
			expect(creditor?.name).toBe("Telecom Provider NV");
		});

		it("parses an entry with references, creditor account, and remittance info", () => {
			const entry = report.statements[0]!.entries[4]!;
			expect(entry.entryReference).toBe("SALARY-2025-06");
			expect(entry.amount).toBe(3500.0);

			const txDtls = entry.entryDetails[0]!.transactionDetails[0]!;
			expect(txDtls.references?.endToEndId).toBe("SALARY-JUN-2025");
			expect(txDtls.relatedParties?.creditor?.name).toBe("John Employee");
			expect(txDtls.relatedParties?.creditorAccount?.iban).toBe(
				"BE71096123456769",
			);
			expect(txDtls.remittanceInformation?.unstructured).toEqual([
				"Salary June 2025",
			]);
		});
	});

	// -----------------------------------------------------------------------
	// Advanced fixture — edge cases & full feature coverage
	// -----------------------------------------------------------------------

	describe("advanced fixture", () => {
		const xml = readFixture("advanced.xml");
		const report = parseCamt053(xml)!;

		it("supports older CAMT.053 namespace versions", () => {
			expect(report).not.toBeNull();
			expect(report.messageId).toBe("ADV-MSG-001");
		});

		it("extracts message recipient", () => {
			expect(report.recipient).toBeDefined();
			expect(report.recipient!.name).toBe("Treasury Department");
			expect(report.recipient!.identification?.organisationId).toBe("TREAS-001");
		});

		it("extracts multiple statements", () => {
			expect(report.statements).toHaveLength(2);
			expect(report.statements[0]!.id).toBe("STMT-ADV-001");
			expect(report.statements[1]!.id).toBe("STMT-ADV-002");
		});

		it("extracts electronic and legal sequence numbers", () => {
			const stmt = report.statements[0]!;
			expect(stmt.electronicSequenceNumber).toBe(42);
			expect(stmt.legalSequenceNumber).toBe(7);
		});

		it("extracts BIC-based financial institution", () => {
			const svcr = report.statements[0]!.account.servicer;
			expect(svcr).toBeDefined();
			expect(svcr!.bic).toBe("COBADEFFXXX");
			expect(svcr!.name).toBe("Commerzbank AG");
		});

		it("supports Dt-only dates (not DtTm)", () => {
			const balance = report.statements[0]!.balances[0]!;
			expect(balance.date).toEqual(new Date("2025-06-01"));
		});

		it("extracts value date", () => {
			const entry = report.statements[0]!.entries[0]!;
			expect(entry.valueDate).toEqual(new Date("2025-06-15"));
		});

		it("extracts account servicer reference", () => {
			const entry = report.statements[0]!.entries[0]!;
			expect(entry.accountServicerReference).toBe("ACCTSVCRREF-001");
		});

		it("extracts domain-based bank transaction codes", () => {
			const btc = report.statements[0]!.entries[0]!.bankTransactionCode;
			expect(btc).toBeDefined();
			expect(btc!.domainCode).toBe("PMNT");
			expect(btc!.domainFamilyCode).toBe("ICDT");
			expect(btc!.domainSubFamilyCode).toBe("ESCT");
			expect(btc!.proprietaryCode).toBe("SEPA-CT");
			expect(btc!.proprietaryIssuer).toBe("CAMT");
		});

		it("extracts batch information", () => {
			const batch = report.statements[0]!.entries[0]!.entryDetails[0]!.batch;
			expect(batch).toBeDefined();
			expect(batch!.messageId).toBe("BATCH-MSG-001");
			expect(batch!.paymentInformationId).toBe("PMT-INF-001");
			expect(batch!.numberOfTransactions).toBe(2);
			expect(batch!.totalAmount).toBe(5000.0);
			expect(batch!.totalCurrency).toBe("EUR");
			expect(batch!.creditDebitIndicator).toBe("DBIT");
		});

		it("extracts full transaction references", () => {
			const refs =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.references;
			expect(refs).toBeDefined();
			expect(refs!.messageId).toBe("PAIN-MSG-001");
			expect(refs!.accountServicerReference).toBe("ACCTSVCRREF-TX-001");
			expect(refs!.paymentInformationId).toBe("PMT-INF-001");
			expect(refs!.instructionId).toBe("INSTR-001");
			expect(refs!.endToEndId).toBe("E2E-001");
			expect(refs!.transactionId).toBe("TX-001");
			expect(refs!.mandateId).toBe("MNDT-001");
		});

		it("extracts transaction amount details without FX", () => {
			const amtDtls =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.amountDetails;
			expect(amtDtls).toBeDefined();
			expect(amtDtls!.transactionAmount).toBe(3000.0);
			expect(amtDtls!.transactionCurrency).toBe("EUR");
			expect(amtDtls!.currencyExchange).toBeUndefined();
		});

		it("extracts transaction-level bank transaction code", () => {
			const btc =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.bankTransactionCode;
			expect(btc?.domainCode).toBe("PMNT");
		});

		it("extracts debtor, creditor, and ultimate creditor", () => {
			const parties =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.relatedParties;
			expect(parties).toBeDefined();
			expect(parties!.debtor?.name).toBe("Our Company GmbH");
			expect(parties!.debtorAccount?.iban).toBe("DE89370400440532013000");
			expect(parties!.creditor?.name).toBe("Supplier AG");
			expect(parties!.creditorAccount?.iban).toBe("DE27100777770209299700");
			expect(parties!.ultimateCreditor?.name).toBe("Supplier Parent Holding");
		});

		it("extracts creditor postal address from transaction details", () => {
			const addr =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.relatedParties?.creditor?.postalAddress;
			expect(addr).toBeDefined();
			expect(addr).toMatchObject({
				streetName: "Hauptstraße",
				buildingNumber: "10",
				postalCode: "60311",
				townName: "Frankfurt",
				country: "DE",
			});
		});

		it("extracts related agents (debtor and creditor)", () => {
			const agents =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.relatedAgents;
			expect(agents).toBeDefined();
			expect(agents!.debtorAgent?.bic).toBe("COBADEFFXXX");
			expect(agents!.creditorAgent?.bic).toBe("DEUTDEFFXXX");
			expect(agents!.creditorAgent?.name).toBe("Deutsche Bank AG");
		});

		it("extracts purpose code", () => {
			const purpose =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.purpose;
			expect(purpose?.code).toBe("SUPP");
		});

		it("extracts unstructured and structured remittance information", () => {
			const rmtInf =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.remittanceInformation;
			expect(rmtInf).toBeDefined();
			expect(rmtInf!.unstructured).toEqual(["Invoice INV-2025-0042"]);
			expect(rmtInf!.structured).toHaveLength(1);
			expect(rmtInf!.structured![0]!.creditorReferenceType).toBe("SCOR");
			expect(rmtInf!.structured![0]!.creditorReference).toBe("RF18539007547034");
		});

		it("extracts additional transaction information", () => {
			const addtlInf =
				report.statements[0]!.entries[0]!.entryDetails[0]!
					.transactionDetails[0]!.additionalInformation;
			expect(addtlInf).toBe("SEPA Credit Transfer to supplier");
		});

		it("parses multiple transaction details within a single entry", () => {
			const txDtls =
				report.statements[0]!.entries[0]!.entryDetails[0]!.transactionDetails;
			expect(txDtls).toHaveLength(2);
			expect(txDtls[1]!.references?.endToEndId).toBe("E2E-002");
			expect(txDtls[1]!.relatedParties?.creditor?.name).toBe("Another Supplier");
		});

		it("extracts reversal indicator", () => {
			const entry = report.statements[0]!.entries[0]!;
			expect(entry.reversalIndicator).toBe(false);

			const reversalEntry = report.statements[0]!.entries[1]!;
			expect(reversalEntry.reversalIndicator).toBe(true);
		});

		it("extracts return information with reason and additional info", () => {
			const rtrInf =
				report.statements[0]!.entries[1]!.entryDetails[0]!
					.transactionDetails[0]!.returnInformation;
			expect(rtrInf).toBeDefined();
			expect(rtrInf!.reasonCode).toBe("AC04");
			expect(rtrInf!.additionalInformation).toEqual([
				"Account closed",
				"Contact beneficiary",
			]);
		});

		it("extracts second statement with other-ID account", () => {
			const stmt = report.statements[1]!;
			expect(stmt.account.iban).toBeUndefined();
			expect(stmt.account.otherId).toBe("123456789");
			expect(stmt.account.currency).toBe("USD");
		});

		it("extracts proprietary balance type", () => {
			const balance = report.statements[1]!.balances[0]!;
			expect(balance.type).toBe("");
			expect(balance.proprietaryType).toBe("CUSTOM_BAL");
			expect(balance.amount).toBe(10000.0);
			expect(balance.currency).toBe("USD");
		});

		it("second statement has no entries", () => {
			expect(report.statements[1]!.entries).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// Wise bank statement — real-world parsing
	// -----------------------------------------------------------------------

	describe("Wise bank statement (real-world)", () => {
		const xml = readFixture("wise-statement.xml");
		const report = parseCamt053(xml)!;

		it("parses successfully", () => {
			expect(report).not.toBeNull();
		});

		it("detects camt.053.001.10 namespace", () => {
			expect(report.messageId).toBe("20101509-1772897175925");
		});

		it("has a single statement", () => {
			expect(report.statements).toHaveLength(1);
		});

		it("extracts correct statement date range", () => {
			const stmt = report.statements[0]!;
			expect(stmt.fromDate).toEqual(new Date("2025-01-01T00:00:00+01:00"));
			expect(stmt.toDate).toEqual(new Date("2026-01-01T00:00:00+01:00"));
		});

		it("extracts account IBAN", () => {
			expect(report.statements[0]!.account.iban).toBe("BE31967195551255");
		});

		it("extracts account currency", () => {
			expect(report.statements[0]!.account.currency).toBe("EUR");
		});

		it("extracts account owner details", () => {
			const owner = report.statements[0]!.account.owner!;
			expect(owner.name).toBe("Ingram Technologies");
			expect(owner.postalAddress?.postalCode).toBe("1000");
			expect(owner.postalAddress?.townName).toBe("Bruxelles");
			expect(owner.postalAddress?.addressLines).toEqual(["Rue du Poinçon 51A"]);
			expect(owner.identification?.organisationId).toBe("0766.280.697");
			expect(owner.identification?.organisationIdScheme).toBe("COID");
		});

		it("extracts servicer (Wise) details", () => {
			const svcr = report.statements[0]!.account.servicer!;
			expect(svcr.name).toBe("Wise Europe SA");
			expect(svcr.postalAddress?.postalCode).toBe("1050");
			expect(svcr.postalAddress?.townName).toBe("Brussels");
			expect(svcr.postalAddress?.addressLines).toEqual([
				"Rue du Trône 100, 3rd floor",
			]);
		});

		it("extracts both balances (OPBD and CLBD)", () => {
			const balances = report.statements[0]!.balances;
			expect(balances).toHaveLength(2);

			const clbd = balances.find((b) => b.type === "CLBD")!;
			expect(clbd.amount).toBe(9703.06);
			expect(clbd.currency).toBe("EUR");
			expect(clbd.creditDebitIndicator).toBe("CRDT");

			const opbd = balances.find((b) => b.type === "OPBD")!;
			expect(opbd.amount).toBe(1695.35);
		});

		it("extracts all 489 entries", () => {
			expect(report.statements[0]!.entries).toHaveLength(489);
		});

		it("extracts transaction summary", () => {
			const summary = report.statements[0]!.transactionSummary!;
			expect(summary.totalEntries).toBe(489);
			expect(summary.totalEntriesSum).toBe(8007.71);
			expect(summary.netAmount).toBe(8007.71);
			expect(summary.netCreditDebitIndicator).toBe("CRDT");
			expect(summary.totalCreditEntries).toBe(157);
			expect(summary.totalCreditEntriesSum).toBe(230459.62);
			expect(summary.totalDebitEntries).toBe(332);
			expect(summary.totalDebitEntriesSum).toBe(-222451.91);
		});

		it("parses card transaction entries correctly", () => {
			// First entry: card transaction without NtryRef
			const entry = report.statements[0]!.entries[0]!;
			expect(entry.entryReference).toBeUndefined();
			expect(entry.amount).toBe(13.99);
			expect(entry.currency).toBe("EUR");
			expect(entry.creditDebitIndicator).toBe("DBIT");
			expect(entry.status).toBe("BOOK");
			expect(entry.bankTransactionCode?.proprietaryCode).toBe("CARD-3288528719");
			expect(entry.charges?.totalAmount).toBe(0);
			expect(entry.additionalInformation).toContain("Brico 3322");
		});

		it("parses entries with NtryRef", () => {
			// Third entry has NtryRef
			const entry = report.statements[0]!.entries[2]!;
			expect(entry.entryReference).toBe("INGRAM0172 Ingram..ram technologies");
			expect(entry.creditDebitIndicator).toBe("CRDT");
		});

		it("parses entries with transaction details (creditor party)", () => {
			// Entry with NtryDtls containing Cdtr
			const entriesWithDetails = report.statements[0]!.entries.filter(
				(e) => e.entryDetails.length > 0,
			);
			expect(entriesWithDetails.length).toBeGreaterThan(0);

			// Find an entry with a creditor name
			const withCreditor = entriesWithDetails.find((e) =>
				e.entryDetails.some((d) =>
					d.transactionDetails.some((t) => t.relatedParties?.creditor?.name),
				),
			)!;
			expect(withCreditor).toBeDefined();
			const creditorName =
				withCreditor.entryDetails[0]!.transactionDetails[0]!.relatedParties
					?.creditor?.name;
			expect(creditorName).toBeTruthy();
		});

		it("parses entries with currency exchange details", () => {
			const fxEntries = report.statements[0]!.entries.filter(
				(e) => e.amountDetails?.currencyExchange,
			);
			expect(fxEntries.length).toBeGreaterThan(0);

			const fxEntry = fxEntries[0]!;
			const fx = fxEntry.amountDetails!.currencyExchange!;
			expect(fx.sourceCurrency).toBe("EUR");
			expect(fx.targetCurrency).toBe("USD");
			expect(fx.unitCurrency).toBe("EUR");
			expect(fx.exchangeRate).toBeGreaterThan(0);
		});

		it("all entries have valid amounts and currencies", () => {
			for (const entry of report.statements[0]!.entries) {
				expect(entry.amount).toBeGreaterThan(0);
				expect(entry.currency).toBe("EUR");
				expect(["CRDT", "DBIT"]).toContain(entry.creditDebitIndicator);
			}
		});

		it("all entries have booking dates", () => {
			for (const entry of report.statements[0]!.entries) {
				expect(entry.bookingDate).toBeInstanceOf(Date);
				expect(entry.bookingDate!.getTime()).not.toBeNaN();
			}
		});

		it("all entries have status BOOK", () => {
			for (const entry of report.statements[0]!.entries) {
				expect(entry.status).toBe("BOOK");
			}
		});

		it("all entries have bank transaction codes", () => {
			for (const entry of report.statements[0]!.entries) {
				expect(entry.bankTransactionCode?.proprietaryCode).toBeTruthy();
			}
		});

		it("credit and debit entry counts match transaction summary", () => {
			const entries = report.statements[0]!.entries;
			const credits = entries.filter((e) => e.creditDebitIndicator === "CRDT");
			const debits = entries.filter((e) => e.creditDebitIndicator === "DBIT");
			expect(credits).toHaveLength(157);
			expect(debits).toHaveLength(332);
		});

		it("entries with both NtryDtls and AmtDtls are parsed correctly", () => {
			// Find an entry that has both FX details and transaction details
			const combined = report.statements[0]!.entries.find(
				(e) => e.amountDetails?.currencyExchange && e.entryDetails.length > 0,
			);
			if (combined) {
				expect(
					combined.amountDetails!.currencyExchange!.exchangeRate,
				).toBeGreaterThan(0);
				expect(combined.entryDetails[0]!.transactionDetails).toBeDefined();
			}
		});

		it("preserves special characters in entry references", () => {
			// Find entries with structured communication (Belgian +++xxx/xxxx/xxxxx+++)
			const structured = report.statements[0]!.entries.find((e) =>
				e.entryReference?.startsWith("+++"),
			);
			expect(structured).toBeDefined();
			expect(structured!.entryReference).toMatch(
				/^\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+$/,
			);
		});
	});
});
