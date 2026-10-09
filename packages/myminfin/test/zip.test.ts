import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipSingleFile } from "../src/zip";

describe("zipSingleFile", () => {
	it("lays out one stored entry whose directory points back at it", () => {
		const content = "<ns2:VATConsignment>é</ns2:VATConsignment>";
		const zip = Buffer.from(zipSingleFile("declaration.xml", content));
		const data = Buffer.from(content, "utf8");
		const name = "declaration.xml";

		expect(zip.readUInt32LE(0)).toBe(0x04034b50);
		expect(zip.readUInt16LE(8)).toBe(0); // stored
		expect(zip.readUInt32LE(14)).toBe(crc32(data));
		expect(zip.readUInt32LE(18)).toBe(data.length);
		expect(zip.subarray(30, 30 + name.length).toString()).toBe(name);
		expect(zip.subarray(30 + name.length, 30 + name.length + data.length)).toEqual(
			data,
		);

		const end = zip.length - 22;
		expect(zip.readUInt32LE(end)).toBe(0x06054b50);
		expect(zip.readUInt16LE(end + 10)).toBe(1);
		const centralOffset = zip.readUInt32LE(end + 16);
		expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
		expect(zip.readUInt32LE(centralOffset + 42)).toBe(0); // local header at 0
	});
});
