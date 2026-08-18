import { describe, expect, it } from "vitest";
import { classifyPeppolDocumentType } from "../src/document-types";
import {
	buildCanonicalParticipantId,
	buildParticipantId,
	buildSmlHostname,
	isDnsNotFound,
	parseServiceGroupDocumentTypes,
	parseSmpUrlFromNaptrRegexp,
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

describe("buildSmlHostname", () => {
	// The exact hostname OpenPeppol publishes for the SMK test participant
	// `9915:test` (see the CNAME→NAPTR migration spec). Derived independently as
	//   strip-pad(base32(sha256(lowercase("9915:test")))) = eh5boav…dw6a
	const TEST_HASH = "eh5boavaktmbgzyh2a63dz4qov33fvp5nsdvqklucfraayoodw6a";

	it("follows the OpenPeppol NAPTR SML hostname algorithm (test SMK)", () => {
		expect(buildSmlHostname("9915:test", "test")).toBe(
			`${TEST_HASH}.iso6523-actorid-upis.participant.sml.test.tech.peppol.org`,
		);
	});

	it("targets the production SML zone by default", () => {
		expect(buildSmlHostname("9915:test")).toBe(
			`${TEST_HASH}.iso6523-actorid-upis.participant.sml.prod.tech.peppol.org`,
		);
	});

	it("lowercases the identifier before hashing", () => {
		expect(buildSmlHostname("9915:TEST", "test")).toBe(
			buildSmlHostname("9915:test", "test"),
		);
	});
});

describe("parseSmpUrlFromNaptrRegexp", () => {
	it("extracts the SMP URL from a Meta:SMP U-NAPTR regexp", () => {
		expect(parseSmpUrlFromNaptrRegexp("!.*!https://smp.onfact.be!")).toBe(
			"https://smp.onfact.be",
		);
	});

	it("strips a trailing slash", () => {
		expect(parseSmpUrlFromNaptrRegexp("!.*!https://smp.elma-smp.no/!")).toBe(
			"https://smp.elma-smp.no",
		);
	});

	it("rejects a regexp without an http(s) replacement", () => {
		expect(parseSmpUrlFromNaptrRegexp("!.*!!")).toBeNull();
		expect(parseSmpUrlFromNaptrRegexp("")).toBeNull();
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
			serviceGroup([
				reference(INVOICE_DOC_TYPE),
				reference(CREDIT_NOTE_DOC_TYPE),
			]),
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

	it("dedupes references that point at the same document type", () => {
		expect(
			parseServiceGroupDocumentTypes(
				serviceGroup([
					reference(INVOICE_DOC_TYPE),
					reference(INVOICE_DOC_TYPE),
				]),
			),
		).toEqual([INVOICE_DOC_TYPE]);
	});

	it("keeps the raw path segment when it is not valid percent-encoding", () => {
		// `%E0%A4%A` is a truncated UTF-8 sequence: decodeURIComponent throws.
		const raw = "bad%E0%A4%A";
		const xml = serviceGroup([
			`<smp:ServiceMetadataReference href="http://smp.example.eu/x/services/${raw}"/>`,
		]);
		expect(parseServiceGroupDocumentTypes(xml)).toEqual([raw]);
	});

	it.each([
		[
			"a ServiceGroup without a reference collection",
			`<?xml version="1.0"?><ServiceGroup xmlns="http://busdox.org/serviceMetadata/publishing/1.0/"><ParticipantIdentifier scheme="iso6523-actorid-upis">9925:BE0123456789</ParticipantIdentifier></ServiceGroup>`,
		],
		["non-XML garbage", "<html><body>502 Bad Gateway</body></html> not xml at all"],
		["an empty body", ""],
	])("returns [] for %s", (_label, xml) => {
		expect(parseServiceGroupDocumentTypes(xml)).toEqual([]);
	});
});

// Node's dns error codes: ENOTFOUND (NXDOMAIN) and ENODATA (name exists, no
// NAPTR) mean "not registered"; everything else means "couldn't check".
const dnsError = (code: string) => Object.assign(new Error(code), { code });

describe("isDnsNotFound", () => {
	it.each(["ENOTFOUND", "ENODATA"])("treats %s as not registered", (code) => {
		expect(isDnsNotFound(dnsError(code))).toBe(true);
	});

	it.each(["ENOTFOUND", "ENODATA"])(
		"treats a wrapped %s (via .cause) as not registered",
		(code) => {
			expect(
				isDnsNotFound(new Error("lookup failed", { cause: dnsError(code) })),
			).toBe(true);
		},
	);

	it.each(["ETIMEOUT", "EAI_AGAIN", "ESERVFAIL", "ECONNREFUSED"])(
		"treats %s as a transient error, not absence",
		(code) => {
			expect(isDnsNotFound(dnsError(code))).toBe(false);
		},
	);

	it("is false for non-error values", () => {
		expect(isDnsNotFound(null)).toBe(false);
		expect(isDnsNotFound("ENOTFOUND")).toBe(false);
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
			// Peppol BIS Self-Billing 3.0 credit note (spec customization id).
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0::2.1",
			"self-billing-credit-note",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Order-2::Order##urn:fdc:peppol.eu:poacc:trns:order:3::2.1",
			"order",
		],
		[
			// Peppol BIS Order Response (T76): must not be swallowed by "order".
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:OrderResponse-2::OrderResponse##urn:fdc:peppol.eu:poacc:trns:order_response:3::2.1",
			"order-response",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2::DespatchAdvice##urn:fdc:peppol.eu:poacc:trns:despatch_advice:3::2.1",
			"despatch-advice",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Catalogue-2::Catalogue##urn:fdc:peppol.eu:poacc:trns:catalogue:3::2.1",
			"catalogue",
		],
		[
			"busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Reminder-2::Reminder##urn:www.cenbii.eu:transaction:biitrns019:ver2.0::2.1",
			"reminder",
		],
		// SMPs differ in casing of the busdox id; classification is case-insensitive.
		[INVOICE_DOC_TYPE.toUpperCase(), "invoice"],
		["something-we-do-not-recognise", "other"],
	])("classifies %s", (docTypeId, expected) => {
		expect(classifyPeppolDocumentType(docTypeId)).toBe(expected);
	});
});
