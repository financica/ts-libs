import { describe, expect, it } from "vitest";
import { classifyPeppolDocumentType } from "../src/document-types";
import {
	buildCanonicalParticipantId,
	buildParticipantId,
	buildSmpHostname,
	parseServiceGroupDocumentTypes,
} from "../src/smp-lookup";

describe("buildParticipantId", () => {
	it("joins scheme and a cleaned value", () => {
		expect(buildParticipantId("9925", "BE 0123.456.789")).toBe("9925:BE0123456789");
	});

	it("builds the canonical iso6523 form", () => {
		expect(buildCanonicalParticipantId("9915", "test")).toBe(
			"iso6523-actorid-upis::9915:test",
		);
	});
});

describe("buildSmpHostname", () => {
	// Expected hash derived independently with `md5sum`, not the production code:
	//   printf '%s' 'iso6523-actorid-upis::9915:test' | md5sum
	const EXPECTED =
		"B-26a4b512669c6f336bb538fbd2624809.iso6523-actorid-upis.edelivery.tech.ec.europa.eu";

	it("follows the OpenPeppol SML hostname algorithm", () => {
		expect(buildSmpHostname("iso6523-actorid-upis::9915:test")).toBe(EXPECTED);
	});

	it("lowercases the identifier before hashing", () => {
		expect(buildSmpHostname("iso6523-actorid-upis::9915:TEST")).toBe(EXPECTED);
	});
});

const reference = (docTypeId: string) =>
	`<smp:ServiceMetadataReference href="http://smp.example.eu/iso6523-actorid-upis%3A%3A9925%3ABE0123456789/services/${encodeURIComponent(docTypeId)}"/>`;

const INVOICE_DOC_TYPE =
	"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";
const CREDIT_NOTE_DOC_TYPE =
	"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";

const serviceGroup = (refs: string[]) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<smp:ServiceGroup xmlns:smp="http://busdox.org/serviceMetadata/publishing/1.0/" xmlns:id="http://busdox.org/transport/identifiers/1.0/">
	<id:ParticipantIdentifier scheme="iso6523-actorid-upis">9925:BE0123456789</id:ParticipantIdentifier>
	<smp:ServiceMetadataReferenceCollection>
		${refs.join("\n\t\t")}
	</smp:ServiceMetadataReferenceCollection>
</smp:ServiceGroup>`;

describe("parseServiceGroupDocumentTypes", () => {
	it("decodes every ServiceMetadataReference href back to its document type id", () => {
		const result = parseServiceGroupDocumentTypes(
			serviceGroup([reference(INVOICE_DOC_TYPE), reference(CREDIT_NOTE_DOC_TYPE)]),
		);
		expect(result).toEqual([INVOICE_DOC_TYPE, CREDIT_NOTE_DOC_TYPE]);
	});

	it("handles a single (non-array) reference", () => {
		expect(
			parseServiceGroupDocumentTypes(serviceGroup([reference(INVOICE_DOC_TYPE)])),
		).toEqual([INVOICE_DOC_TYPE]);
	});

	it("returns nothing for a participant with no service references", () => {
		expect(parseServiceGroupDocumentTypes(serviceGroup([]))).toEqual([]);
	});
});

describe("classifyPeppolDocumentType", () => {
	it.each([
		[INVOICE_DOC_TYPE, "invoice"],
		[CREDIT_NOTE_DOC_TYPE, "credit-note"],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0::2.1",
			"self-billing-invoice",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:fdc:peppol.eu:poacc:trns:invoice_response:3::2.1",
			"invoice-response",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:fdc:peppol.eu:poacc:trns:mlr:3::2.1",
			"message-level-response",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Order-2::Order##urn:fdc:peppol.eu:poacc:trns:order:3::2.1",
			"order",
		],
		["something-we-do-not-recognise", "other"],
	])("classifies %s", (docTypeId, expected) => {
		expect(classifyPeppolDocumentType(docTypeId)).toBe(expected);
	});
});
