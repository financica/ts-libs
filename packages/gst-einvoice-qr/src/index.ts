/**
 * Public entry point for @financica/gst-einvoice-qr.
 *
 * Decode, cryptographically verify and reconcile the signed QR code printed on
 * Indian GST e-invoices. Zero dependencies; signature checking uses
 * `node:crypto`.
 *
 * The QR is a compact JWS (RS256) minted by the Invoice Registration Portal
 * that attests to ten invoice header fields. It is *not* an embedded document
 * like Factur-X: you cannot reconstruct the invoice from it, only confirm that
 * the IRP saw those ten values.
 */

export { loadSignerCertificate, selectCertificate } from "./certificates.js";
export {
	CertificateError,
	DynamicB2cQrError,
	GstQrError,
	GstQrParseError,
	GstQrPayloadError,
} from "./errors.js";
export {
	gstinCheckCharacter,
	isSameLegalEntity,
	isUnregisteredPerson,
	isValidGstin,
	parseGstin,
} from "./gstin.js";
export type { ParsedGstin } from "./gstin.js";
export { decodeCompactJws, decodeBase64Url, encodeBase64Url } from "./jws.js";
export type { CompactJws } from "./jws.js";
export { decodeSignedQr, verifySignedQr } from "./qr.js";
export type { VerifySignedQrOptions } from "./qr.js";
export { reconcileWithQr } from "./reconcile.js";
export type {
	ExtractedInvoiceFields,
	ReconcileCheck,
	ReconcileOptions,
	ReconcileResult,
	ReconcileStatus,
} from "./reconcile.js";
export { UNREGISTERED_PERSON } from "./types.js";
export type {
	DecodedSignedQr,
	GstDocumentType,
	GstEInvoiceQr,
	IsoDate,
	NaiveDateTime,
	SignatureVerification,
	SignedQrHeader,
	SignerCertificate,
	VerifiedSignedQr,
} from "./types.js";
