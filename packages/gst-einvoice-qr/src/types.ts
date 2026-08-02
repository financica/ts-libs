/** Date in `YYYY-MM-DD` form. */
export type IsoDate = string;

/**
 * Local date-time in `YYYY-MM-DDTHH:mm:ss` form, with **no timezone offset**.
 *
 * The IRP stamps `IrnDt` in Indian Standard Time and does not say so in the
 * value. Appending `Z` or `+05:30` here would be inventing information, so the
 * value stays naive and the caller decides how to interpret it.
 */
export type NaiveDateTime = string;

/**
 * Document type as reported in the QR payload.
 *
 * `INV` invoice, `CRN` credit note, `DBN` debit note. Unknown values are passed
 * through verbatim rather than rejected: the code list is the IRP's to change.
 */
export type GstDocumentType = "INV" | "CRN" | "DBN" | (string & {});

/**
 * The value the IRP uses in place of a GSTIN when the counterparty is not
 * registered under GST (unregistered person, or an export ship-to).
 */
export const UNREGISTERED_PERSON = "URP";

/** The invoice header the IRP attests to in the signed QR. */
export interface GstEInvoiceQr {
	/** Supplier GSTIN. Always a real GSTIN: the supplier is registered by definition. */
	sellerGstin: string;
	/** Buyer GSTIN, or `"URP"` when the buyer is unregistered or the supply is an export. */
	buyerGstin: string;
	/** Supplier's own document number. */
	documentNumber: string;
	documentType: GstDocumentType;
	/** Normalised from the payload's `DD/MM/YYYY`. */
	documentDate: IsoDate;
	/** Invoice total including tax, in INR. */
	totalInvoiceValue: number;
	/** Number of line items on the document. */
	itemCount: number;
	/** HSN/SAC code of the highest-value line. */
	mainHsnCode: string;
	/** 64-character lowercase hex hash minted by the IRP. */
	irn: string;
	/** When the IRN was generated. Absent from some IRPs' payloads. */
	irnDate: NaiveDateTime | null;
}

/** JOSE header of the compact JWS carried by the QR. */
export interface SignedQrHeader {
	/** Signing algorithm. The IRPs use `RS256`. */
	alg: string;
	/** Signer certificate SHA-1 thumbprint, uppercase hex. */
	kid: string | null;
	/** Signer certificate SHA-1 thumbprint, base64url. Same bytes as {@link kid}. */
	x5t: string | null;
	typ: string | null;
}

/** A structurally valid signed QR, before any signature check. */
export interface DecodedSignedQr {
	header: SignedQrHeader;
	/** The `iss` claim. `"NIC"` for the government IRPs; private IRPs use their own. */
	issuer: string | null;
	invoice: GstEInvoiceQr;
	/** The `data` claim verbatim (an escaped JSON string) and the parsed payload. */
	raw: {
		data: string;
		header: Record<string, unknown>;
		payload: Record<string, unknown>;
	};
	/** `<header>.<payload>`, the bytes the signature covers. */
	signingInput: string;
	signature: Uint8Array;
}

/** A certificate that may have signed a QR. */
export interface SignerCertificate {
	/** Caller-supplied name, used in results and errors. */
	label: string;
	/** SHA-1 thumbprint, uppercase hex, matched against the header `kid`. */
	thumbprintHex: string;
	/** SHA-1 thumbprint, base64url, matched against the header `x5t`. */
	thumbprintBase64Url: string;
	/** PEM-encoded public key extracted from the certificate. */
	publicKeyPem: string;
	/** `notBefore` / `notAfter` from the certificate, ISO 8601. */
	validFrom: string;
	validTo: string;
}

/**
 * Outcome of checking the signature. Deliberately a union rather than a
 * boolean: "we hold no key for this signer" and "this signature is forged" are
 * very different facts and must not collapse into one `false`.
 */
export type SignatureVerification =
	| { status: "verified"; certificate: SignerCertificate }
	| { status: "invalid_signature"; certificate: SignerCertificate }
	/** The header named a signer we were given no certificate for. */
	| { status: "unknown_key"; kid: string | null; x5t: string | null }
	/** No certificates were supplied at all, so nothing could be checked. */
	| { status: "not_checked" }
	| { status: "unsupported_algorithm"; alg: string }
	/** The certificate that signed it was outside its validity window at `at`. */
	| { status: "certificate_expired"; certificate: SignerCertificate; at: string };

export interface VerifiedSignedQr extends DecodedSignedQr {
	signatureVerification: SignatureVerification;
	/** True only when a supplied certificate cryptographically verified the QR. */
	verified: boolean;
}
