import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCoda } from "../src/parser.js";
import { serializeCoda } from "../src/serializer.js";
import type { CodaFile, CodaStatement } from "../src/types.js";

const fixturesDir = join(import.meta.dirname, "fixtures");
const fixtures = readdirSync(fixturesDir).map((name) => ({
	name,
	content: readFileSync(join(fixturesDir, name), "latin1"),
}));

const parsed = (content: string): CodaFile => {
	const file = parseCoda(content);
	if (!file) throw new Error("not a CODA file");
	return file;
};

describe("serializeCoda", () => {
	it("emits 128-column CRLF records", () => {
		const out = serializeCoda(parsed(fixtures[0]!.content));
		const lines = out.split("\r\n");
		expect(lines.at(-1)).toBe("");
		for (const line of lines.slice(0, -1)) expect(line).toHaveLength(128);
	});

	it.each(fixtures.map((f) => [f.name, f.content]))(
		"round-trips %s through the parser",
		(_name, content) => {
			const original = parsed(content);
			const again = parseCoda(serializeCoda(original));
			expect(again).toEqual(original);
		},
	);

	it("counts records and totals movements in the trailer", () => {
		const original = parsed(fixtures[0]!.content);
		const stmt = original.statements[0]!;
		const { totalDebit: _d, totalCredit: _c, ...withoutTrailer } = stmt;
		const out = serializeCoda({ statements: [withoutTrailer as CodaStatement] });
		const lines = out.split("\r\n").filter(Boolean);
		expect(lines.at(-1)!.substring(16, 22)).toBe(
			String(lines.length - 2).padStart(6, "0"),
		);
		const again = parseCoda(out)!.statements[0]!;
		expect(again.totalDebit).toBeCloseTo(stmt.totalDebit!, 3);
		expect(again.totalCredit).toBeCloseTo(stmt.totalCredit!, 3);
	});

	it("replaces characters outside Latin-1 and clips overlong text", () => {
		const original = parsed(fixtures[0]!.content);
		const stmt = original.statements[0]!;
		const movement = {
			...stmt.movements[0]!,
			communication: "Zażółć €".padEnd(400, "x"),
			communicationType: "unstructured" as const,
			counterpartyName: "Ünïcode name",
		};
		const out = serializeCoda({ statements: [{ ...stmt, movements: [movement] }] });
		expect(/[^ -ÿ\r\n]/.test(out)).toBe(false);
		const again = parseCoda(out)!.statements[0]!.movements[0]!;
		expect(again.communication.startsWith("Za?ó?? ?")).toBe(true);
		expect(again.communication).toHaveLength(149);
		expect(again.counterpartyName).toBe("Ünïcode name");
	});
});
