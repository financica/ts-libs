import type { UblAttachment, UblDocument } from "./ubl/types";

/**
 * Build a UBL embedded-document attachment (BG-24) from raw bytes — e.g. the
 * rendered PDF of the invoice. Emitted as a `cac:AdditionalDocumentReference`
 * with an inline base64 `cbc:EmbeddedDocumentBinaryObject`.
 */
export const buildPdfAttachment = (params: {
	filename: string;
	bytes: Uint8Array;
	/** Document reference ID (BT-122). Defaults to the filename. */
	id?: string;
}): UblAttachment => ({
	id: params.id ?? params.filename,
	filename: params.filename,
	mimeCode: "application/pdf",
	base64: Buffer.from(params.bytes).toString("base64"),
});

/**
 * Replace each attachment's base64 payload with `[omitted]` plus a length, so a
 * {@link UblDocument} is safe to log or persist for audit.
 */
export const sanitizeUblDocumentForAudit = (doc: UblDocument): UblDocument => {
	if (doc.attachments.length === 0) return doc;
	return {
		...doc,
		attachments: doc.attachments.map((attachment) => ({
			...attachment,
			base64: `[omitted ${attachment.base64.length} chars]`,
		})),
	};
};
