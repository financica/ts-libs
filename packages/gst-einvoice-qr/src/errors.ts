/** Base class for every error thrown by this package. */
export class GstQrError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "GstQrError";
		this.cause = options?.cause;
	}
}

/** The scanned text is not a compact JWS at all, or its parts do not decode. */
export class GstQrParseError extends GstQrError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "GstQrParseError";
	}
}

/**
 * The text is the *other* Indian invoice QR: the B2C dynamic QR mandated by
 * notification 14/2020, which is a UPI payment string and carries no IRN.
 *
 * Worth its own error because scanning the wrong QR on an invoice is the most
 * likely way to end up here, and "not a JWS" would be an unhelpful thing to
 * tell the user.
 */
export class DynamicB2cQrError extends GstQrError {
	readonly text: string;

	constructor(text: string) {
		super(
			"This is a B2C dynamic QR (UPI payment string), not an IRP-signed e-invoice QR. It carries no IRN and cannot be verified.",
		);
		this.name = "DynamicB2cQrError";
		this.text = text;
	}
}

/** The JWS decoded, but its payload is not a GST e-invoice QR payload. */
export class GstQrPayloadError extends GstQrError {
	/** The payload field at fault, when one can be singled out. */
	readonly field: string | null;

	constructor(message: string, field: string | null = null) {
		super(message);
		this.name = "GstQrPayloadError";
		this.field = field;
	}
}

/** A PEM handed to {@link loadSignerCertificate} is not a usable X.509 certificate. */
export class CertificateError extends GstQrError {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "CertificateError";
	}
}
