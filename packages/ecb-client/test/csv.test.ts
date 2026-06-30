import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv.js";

describe("parseCsv", () => {
	it("parses a header and rows into keyed records", () => {
		const records = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
		expect(records).toEqual([
			{ a: "1", b: "2", c: "3" },
			{ a: "4", b: "5", c: "6" },
		]);
	});

	it("keeps commas inside quoted fields (the ECB TITLE_COMPL case)", () => {
		const records = parseCsv(
			'CURRENCY,OBS_VALUE,TITLE_COMPL\nUSD,1.0945,"ECB reference exchange rate, US dollar/Euro, 2.15 pm"\n',
		);
		expect(records[0]?.["TITLE_COMPL"]).toBe(
			"ECB reference exchange rate, US dollar/Euro, 2.15 pm",
		);
		expect(records[0]?.["OBS_VALUE"]).toBe("1.0945");
	});

	it("unescapes doubled quotes", () => {
		const records = parseCsv('x\n"a ""quoted"" value"\n');
		expect(records[0]?.["x"]).toBe('a "quoted" value');
	});

	it("returns an empty array for an empty body", () => {
		expect(parseCsv("")).toEqual([]);
		expect(parseCsv("\n")).toEqual([]);
	});

	it("tolerates a missing trailing newline", () => {
		expect(parseCsv("a,b\n1,2")).toEqual([{ a: "1", b: "2" }]);
	});
});
