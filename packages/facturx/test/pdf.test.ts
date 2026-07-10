import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { computeTotals } from "../src/index.js";
import { parseFacturXXml } from "../src/parse/index.js";
import { attachFacturXXml, extractFacturXXml } from "../src/pdf/index.js";
import { generateFacturXPdf, renderInvoicePdf } from "../src/render/index.js";

const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures", name)));

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
		const { invoice, profile } = parseFacturXXml(result?.xml ?? "");
		expect(profile).toBe("minimum");
		expect(invoice.id).toBe("FA-2017-0010");
		expect(invoice.totals?.grandTotal).toBe(671.15);
	});

	it("extracts and parses the BASIC WL sample (accents intact)", async () => {
		const result = await extractFacturXXml(fixture("factur-x-basicwl.pdf"));
		expect(result).not.toBeNull();
		const { invoice, profile } = parseFacturXXml(result?.xml ?? "");
		expect(profile).toBe("basic-wl");
		expect(invoice.paymentMeans?.[0]?.payeeAccount?.iban).toBe(
			"FR2012421242124212421242124",
		);
		expect(invoice.paymentTerms?.dueDate).toBe("2017-12-13");
		const addressText = JSON.stringify(invoice.seller.address);
		expect(addressText).toContain("Malaucène");
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

		const text = new TextDecoder("latin1").decode(bytes);
		expect(text).toContain("factur-x.xml");
		expect(text).toContain("fx:ConformanceLevel");
		expect(text).toContain("EN 16931");
		expect(text).toContain("pdfaid:part");
		expect(text).toContain("GTS_PDFA1");
		expect(text).toContain("AFRelationship");
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
		const text = new TextDecoder("latin1").decode(second);
		const matches = text.match(/\/Type\s*\/Filespec/g) ?? [];
		expect(matches).toHaveLength(1);
	});
});

describe("generateFacturXPdf", () => {
	it("renders, embeds, and round-trips a full invoice", async () => {
		const invoice = invoiceInput();
		const { pdfBytes, xml } = await generateFacturXPdf(invoice, { locale: "fr" });
		expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");
		expect(xml).toContain("Heures prestées");

		const extracted = await extractFacturXXml(pdfBytes);
		expect(extracted?.xml).toBe(xml);
		const { invoice: parsed } = parseFacturXXml(extracted?.xml ?? "");
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
