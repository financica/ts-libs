import {
	SCRADA_ATTACHMENT_FILE_TYPE_INVOICE,
	type ScradaInvoiceAttachment,
} from "@financica/scrada-client";

/** Build a Scrada PDF attachment payload from raw bytes. */
export const buildPdfAttachment = (params: {
	filename: string;
	bytes: Uint8Array;
	externalReference?: string;
}): ScradaInvoiceAttachment => ({
	filename: params.filename,
	fileType: SCRADA_ATTACHMENT_FILE_TYPE_INVOICE,
	mimeType: "application/pdf",
	base64Data: Buffer.from(params.bytes).toString("base64"),
	externalReference: params.externalReference,
});

/**
 * Replace the `base64Data` of every attachment with `[omitted]` plus a length
 * field, so the payload is safe to log or persist for audit.
 */
export const sanitizeScradaPayloadForAudit = <TPayload extends Record<string, unknown>>(
	payload: TPayload,
): TPayload => {
	if (!Array.isArray(payload.attachments)) return payload;

	return {
		...payload,
		attachments: payload.attachments.map((attachment) => {
			if (
				!attachment ||
				typeof attachment !== "object" ||
				Array.isArray(attachment)
			) {
				return attachment;
			}
			const record = attachment as Record<string, unknown>;
			const base64Data =
				typeof record.base64Data === "string" ? record.base64Data : null;
			if (!base64Data) return attachment;
			return {
				...record,
				base64Data: "[omitted]",
				base64Length: base64Data.length,
			};
		}),
	} as TPayload;
};
