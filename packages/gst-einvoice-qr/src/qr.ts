import { createVerify } from "node:crypto";
import { selectCertificate } from "./certificates.js";
import { DynamicB2cQrError, GstQrPayloadError, GstQrParseError } from "./errors.js";
import { decodeCompactJws } from "./jws.js";
import type {
	DecodedSignedQr,
	GstEInvoiceQr,
	IsoDate,
	NaiveDateTime,
	SignatureVerification,
	SignedQrHeader,
	SignerCertificate,
	VerifiedSignedQr,
} from "./types.js";

const IRN_PATTERN = /^[0-9a-f]{64}$/i;
const DOC_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const IRN_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/;

const readString = (
	source: Record<string, unknown>,
	key: string,
	required: boolean,
): string | null => {
	const value = source[key];
	if (value === undefined || value === null || value === "") {
		if (required) {
			throw new GstQrPayloadError(`Signed QR payload is missing "${key}"`, key);
		}
		return null;
	}
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	throw new GstQrPayloadError(`Signed QR field "${key}" is not a string`, key);
};

const readNumber = (source: Record<string, unknown>, key: string): number => {
	const value = source[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	// Some IRPs and gateway wrappers quote the numeric fields.
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	throw new GstQrPayloadError(`Signed QR field "${key}" is not a number`, key);
};

/** `DD/MM/YYYY` (the IRP's format) to `YYYY-MM-DD`. */
const parseDocumentDate = (value: string): IsoDate => {
	const match = DOC_DATE_PATTERN.exec(value);
	if (!match) {
		throw new GstQrPayloadError(
			`Signed QR field "DocDt" is not DD/MM/YYYY: ${value}`,
			"DocDt",
		);
	}
	const [, day = "", month = "", year = ""] = match;
	const iso = `${year}-${month}-${day}`;
	// Reject 31/02 and friends: Date would silently roll them forward.
	const date = new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(iso)) {
		throw new GstQrPayloadError(
			`Signed QR field "DocDt" is not a real date: ${value}`,
			"DocDt",
		);
	}
	return iso;
};

/** `YYYY-MM-DD HH:mm:ss` to a naive ISO-shaped date-time. Kept timezone-free. */
const parseIrnDate = (value: string | null): NaiveDateTime | null => {
	if (value === null) return null;
	const match = IRN_DATE_PATTERN.exec(value);
	if (!match) {
		throw new GstQrPayloadError(
			`Signed QR field "IrnDt" is not YYYY-MM-DD HH:mm:ss: ${value}`,
			"IrnDt",
		);
	}
	return `${match[1]}T${match[2]}`;
};

/** The `data` claim is an escaped JSON string; some wrappers hand back an object. */
const parseDataClaim = (payload: Record<string, unknown>): Record<string, unknown> => {
	const data = payload["data"];
	if (data === undefined) {
		throw new GstQrPayloadError('Signed QR payload has no "data" claim', "data");
	}
	if (typeof data === "object" && data !== null && !Array.isArray(data)) {
		return data as Record<string, unknown>;
	}
	if (typeof data !== "string") {
		throw new GstQrPayloadError(
			'Signed QR "data" claim is neither a JSON string nor an object',
			"data",
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(data);
	} catch {
		throw new GstQrPayloadError('Signed QR "data" claim is not valid JSON', "data");
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new GstQrPayloadError(
			'Signed QR "data" claim is not a JSON object',
			"data",
		);
	}
	return parsed as Record<string, unknown>;
};

const parseInvoice = (data: Record<string, unknown>): GstEInvoiceQr => {
	const irn = readString(data, "Irn", true) ?? "";
	if (!IRN_PATTERN.test(irn)) {
		throw new GstQrPayloadError(
			`Signed QR field "Irn" is not a 64-character hex hash: ${irn}`,
			"Irn",
		);
	}

	return {
		sellerGstin: (readString(data, "SellerGstin", true) ?? "").toUpperCase(),
		buyerGstin: (readString(data, "BuyerGstin", true) ?? "").toUpperCase(),
		documentNumber: readString(data, "DocNo", true) ?? "",
		documentType: (readString(data, "DocTyp", true) ?? "").toUpperCase(),
		documentDate: parseDocumentDate(readString(data, "DocDt", true) ?? ""),
		totalInvoiceValue: readNumber(data, "TotInvVal"),
		itemCount: readNumber(data, "ItemCnt"),
		mainHsnCode: readString(data, "MainHsnCode", false) ?? "",
		irn: irn.toLowerCase(),
		irnDate: parseIrnDate(readString(data, "IrnDt", false)),
	};
};

const parseHeader = (header: Record<string, unknown>): SignedQrHeader => {
	const alg = header["alg"];
	if (typeof alg !== "string" || alg === "") {
		throw new GstQrParseError('JWS header has no "alg"');
	}
	const readOptional = (key: string): string | null => {
		const value = header[key];
		return typeof value === "string" && value !== "" ? value : null;
	};
	return {
		alg,
		kid: readOptional("kid"),
		x5t: readOptional("x5t"),
		typ: readOptional("typ"),
	};
};

/**
 * Decode the signed QR text printed on a GST e-invoice.
 *
 * **This does not verify the signature.** Everything it returns is
 * supplier-supplied until {@link verifySignedQr} says otherwise. Use it when
 * you want the invoice header (to match against an extracted PDF, say) and hold
 * no IRP certificate.
 *
 * @param text The exact string a QR reader produced. Do not decode or re-encode
 *   it first: the signature covers the base64url bytes verbatim.
 */
export const decodeSignedQr = (text: string): DecodedSignedQr => {
	const trimmed = text.trim();
	if (trimmed === "") {
		throw new GstQrParseError("Signed QR text is empty");
	}
	if (/^upi:\/\//i.test(trimmed)) {
		throw new DynamicB2cQrError(trimmed);
	}

	const jws = decodeCompactJws(trimmed);
	const data = parseDataClaim(jws.payload);
	const issuer = jws.payload["iss"];

	return {
		header: parseHeader(jws.header),
		issuer: typeof issuer === "string" && issuer !== "" ? issuer : null,
		invoice: parseInvoice(data),
		raw: {
			data: typeof jws.payload["data"] === "string" ? jws.payload["data"] : "",
			header: jws.header,
			payload: jws.payload,
		},
		signingInput: jws.signingInput,
		signature: jws.signature,
	};
};

export interface VerifySignedQrOptions {
	/**
	 * Certificates that may have signed the QR, from
	 * {@link loadSignerCertificate}. Empty (or omitted) yields
	 * `status: "not_checked"` rather than a failure: not holding a key is not
	 * evidence of forgery.
	 */
	certificates?: readonly SignerCertificate[];
	/**
	 * Instant to check the certificate's validity window against. Defaults to
	 * now. Pass the invoice date to check the certificate was valid *when the
	 * invoice was cleared*, which is usually what you actually want for an old
	 * document.
	 */
	at?: Date;
}

/** Only RS256 is in use across the IRPs, and widening this is a security choice. */
const SUPPORTED_ALGORITHMS = new Set(["RS256"]);

const checkSignature = (
	decoded: DecodedSignedQr,
	options: VerifySignedQrOptions,
): SignatureVerification => {
	const certificates = options.certificates ?? [];
	if (certificates.length === 0) return { status: "not_checked" };

	if (!SUPPORTED_ALGORITHMS.has(decoded.header.alg)) {
		return { status: "unsupported_algorithm", alg: decoded.header.alg };
	}

	const certificate = selectCertificate(
		certificates,
		decoded.header.kid,
		decoded.header.x5t,
	);
	if (certificate === null) {
		return {
			status: "unknown_key",
			kid: decoded.header.kid,
			x5t: decoded.header.x5t,
		};
	}

	const at = options.at ?? new Date();
	if (at < new Date(certificate.validFrom) || at > new Date(certificate.validTo)) {
		return { status: "certificate_expired", certificate, at: at.toISOString() };
	}

	const verifier = createVerify("RSA-SHA256");
	verifier.update(decoded.signingInput, "ascii");
	verifier.end();
	const ok = verifier.verify(certificate.publicKeyPem, decoded.signature);

	return ok
		? { status: "verified", certificate }
		: { status: "invalid_signature", certificate };
};

/**
 * Decode a signed QR and check its RS256 signature against the supplied IRP
 * certificates.
 *
 * Never throws for a verification outcome, only for text that will not decode
 * at all. `verified` is true only after a real cryptographic check passed, so
 * it is safe to gate on directly.
 */
export const verifySignedQr = (
	text: string,
	options: VerifySignedQrOptions = {},
): VerifiedSignedQr => {
	const decoded = decodeSignedQr(text);
	const signatureVerification = checkSignature(decoded, options);
	return {
		...decoded,
		signatureVerification,
		verified: signatureVerification.status === "verified",
	};
};
