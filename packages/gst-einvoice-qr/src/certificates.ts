import { X509Certificate } from "node:crypto";
import { CertificateError } from "./errors.js";
import type { SignerCertificate } from "./types.js";

/**
 * Read a PEM X.509 certificate into the shape {@link verifySignedQr} matches
 * against a QR header.
 *
 * We deliberately ship **no** built-in certificates. There are six authorised
 * IRPs, each signs with its own key, and those keys rotate; a bundled list goes
 * stale silently and would make a QR cleared through, say, IRIS look forged.
 * The caller fetches the certificates it trusts and passes them in.
 *
 * @param pem PEM-encoded X.509 certificate (not a bare public key).
 * @param label Name used in results and errors, e.g. `"NIC production"`.
 */
export const loadSignerCertificate = (
	pem: string,
	label: string,
): SignerCertificate => {
	let certificate: X509Certificate;
	try {
		certificate = new X509Certificate(pem);
	} catch (cause) {
		throw new CertificateError(`Certificate "${label}" is not a valid X.509 PEM`, {
			cause,
		});
	}

	// Node renders the SHA-1 fingerprint as colon-separated uppercase hex; the
	// JWS header carries the same 20 bytes as plain hex (`kid`) and base64url
	// (`x5t`).
	const thumbprintHex = certificate.fingerprint.replaceAll(":", "").toUpperCase();
	const thumbprintBase64Url = Buffer.from(thumbprintHex, "hex").toString("base64url");

	const publicKeyPem = certificate.publicKey
		.export({ type: "spki", format: "pem" })
		.toString();

	return {
		label,
		thumbprintHex,
		thumbprintBase64Url,
		publicKeyPem,
		validFrom: new Date(certificate.validFrom).toISOString(),
		validTo: new Date(certificate.validTo).toISOString(),
	};
};

/**
 * Pick the certificate a JWS header points at.
 *
 * Matches on the SHA-1 thumbprint in `kid` (hex) or `x5t` (base64url). When the
 * header carries neither, and exactly one certificate was supplied, that one is
 * used — otherwise we refuse to guess, because trying every key in turn is how
 * you end up reporting a signature as valid against a key the IRP never used.
 */
export const selectCertificate = (
	certificates: readonly SignerCertificate[],
	kid: string | null,
	x5t: string | null,
): SignerCertificate | null => {
	if (kid !== null) {
		const normalized = kid.replaceAll(":", "").toUpperCase();
		const match = certificates.find((c) => c.thumbprintHex === normalized);
		if (match) return match;
	}
	if (x5t !== null) {
		const match = certificates.find((c) => c.thumbprintBase64Url === x5t);
		if (match) return match;
	}
	if (kid === null && x5t === null && certificates.length === 1) {
		return certificates[0] ?? null;
	}
	return null;
};
