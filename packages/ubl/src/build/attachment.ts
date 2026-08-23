import type { UblAttachment, UblInvoice } from "../types";

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
	base64Content: Buffer.from(params.bytes).toString("base64"),
});

/**
 * Replace each attachment's base64 payload with `[omitted]` plus a length, so a
 * {@link UblInvoice} is safe to log or persist for audit.
 */
export const sanitizeUblDocumentForAudit = (doc: UblInvoice): UblInvoice => {
	if (!doc.attachments?.length) return doc;
	return {
		...doc,
		attachments: doc.attachments.map((attachment) =>
			attachment.base64Content === undefined
				? attachment
				: {
						...attachment,
						base64Content: `[omitted ${attachment.base64Content.length} chars]`,
					},
		),
	};
};
