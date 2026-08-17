import {
	AFRelationship,
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRawStream,
	PDFRef,
	PDFString,
	decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { type FacturXProfile, PROFILE_CONFORMANCE_LEVELS } from "../profiles.js";
import { SRGB_ICC_BASE64 } from "./icc.js";
import { buildXmpMetadata } from "./xmp.js";

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

const decodeBase64 = (base64: string): Uint8Array =>
	Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

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

/** Remove an existing embedded file (name-tree pair and /AF entry). */
const removeEmbeddedFile = (pdfDoc: PDFDocument, filename: string): void => {
	const target = filename.toLowerCase();
	const catalog = pdfDoc.catalog;
	const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
	const embeddedFiles = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
	const pairs = embeddedFiles?.lookupMaybe(PDFName.of("Names"), PDFArray);
	const matchesTarget = (ref: unknown): boolean => {
		if (!(ref instanceof PDFRef)) return false;
		const dict = pdfDoc.context.lookupMaybe(ref, PDFDict);
		if (!dict) return false;
		const name =
			decodePdfText(dict.lookup(PDFName.of("UF"))) ??
			decodePdfText(dict.lookup(PDFName.of("F")));
		return name?.trim().toLowerCase() === target;
	};
	// Filespecs to drop. Collected first and deleted last: deleting one before
	// the /AF array is filtered would make its entry unresolvable, so it would
	// survive as a dangling reference to a removed object.
	const doomed: PDFRef[] = [];
	if (pairs) {
		const kept: Parameters<PDFArray["push"]>[0][] = [];
		for (let index = 0; index + 1 < pairs.size(); index += 2) {
			const key = pairs.get(index);
			const value = pairs.get(index + 1);
			const keyName = decodePdfText(
				key instanceof PDFRef ? pdfDoc.context.lookup(key) : key,
			);
			if (keyName?.trim().toLowerCase() === target || matchesTarget(value)) {
				if (value instanceof PDFRef) doomed.push(value);
				continue;
			}
			kept.push(key, value);
		}
		if (kept.length !== pairs.size()) {
			const replacement = pdfDoc.context.obj([]);
			for (const entry of kept) replacement.push(entry);
			embeddedFiles?.set(PDFName.of("Names"), replacement);
		}
	}
	const afArray = catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
	if (afArray) {
		const replacement = pdfDoc.context.obj([]);
		for (let index = 0; index < afArray.size(); index += 1) {
			const entry = afArray.get(index);
			if (matchesTarget(entry)) continue;
			if (
				entry instanceof PDFRef &&
				doomed.some((ref) => ref.tag === entry.tag)
			) {
				continue;
			}
			replacement.push(entry);
		}
		if (replacement.size() !== afArray.size()) {
			catalog.set(PDFName.of("AF"), replacement);
		}
	}
	// Fully delete the replaced filespecs (and their embedded streams) so stale
	// copies can't be found by attachment scans later.
	for (const ref of doomed) {
		const dict = pdfDoc.context.lookupMaybe(ref, PDFDict);
		const embedded = dict?.lookupMaybe(PDFName.of("EF"), PDFDict);
		for (const key of ["F", "UF"]) {
			const streamRef = embedded?.get(PDFName.of(key));
			if (streamRef instanceof PDFRef) pdfDoc.context.delete(streamRef);
		}
		pdfDoc.context.delete(ref);
	}
};

const ensureOutputIntent = (pdfDoc: PDFDocument): void => {
	const existing = pdfDoc.catalog.lookupMaybe(PDFName.of("OutputIntents"), PDFArray);
	if (existing && existing.size() > 0) return;
	const iccBytes = decodeBase64(SRGB_ICC_BASE64);
	const iccStream = pdfDoc.context.flateStream(iccBytes, { N: 3 });
	const iccRef = pdfDoc.context.register(iccStream);
	const outputIntent = pdfDoc.context.obj({
		Type: "OutputIntent",
		S: "GTS_PDFA1",
		OutputConditionIdentifier: PDFString.of("sRGB"),
		Info: PDFString.of("sRGB v2"),
		DestOutputProfile: iccRef,
	});
	const intentRef = pdfDoc.context.register(outputIntent);
	pdfDoc.catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([intentRef]));
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
	/** Seed for the PDF trailer /ID and XMP packet id. Default the filename. */
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
 * sRGB output intent (when none exists) and the Factur-X XMP metadata.
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
	const context = pdfDoc.context;

	removeEmbeddedFile(pdfDoc, filename);

	// The embedded file stream, flate-compressed, with its Params dict.
	const xmlBytes = new TextEncoder().encode(options.xml);
	const embeddedStream = context.flateStream(xmlBytes, {
		Type: "EmbeddedFile",
		Subtype: "text/xml",
		Params: {
			Size: xmlBytes.length,
			CreationDate: PDFString.fromDate(date),
			ModDate: PDFString.fromDate(date),
		},
	});
	const streamRef = context.register(embeddedStream);

	// Filespec — EF carries both F and UF (the Factur-X spec requires UF).
	const afRelationship =
		profile === "minimum" || profile === "basic-wl"
			? AFRelationship.Data
			: AFRelationship.Alternative;
	const fileSpec = context.obj({
		Type: "Filespec",
		F: PDFString.of(filename),
		UF: PDFHexString.fromText(filename),
		EF: { F: streamRef, UF: streamRef },
		Desc: PDFString.of("Factur-X invoice"),
		AFRelationship: afRelationship,
	});
	const fileSpecRef = context.register(fileSpec);

	// /Names → /EmbeddedFiles → /Names name-tree leaf.
	const catalog = pdfDoc.catalog;
	let names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
	if (!names) {
		names = context.obj({});
		catalog.set(PDFName.of("Names"), names);
	}
	let embeddedFiles = names.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
	if (!embeddedFiles) {
		embeddedFiles = context.obj({});
		names.set(PDFName.of("EmbeddedFiles"), embeddedFiles);
	}
	let pairs = embeddedFiles.lookupMaybe(PDFName.of("Names"), PDFArray);
	if (!pairs) {
		pairs = context.obj([]);
		embeddedFiles.set(PDFName.of("Names"), pairs);
	}
	pairs.push(PDFHexString.fromText(filename));
	pairs.push(fileSpecRef);

	// /AF associated-files array on the catalog (PDF/A-3 requirement).
	let afArray = catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
	if (!afArray) {
		afArray = context.obj([]);
		catalog.set(PDFName.of("AF"), afArray);
	}
	afArray.push(fileSpecRef);

	ensureOutputIntent(pdfDoc);

	// XMP metadata (must be an uncompressed stream per PDF/A).
	const xmp = buildXmpMetadata({
		documentId,
		title,
		author,
		creatorTool,
		producer,
		createDate: date,
		modifyDate: date,
		documentFileName: filename,
		conformanceLevel: PROFILE_CONFORMANCE_LEVELS[profile],
	});
	const xmpBytes = new TextEncoder().encode(xmp);
	const metadataStream = context.stream(xmpBytes, {
		Type: "Metadata",
		Subtype: "XML",
		Length: xmpBytes.length,
	});
	catalog.set(PDFName.of("Metadata"), context.register(metadataStream));

	// Document information dictionary, mirrored from the XMP.
	pdfDoc.setTitle(title);
	if (author) pdfDoc.setAuthor(author);
	pdfDoc.setProducer(producer);
	pdfDoc.setCreator(creatorTool);
	pdfDoc.setCreationDate(date);
	pdfDoc.setModificationDate(date);

	// A permanent trailer /ID (PDF/A requires one).
	context.trailerInfo.ID = context.obj([
		PDFString.of(documentId),
		PDFString.of(documentId),
	]);

	return pdfDoc.save({ useObjectStreams: false });
};
