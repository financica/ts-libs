import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Camt053ParseError, parseCamt053 } from "../src/parser.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

/**
 * One CAMT.053 message carries a list of statements, one per account. Consumers
 * routinely read `statements[0]` and drop the rest; these tests pin what the
 * parser actually hands them, so the fix has a contract to build on.
 */
describe("parseCamt053 — multiple statements per message", () => {
	const report = parseCamt053(readFixture("multi-statement.xml"));

	it("surfaces every statement, not just the first", () => {
		expect(report?.statements).toHaveLength(2);
		expect(report?.statements.map((s) => s.id)).toEqual(["STMT-EUR", "STMT-USD"]);
	});

	it("scopes each account to its own statement", () => {
		expect(report?.statements.map((s) => s.account)).toMatchObject([
			{ iban: "BE68539007547034", currency: "EUR", owner: { name: "Acme BV" } },
			{
				iban: "DE89370400440532013000",
				currency: "USD",
				owner: { name: "Acme Inc" },
			},
		]);
	});

	it("attributes entries to the statement that declared them", () => {
		const [first, second] = report?.statements ?? [];

		expect(first?.entries.map((e) => e.entryReference)).toEqual([
			"EUR-NTRY-1",
			"EUR-NTRY-2",
		]);
		expect(second?.entries.map((e) => e.entryReference)).toEqual(["USD-NTRY-1"]);

		// Amount, currency and direction travel with the entry, so a consumer that
		// keeps only statement 1 loses a 750 USD debit outright — not merely a
		// duplicate of something it already has.
		expect(first?.entries).toMatchObject([
			{ amount: 200, currency: "EUR", creditDebitIndicator: "CRDT" },
			{ amount: 50, currency: "EUR", creditDebitIndicator: "DBIT" },
		]);
		expect(second?.entries).toMatchObject([
			{ amount: 750, currency: "USD", creditDebitIndicator: "DBIT" },
		]);
	});

	it("keeps each statement's balances distinct", () => {
		expect(
			report?.statements.map((s) =>
				s.balances.map((b) => [b.type, b.amount, b.currency]),
			),
		).toEqual([
			[
				["OPBD", 1000, "EUR"],
				["CLBD", 1150, "EUR"],
			],
			[
				["OPBD", 5000, "USD"],
				["CLBD", 4250, "USD"],
			],
		]);
	});

	it("shares the group header across statements", () => {
		// The message id belongs to the message, not to a statement: it cannot be
		// used to tell two statements of the same file apart.
		expect(report?.messageId).toBe("MULTI-MSG-001");
		expect(report?.statements.map((s) => s.electronicSequenceNumber)).toEqual([
			1, 2,
		]);
	});
});

describe("parseCamt053 — no statements", () => {
	// A message with a group header but no <Stmt> is valid CAMT.053 (a bank
	// reporting "nothing to say for this period"). The parser treats it as a
	// successful parse, NOT as a rejection.
	const noStatements = `<?xml version="1.0"?>
		<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
			<BkToCstmrStmt>
				<GrpHdr>
					<MsgId>EMPTY-MSG-001</MsgId>
					<CreDtTm>2025-07-01T06:00:00Z</CreDtTm>
				</GrpHdr>
			</BkToCstmrStmt>
		</Document>`;

	it("returns a report with an empty statements array, not null", () => {
		const report = parseCamt053(noStatements);
		expect(report).not.toBeNull();
		expect(report?.statements).toEqual([]);
		expect(report?.messageId).toBe("EMPTY-MSG-001");
		expect(report?.creationDate).toEqual(new Date("2025-07-01T06:00:00Z"));
	});

	it("throws when BkToCstmrStmt itself is absent", () => {
		// Distinguishing the two matters: an empty statement list is a real
		// report, a CAMT.053 document without its mandatory body is broken.
		const xml = `<?xml version="1.0"?>
			<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"></Document>`;
		expect(() => parseCamt053(xml)).toThrow(Camt053ParseError);
	});
});
