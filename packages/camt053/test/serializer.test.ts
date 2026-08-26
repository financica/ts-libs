import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCamt053 } from "../src/parser.js";
import { CAMT053_SERIALIZED_NS, serializeCamt053 } from "../src/serializer.js";
import type { Camt053Report } from "../src/types.js";

const fixturesDir = join(import.meta.dirname, "fixtures");
const fixtures = readdirSync(fixturesDir).map((name) => ({
	name,
	content: readFileSync(join(fixturesDir, name), "utf8"),
}));

const parsed = (xml: string): Camt053Report => {
	const report = parseCamt053(xml);
	if (!report) throw new Error("not a CAMT.053 document");
	return report;
};

describe("serializeCamt053", () => {
	it.each(fixtures.map((f) => [f.name, f.content]))(
		"round-trips %s through the parser",
		(_name, xml) => {
			const original = parsed(xml);
			const out = serializeCamt053(original);
			expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
			expect(out).toContain(`xmlns="${CAMT053_SERIALIZED_NS}"`);
			expect(parseCamt053(out)).toEqual(original);
		},
	);

	it("writes UTC-midnight dates as Dt and other instants as DtTm", () => {
		const report: Camt053Report = {
			messageId: "M1",
			creationDate: new Date("2026-01-05T10:00:00Z"),
			statements: [
				{
					id: "S1",
					creationDate: new Date("2026-01-05T10:00:00Z"),
					account: { iban: "BE68539007547034", currency: "EUR" },
					balances: [
						{
							type: "OPBD",
							amount: 1.5,
							currency: "EUR",
							creditDebitIndicator: "CRDT",
							date: new Date("2026-01-04T00:00:00Z"),
						},
					],
					entries: [
						{
							amount: 12.345,
							currency: "EUR",
							creditDebitIndicator: "DBIT",
							bookingDate: new Date("2026-01-05T08:30:00Z"),
							entryDetails: [],
						},
					],
				},
			],
		};
		const out = serializeCamt053(report);
		expect(out).toContain("<Dt>2026-01-04</Dt>");
		expect(out).toContain("<DtTm>2026-01-05T08:30:00.000Z</DtTm>");
		expect(out).toContain('<Amt Ccy="EUR">12.345</Amt>');
		expect(parseCamt053(out)).toEqual(report);
	});

	it("escapes XML special characters in text", () => {
		const report: Camt053Report = {
			messageId: "M<1>&",
			creationDate: new Date("2026-01-05T10:00:00Z"),
			statements: [],
		};
		const out = serializeCamt053(report);
		expect(out).toContain("<MsgId>M&lt;1&gt;&amp;</MsgId>");
		expect(parseCamt053(out)?.messageId).toBe("M<1>&");
	});
});
