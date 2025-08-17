import { describe, expect, it } from "vitest";
import { parseTSV } from "./parser";

describe("parseTSV", () => {
	it("should parse a simple TSV string", () => {
		const tsv = "name\tage\tlocation\nJohn\t30\tNew York\nJane\t25\tLondon";
		const result = parseTSV(tsv);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			name: "John",
			age: "30",
			location: "New York",
		});
		expect(result[1]).toEqual({
			name: "Jane",
			age: "25",
			location: "London",
		});
	});

	it("should handle quoted values", () => {
		const tsv =
			'name\tdescription\n"Item 1"\t"A long, detailed description"\n"Item 2"\t"Another description"';
		const result = parseTSV(tsv);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			name: "Item 1",
			description: "A long, detailed description",
		});
	});

	it("should handle empty values", () => {
		const tsv = "col1\tcol2\tcol3\nvalue1\t\tvalue3\n\tvalue2\t";
		const result = parseTSV(tsv);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			col1: "value1",
			col2: "",
			col3: "value3",
		});
		expect(result[1]).toEqual({
			col1: "",
			col2: "value2",
			col3: "",
		});
	});

	it("should handle values with quotes inside", () => {
		const tsv =
			'code\tdescription\n"01.11"\t"Growing of cereals, ""other than rice"", and legumes"';
		const result = parseTSV(tsv);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			code: "01.11",
			description: 'Growing of cereals, "other than rice", and legumes',
		});
	});

	it("should handle empty input", () => {
		const result = parseTSV("");
		expect(result).toEqual([]);
	});

	it("should handle header-only input", () => {
		const tsv = "col1\tcol2\tcol3";
		const result = parseTSV(tsv);
		expect(result).toEqual([]);
	});

	it("should handle NACE-specific format", () => {
		const tsv =
			'NACE_CODE\tEN_DESC\tFR_DESC\n"A"\t"AGRICULTURE, FORESTRY AND FISHING"\t"AGRICULTURE, SYLVICULTURE ET PÊCHE"';
		const result = parseTSV(tsv);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			NACE_CODE: "A",
			EN_DESC: "AGRICULTURE, FORESTRY AND FISHING",
			FR_DESC: "AGRICULTURE, SYLVICULTURE ET PÊCHE",
		});
	});
});
