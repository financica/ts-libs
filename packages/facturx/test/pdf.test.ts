import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRawStream,
	PDFString,
	decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { XMLParser } from "fast-xml-parser";
import { PROFILE_CONFORMANCE_LEVELS, computeTotals } from "../src/index.js";
import { parseFacturXXml } from "../src/parse/index.js";
import {
	FACTUR_X_FILENAME,
	attachFacturXXml,
	extractFacturXXml,
} from "../src/pdf/index.js";
import { generateFacturXPdf, renderInvoicePdf } from "../src/render/index.js";

const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures", name)));

/** Filenames in the catalog Names → EmbeddedFiles → Names name tree. */
const embeddedFileNames = (doc: PDFDocument): string[] => {
	const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
	const embedded = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
	const pairs = embedded?.lookupMaybe(PDFName.of("Names"), PDFArray);
	const result: string[] = [];
	if (!pairs) return result;
	for (let index = 0; index + 1 < pairs.size(); index += 2) {
		const key = pairs.lookup(index);
		if (key instanceof PDFString || key instanceof PDFHexString) {
			result.push(key.decodeText());
		}
	}
	return result;
};

/** Merge every rdf:Description of a parsed XMP packet into one map. */
const flattenDescriptions = (xmp: Record<string, unknown>): Record<string, unknown> => {
	const rdf = (xmp["xmpmeta"] as Record<string, unknown>)["RDF"] as Record<
		string,
		unknown
	>;
	const descriptions = rdf["Description"] as Record<string, unknown>[];
	return Object.assign({}, ...descriptions) as Record<string, unknown>;
};

/** A one-page PDF with `xml` attached under `filename` (no PDF/A furniture). */
const pdfWithAttachment = async (
	filename: string,
	xml: string | Uint8Array,
): Promise<Uint8Array> => {
	const doc = await PDFDocument.create();
	doc.addPage();
	await doc.attach(
		typeof xml === "string" ? new TextEncoder().encode(xml) : xml,
		filename,
		{
			mimeType: "text/xml",
		},
	);
	return doc.save();
};

const invoiceInput = () =>
	computeTotals({
		id: "INV-2026-042",
		typeCode: "380",
		issueDate: "2026-06-01",
		currency: "EUR",
		seller: {
			name: "Financica Test SARL",
			address: {
				line1: "1 Rue de la Paix",
				postcode: "75002",
				city: "Paris",
				country: "FR",
			},
			vatId: "FR11999999998",
		},
		buyer: { name: "Prime Tech SARL", address: { country: "FR" } },
		paymentMeans: [
			{
				typeCode: "58",
				payeeAccount: { iban: "FR7630006000011234567890189", bic: "AGRIFRPP" },
			},
		],
		paymentTerms: { dueDate: "2026-07-01" },
		lines: [
			{
				id: "1",
				product: { name: "Heures prestées" },
				netPrice: { amount: 100 },
				quantity: 8,
				unitCode: "HUR",
				tax: { categoryCode: "S", rateApplicablePercent: 20 },
			},
		],
	});

describe("extractFacturXXml", () => {
	it("extracts factur-x.xml from the official MINIMUM sample", async () => {
		const result = await extractFacturXXml(fixture("factur-x-minimum.pdf"));
		expect(result).not.toBeNull();
		expect(result?.filename.toLowerCase()).toBe("factur-x.xml");
		expect(result?.xml).toContain("CrossIndustryInvoice");
		const { invoice, profile } = parseFacturXXml(result?.xml ?? "")!;
		expect(profile).toBe("minimum");
		expect(invoice.id).toBe("FA-2017-0010");
		expect(invoice.totals?.grandTotal).toBe(671.15);
	});

	it("extracts and parses the BASIC WL sample (accents intact)", async () => {
		const result = await extractFacturXXml(fixture("factur-x-basicwl.pdf"));
		expect(result).not.toBeNull();
		const { invoice, profile } = parseFacturXXml(result?.xml ?? "")!;
		expect(profile).toBe("basic-wl");
		expect(invoice.paymentMeans?.[0]?.payeeAccount?.iban).toBe(
			"FR2012421242124212421242124",
		);
		expect(invoice.paymentTerms?.dueDate).toBe("2017-12-13");
		// Captured from factur-x-basicwl.pdf (official Factur-X sample).
		expect(invoice.seller.address?.city).toBe("Malaucène");
	});

	it.each([
		["xrechnung.xml", "<a>xr</a>"],
		["zugferd-invoice.xml", "<a>zf</a>"],
		["FACTUR-X.XML", "<a>upper</a>"],
	])("recognizes %s as the embedded invoice", async (filename, xml) => {
		const bytes = await pdfWithAttachment(filename, xml);
		const extracted = await extractFacturXXml(bytes);
		expect(extracted).toEqual({ xml, filename });
	});

	it("prefers factur-x.xml over the alternate names when several are attached", async () => {
		const doc = await PDFDocument.create();
		doc.addPage();
		const attach = (name: string, xml: string) =>
			doc.attach(new TextEncoder().encode(xml), name, { mimeType: "text/xml" });
		await attach("zugferd-invoice.xml", "<a>zf</a>");
		await attach("xrechnung.xml", "<a>xr</a>");
		await attach("factur-x.xml", "<a>fx</a>");
		const extracted = await extractFacturXXml(await doc.save());
		expect(extracted?.filename).toBe("factur-x.xml");
		expect(extracted?.xml).toBe("<a>fx</a>");
	});

	it("strips a UTF-8 BOM from the extracted XML", async () => {
		const xml = "<a>bom</a>";
		const bytes = await pdfWithAttachment(
			"factur-x.xml",
			new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(xml)]),
		);
		expect((await extractFacturXXml(bytes))?.xml).toBe(xml);
	});

	it("ignores attachments with unrelated names", async () => {
		const bytes = await pdfWithAttachment("invoice.xml", "<a>x</a>");
		expect(await extractFacturXXml(bytes)).toBeNull();
	});

	it("returns null for a PDF without attachments", async () => {
		const pdfDoc = await PDFDocument.create();
		pdfDoc.addPage();
		const bytes = await pdfDoc.save();
		expect(await extractFacturXXml(bytes)).toBeNull();
	});

	it("rejects non-PDF bytes", async () => {
		await expect(
			extractFacturXXml(new TextEncoder().encode("not a pdf")),
		).rejects.toThrow();
	});
});

describe("attachFacturXXml", () => {
	it("embeds XML into an existing PDF and round-trips", async () => {
		const base = await PDFDocument.create();
		base.addPage();
		const xml = `<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"></rsm:CrossIndustryInvoice>`;
		const bytes = await attachFacturXXml({
			pdf: await base.save(),
			xml,
			profile: "en16931",
			documentId: "TEST-1",
			title: "Invoice TEST-1",
			author: "Test Seller",
		});
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
		const extracted = await extractFacturXXml(bytes);
		expect(extracted?.xml).toBe(xml);

		// PDF/A-3 furniture, checked structurally on the saved document.
		const doc = await PDFDocument.load(bytes, { updateMetadata: false });
		const catalog = doc.catalog;

		// XMP metadata (Factur-X spec §6.2: fx extension schema + pdfaid).
		const metadata = catalog.lookup(PDFName.of("Metadata"));
		expect(metadata).toBeInstanceOf(PDFRawStream);
		const xmp = new XMLParser({
			removeNSPrefix: true,
			ignoreAttributes: false,
		}).parse(
			new TextDecoder().decode(
				decodePDFRawStream(metadata as PDFRawStream).decode(),
			),
		) as Record<string, unknown>;
		// The packet header id is the fixed marker from the XMP spec, not the
		// document's own identity — that goes in xmpMM:DocumentID. Both reference
		// filings in test/fixtures carry this same constant.
		const packet = new TextDecoder().decode(
			decodePDFRawStream(metadata as PDFRawStream).decode(),
		);
		expect(packet).toContain(
			'<?xpacket begin="\u{FEFF}" id="W5M0MpCehiHzreSzNTczkc9d"?>',
		);

		const descriptions = flattenDescriptions(xmp);
		expect(descriptions["DocumentID"]).toBe("TEST-1");
		expect(descriptions["ConformanceLevel"]).toBe(
			PROFILE_CONFORMANCE_LEVELS.en16931,
		);
		expect(descriptions["DocumentFileName"]).toBe(FACTUR_X_FILENAME);
		expect(descriptions["DocumentType"]).toBe("INVOICE");
		expect(String(descriptions["part"])).toBe("3");
		expect(descriptions["conformance"]).toBe("B");

		// /AF → filespec with a Factur-X AF relationship (spec §6.2.2 allows
		// Data / Alternative / Source depending on the profile).
		const af = catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
		expect(af?.size()).toBe(1);
		const fileSpec = af?.lookup(0, PDFDict);
		expect(fileSpec?.lookup(PDFName.of("Type"))).toBe(PDFName.of("Filespec"));
		expect(["Data", "Alternative", "Source"]).toContain(
			(
				fileSpec?.lookup(PDFName.of("AFRelationship")) as PDFName | undefined
			)?.decodeText(),
		);
		expect(embeddedFileNames(doc)).toEqual([FACTUR_X_FILENAME]);

		// Output intent present (PDF/A requires a device-independent one).
		const intents = catalog.lookupMaybe(PDFName.of("OutputIntents"), PDFArray);
		expect(intents?.size()).toBeGreaterThanOrEqual(1);
		expect(intents?.lookup(0, PDFDict).lookup(PDFName.of("S"))).toBe(
			PDFName.of("GTS_PDFA1"),
		);
	});

	it("replaces an existing factur-x.xml instead of duplicating it", async () => {
		const base = await PDFDocument.create();
		base.addPage();
		const first = await attachFacturXXml({
			pdf: await base.save(),
			xml: "<a>first</a>",
		});
		const second = await attachFacturXXml({ pdf: first, xml: "<a>second</a>" });
		const extracted = await extractFacturXXml(second);
		expect(extracted?.xml).toBe("<a>second</a>");
		const doc = await PDFDocument.load(second, { updateMetadata: false });
		expect(embeddedFileNames(doc)).toEqual([FACTUR_X_FILENAME]);
		expect(doc.catalog.lookupMaybe(PDFName.of("AF"), PDFArray)?.size()).toBe(1);
	});
});

describe("generateFacturXPdf", () => {
	it("renders, embeds, and round-trips a full invoice", async () => {
		const invoice = invoiceInput();
		const { pdfBytes, xml } = await generateFacturXPdf(invoice, { locale: "fr" });
		expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");

		const extracted = await extractFacturXXml(pdfBytes);
		expect(extracted?.xml).toBe(xml);
		const { invoice: parsed } = parseFacturXXml(extracted?.xml ?? "")!;
		expect(parsed.id).toBe("INV-2026-042");
		expect(parsed.totals?.grandTotal).toBe(960);
		expect(parsed.lines?.[0]?.product.name).toBe("Heures prestées");

		// The rendered page is a real document, not a blank sheet.
		const rendered = await PDFDocument.load(pdfBytes);
		expect(rendered.getPageCount()).toBeGreaterThanOrEqual(1);
	});

	it("embeds into a caller-provided PDF", async () => {
		const base = await PDFDocument.create();
		base.addPage();
		const { pdfBytes } = await generateFacturXPdf(invoiceInput(), {
			existingPdf: await base.save(),
		});
		const extracted = await extractFacturXXml(pdfBytes);
		expect(extracted).not.toBeNull();
	});

	it("paginates long invoices", async () => {
		const lines = Array.from({ length: 80 }, (_, index) => ({
			id: String(index + 1),
			product: {
				name: `Prestation récurrente numéro ${index + 1} avec un intitulé plutôt long pour forcer le retour à la ligne`,
			},
			netPrice: { amount: 10 },
			quantity: 1,
			unitCode: "C62",
			tax: { categoryCode: "S", rateApplicablePercent: 20 },
		}));
		const invoice = computeTotals({ ...invoiceInput(), lines });
		const pdfDoc = await renderInvoicePdf(invoice, { locale: "fr" });
		expect(pdfDoc.getPageCount()).toBeGreaterThan(1);
	});
});
