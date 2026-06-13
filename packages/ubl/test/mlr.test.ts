import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	isPeppolMessageLevelResponse,
	parsePeppolMessageLevelResponse,
	PEPPOL_MLR_DOCUMENT_TYPE_VALUE,
	PEPPOL_MLR_PROCESS_VALUE,
} from "../src/mlr.js";

const readFixture = (name: string) =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

const MLR_XML = readFixture("peppol-mlr.xml");

describe("isPeppolMessageLevelResponse", () => {
	it("detects by document-type value", () => {
		expect(
			isPeppolMessageLevelResponse({
				documentTypeValue: PEPPOL_MLR_DOCUMENT_TYPE_VALUE,
			}),
		).toBe(true);
	});

	it("detects by process value", () => {
		expect(
			isPeppolMessageLevelResponse({ processValue: PEPPOL_MLR_PROCESS_VALUE }),
		).toBe(true);
	});

	it("detects by parsing the ApplicationResponse XML", () => {
		expect(isPeppolMessageLevelResponse({ xml: MLR_XML })).toBe(true);
	});

	it("returns false for a non-ApplicationResponse document", () => {
		expect(isPeppolMessageLevelResponse({ xml: "<Invoice />" })).toBe(false);
	});

	it("returns false when nothing identifies the document", () => {
		expect(isPeppolMessageLevelResponse({})).toBe(false);
	});

	it("unwraps an SBDH-wrapped ApplicationResponse", () => {
		const wrapped = `<?xml version="1.0" encoding="UTF-8"?>
<StandardBusinessDocument xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">
${MLR_XML.replace(/<\?xml[^>]*\?>/, "")}
</StandardBusinessDocument>`;
		expect(isPeppolMessageLevelResponse({ xml: wrapped })).toBe(true);
	});
});

describe("parsePeppolMessageLevelResponse", () => {
	it("parses every field of a Peppol MLR", () => {
		expect(parsePeppolMessageLevelResponse(MLR_XML)).toEqual({
			customizationId: "urn:fdc:peppol.eu:poacc:trns:mlr:3",
			profileId: "urn:fdc:peppol.eu:poacc:bis:billing:3",
			responseId: "MLR-2026-0001",
			issueDate: "2026-04-02",
			issueTime: "12:34:56",
			referencedDocumentId: "123e4567-e89b-12d3-a456-426614174000",
			responseCode: "AB",
			description: "Accepted for processing",
			senderIdentifier: "0208:0793904121",
			receiverIdentifier: "0208:0793904999",
		});
	});

	it("does not let a nested DocumentReference id shadow the response id", () => {
		const parsed = parsePeppolMessageLevelResponse(MLR_XML);
		expect(parsed.responseId).toBe("MLR-2026-0001");
		expect(parsed.referencedDocumentId).toBe(
			"123e4567-e89b-12d3-a456-426614174000",
		);
	});

	it("throws when the document is not an ApplicationResponse", () => {
		expect(() => parsePeppolMessageLevelResponse("<Invoice />")).toThrow(
			/not a Peppol Message Level Response/,
		);
	});
});
