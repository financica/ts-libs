import { UblParseError } from "./errors.js";
import { parseUblInvoice } from "./parser.js";
import type { UblAttachment } from "./types.js";

/**
 * An embedded attachment extracted from a UBL document's
 * `AdditionalDocumentReference` entries, with its binary content still
 * base64-encoded. `sizeBytes` is the decoded size.
 */
export interface UblEmbeddedAttachment {
	id?: string | undefined;
	filename: string;
	mimeCode: string;
	sizeBytes: number;
	/** Zero-based position among the document's embedded attachments. */
	lineOrder: number;
	base64Content: string;
}

/** Decoded byte length of a base64 string, accounting for `=` padding. */
export const base64DecodedSize = (base64: string): number => {
	const sanitized = base64.replace(/\s+/g, "");
	if (!sanitized) return 0;
	const padding = sanitized.endsWith("==") ? 2 : sanitized.endsWith("=") ? 1 : 0;
	return Math.floor((sanitized.length * 3) / 4) - padding;
};

/**
 * Extract the embedded attachments (typically the human-readable PDF) from a
 * UBL invoice or credit note XML. Attachments referenced only by external URI
 * (no `EmbeddedDocumentBinaryObject`) are skipped; use {@link parseUblInvoice}
 * directly when those matter.
 *
 * @throws {UblParseError} when the XML is malformed or not a UBL invoice.
 */
export const extractUblEmbeddedAttachments = (xml: string): UblEmbeddedAttachment[] => {
	const parsed = parseUblInvoice(xml);
	if (!parsed) throw new UblParseError("Document is not a UBL Invoice or CreditNote");
	if (!parsed.attachments || parsed.attachments.length === 0) return [];

	return parsed.attachments
		.map((attachment, index): UblEmbeddedAttachment | null => {
			const base64Content = attachment.base64Content?.trim();
			if (!base64Content) return null;
			return {
				id: attachment.id,
				filename: attachment.filename ?? `attachment-${index + 1}`,
				mimeCode: attachment.mimeCode ?? "application/octet-stream",
				sizeBytes: base64DecodedSize(base64Content),
				lineOrder: index,
				base64Content,
			};
		})
		.filter((entry): entry is UblEmbeddedAttachment => entry !== null);
};

/**
 * Whether an attachment looks like a PDF, by MIME type first and filename
 * extension as a fallback.
 */
export const isPdfLikeAttachment = (
	attachment: Pick<UblAttachment, "filename" | "mimeCode">,
): boolean => {
	const mimeCode = attachment.mimeCode?.toLowerCase() ?? "";
	if (mimeCode === "application/pdf" || mimeCode.endsWith("/pdf")) return true;
	return attachment.filename?.toLowerCase().endsWith(".pdf") ?? false;
};
