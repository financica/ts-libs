import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	base64DecodedSize,
	extractUblEmbeddedAttachments,
	isPdfLikeAttachment,
} from "../src/attachments.js";
import { UblParseError } from "../src/errors.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("extractUblEmbeddedAttachments", () => {
	it("extracts an embedded PDF with content and decoded size", () => {
		const attachments = extractUblEmbeddedAttachments(
			readFixture("ubl-invoice-with-attachment.xml"),
		);

		expect(attachments).toHaveLength(1);
		const attachment = attachments[0]!;
		expect(attachment.filename).toBe("invoice.pdf");
		expect(attachment.mimeCode).toBe("application/pdf");
		expect(attachment.lineOrder).toBe(0);
		expect(attachment.base64Content.length).toBeGreaterThan(0);
		expect(attachment.sizeBytes).toBe(
			Buffer.from(attachment.base64Content, "base64").length,
		);
	});

	it("skips external-URI-only attachments", () => {
		const attachments = extractUblEmbeddedAttachments(
			readFixture("ubl-invoice-proximus.xml"),
		);
		expect(attachments).toEqual([]);
	});

	it("returns an empty list for documents without attachments", () => {
		expect(extractUblEmbeddedAttachments(readFixture("ubl-invoice.xml"))).toEqual(
			[],
		);
	});

	it("throws UblParseError for malformed XML", () => {
		expect(() => extractUblEmbeddedAttachments("not xml")).toThrow(UblParseError);
	});

	it("throws UblParseError for XML that is not a UBL invoice", () => {
		expect(() => extractUblEmbeddedAttachments("<html/>")).toThrow(UblParseError);
	});
});

describe("base64DecodedSize", () => {
	it.each([
		["", 0],
		["SGVsbG8=", 5],
		["SGk=", 2],
		["SGVsbG8gV29ybGQ=", 11],
		["SGVs\nbG8=", 5],
	])("%j decodes to %d bytes", (input, expected) => {
		expect(base64DecodedSize(input)).toBe(expected);
	});
});

describe("isPdfLikeAttachment", () => {
	it("matches by MIME type", () => {
		expect(isPdfLikeAttachment({ mimeCode: "application/pdf" })).toBe(true);
		expect(isPdfLikeAttachment({ mimeCode: "APPLICATION/PDF" })).toBe(true);
		expect(isPdfLikeAttachment({ mimeCode: "text/xml" })).toBe(false);
	});

	it("falls back to the filename extension", () => {
		expect(isPdfLikeAttachment({ filename: "Invoice.PDF" })).toBe(true);
		expect(isPdfLikeAttachment({ filename: "invoice.xml" })).toBe(false);
		expect(isPdfLikeAttachment({})).toBe(false);
	});
});
