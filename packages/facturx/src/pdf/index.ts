import {
	AFRelationship,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRawStream,
	PDFString,
	decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { type FacturXProfile, PROFILE_CONFORMANCE_LEVELS } from "../profiles.js";
import { buildFacturXXmpExtensions } from "./xmp.js";

/**
 * PDF side of the hybrid document: extract the embedded CII XML from an
 * existing Factur-X / ZUGFeRD / XRechnung PDF, and attach generated XML to a
 * PDF while converting it to PDF/A-3B (XMP metadata, sRGB output intent,
 * AF relationship).
 */

export const FACTUR_X_FILENAME = "factur-x.xml";

/**
 * Canonical embedded-XML filenames, in lookup order: factur-x.xml
 * (Factur-X / ZUGFeRD 2.x), xrechnung.xml (German XRechnung CII), and the
 * legacy ZUGFeRD 1.0 name.
 */
export const EMBEDDED_XML_FILENAMES = [
	FACTUR_X_FILENAME,
	"xrechnung.xml",
	"zugferd-invoice.xml",
] as const;

const decodePdfText = (value: unknown): string | undefined => {
	if (value instanceof PDFString || value instanceof PDFHexString) {
		try {
			return value.decodeText();
		} catch {
			return undefined;
		}
	}
	return undefined;
};

export interface ExtractedEmbeddedXml {
	xml: string;
	/** The attachment filename that matched (e.g. "factur-x.xml"). */
	filename: string;
}

/**
 * Extract the embedded invoice XML from a hybrid PDF. Scans every file
 * attachment (Filespec dictionary) for the canonical EN 16931 filenames,
 * case-insensitively, and returns the XML verbatim. Returns null when the
 * PDF has no recognized attachment. Throws when the bytes are not a
 * loadable PDF.
 */
export const extractFacturXXml = async (
	pdfBytes: Uint8Array,
): Promise<ExtractedEmbeddedXml | null> => {
	const pdfDoc = await PDFDocument.load(pdfBytes, {
		ignoreEncryption: true,
		updateMetadata: false,
	});
	const candidates = new Map<string, { filename: string; stream: PDFRawStream }>();
	for (const [, object] of pdfDoc.context.enumerateIndirectObjects()) {
		if (!(object instanceof PDFDict)) continue;
		const embedded = object.lookupMaybe(PDFName.of("EF"), PDFDict);
		if (!embedded) continue;
		const filename =
			decodePdfText(object.lookup(PDFName.of("UF"))) ??
			decodePdfText(object.lookup(PDFName.of("F")));
		if (!filename) continue;
		const normalized = filename.trim().toLowerCase();
		if (!(EMBEDDED_XML_FILENAMES as readonly string[]).includes(normalized)) {
			continue;
		}
		const streamObject =
			embedded.lookup(PDFName.of("F")) ?? embedded.lookup(PDFName.of("UF"));
		const stream = streamObject instanceof PDFRawStream ? streamObject : undefined;
		if (!stream || candidates.has(normalized)) continue;
		candidates.set(normalized, { filename: filename.trim(), stream });
	}
	for (const name of EMBEDDED_XML_FILENAMES) {
		const candidate = candidates.get(name);
		if (!candidate) continue;
		try {
			const bytes = decodePDFRawStream(candidate.stream).decode();
			const xml = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
			return { xml, filename: candidate.filename };
		} catch {
			continue;
		}
	}
	return null;
};

export interface AttachFacturXXmlOptions {
	/** Base PDF: raw bytes or an already-open pdf-lib document. */
	pdf: Uint8Array | PDFDocument;
	/** The CII invoice XML to embed. */
	xml: string;
	/** Drives the AF relationship and XMP conformance level. Default en16931. */
	profile?: FacturXProfile;
	/** Attachment filename; default "factur-x.xml". */
	filename?: string;
	/** Seed for the PDF trailer /ID and xmpMM:DocumentID. Default the filename. */
	documentId?: string;
	title?: string;
	author?: string;
	creatorTool?: string;
	producer?: string;
	/** Creation/modification timestamp; defaults to now. */
	date?: Date;
}

/**
 * Embed Factur-X XML into a PDF and apply the PDF/A-3B furniture: the
 * Filespec with the profile's AF relationship, the /AF catalog entry, an
 * sRGB output intent and the Factur-X XMP metadata.
 *
 * Note: a plain PDF is not made fully PDF/A conformant by this — fonts the
 * source PDF didn't embed stay unembedded. PDFs produced by
 * `renderInvoicePdf` embed everything and yield conformant output.
 */
export const attachFacturXXml = async (
	options: AttachFacturXXmlOptions,
): Promise<Uint8Array> => {
	const pdfDoc =
		options.pdf instanceof PDFDocument
			? options.pdf
			: await PDFDocument.load(options.pdf, {
					ignoreEncryption: true,
					updateMetadata: false,
				});
	const profile = options.profile ?? "en16931";
	const filename = options.filename ?? FACTUR_X_FILENAME;
	const date = options.date ?? new Date();
	const documentId = options.documentId ?? filename;
	const title = options.title ?? "Invoice";
	const author = options.author ?? "";
	const creatorTool = options.creatorTool ?? "@financica/facturx";
	const producer = options.producer ?? "@financica/facturx";

	// Replace rather than accumulate, so re-attaching to a document that already
	// carries an invoice leaves exactly one.
	pdfDoc.detach(filename);
	await pdfDoc.attach(new TextEncoder().encode(options.xml), filename, {
		mimeType: "text/xml",
		description: "Factur-X invoice",
		// Spec §6.2.2: the profiles that carry no invoice lines are Data, the
		// rest are a genuine alternative rendering of the visible document.
		afRelationship:
			profile === "minimum" || profile === "basic-wl"
				? AFRelationship.Data
				: AFRelationship.Alternative,
		creationDate: date,
		modificationDate: date,
	});

	// The Info dictionary is what convertToPDFA mirrors into the XMP, so it has
	// to be populated first.
	pdfDoc.setTitle(title);
	if (author) pdfDoc.setAuthor(author);
	pdfDoc.setProducer(producer);
	pdfDoc.setCreator(creatorTool);
	pdfDoc.setCreationDate(date);
	pdfDoc.setModificationDate(date);

	// PDF/A requires a permanent trailer /ID. convertToPDFA generates a random
	// one only when none is set, so seeding it here keeps output reproducible.
	pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([
		PDFString.of(documentId),
		PDFString.of(documentId),
	]);

	pdfDoc.convertToPDFA({
		conformance: "3B",
		extensions: buildFacturXXmpExtensions({
			documentId,
			documentFileName: filename,
			conformanceLevel: PROFILE_CONFORMANCE_LEVELS[profile],
		}),
	});

	return pdfDoc.save({ useObjectStreams: false });
};
