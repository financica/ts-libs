import { describe, expect, it } from "vitest";
import {
	CertificateError,
	decodeSignedQr,
	DynamicB2cQrError,
	GstQrParseError,
	GstQrPayloadError,
	loadSignerCertificate,
	verifySignedQr,
} from "../src/index.js";
import {
	mintSignedQr,
	OTHER_CERT,
	OTHER_KEY,
	SAMPLE_DATA,
	TEST_CERT,
	thumbprintOf,
} from "./helpers.js";

const trusted = () => [loadSignerCertificate(TEST_CERT, "test IRP")];

describe("decodeSignedQr", () => {
	it("decodes the documented NIC payload shape", () => {
		const decoded = decodeSignedQr(mintSignedQr());

		expect(decoded.issuer).toBe("NIC");
		expect(decoded.header.alg).toBe("RS256");
		expect(decoded.header.kid).toBe(thumbprintOf(TEST_CERT).hex);
		expect(decoded.invoice).toEqual({
			sellerGstin: "37BZNPM9430M1KL",
			buyerGstin: "03BZNPM9430M1KL",
			documentNumber: "CTDN23456",
			documentType: "INV",
			documentDate: "2020-08-05",
			totalInvoiceValue: 16650,
			itemCount: 1,
			mainHsnCode: "39231010",
			irn: "afdcc32a0eaa3a054cffcd251884d3e3f4f726b75c8943e7d35fbabc82f05d8a",
			irnDate: "2020-08-05T11:32:04",
		});
	});

	it("normalises DocDt from DD/MM/YYYY, not MM/DD/YYYY", () => {
		// 05/08 must be 5 August, the trap this format sets for non-Indian readers.
		const decoded = decodeSignedQr(mintSignedQr());
		expect(decoded.invoice.documentDate).toBe("2020-08-05");
	});

	it("leaves IrnDt naive rather than inventing a timezone", () => {
		const decoded = decodeSignedQr(mintSignedQr());
		expect(decoded.invoice.irnDate).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
	});

	it("accepts a payload with no IrnDt", () => {
		const { IrnDt: _omitted, ...withoutIrnDate } = SAMPLE_DATA;
		const decoded = decodeSignedQr(mintSignedQr({ data: withoutIrnDate }));
		expect(decoded.invoice.irnDate).toBeNull();
	});

	it("accepts a gateway that hands back `data` as an object", () => {
		const token = mintSignedQr({ data: SAMPLE_DATA });
		const asObject = mintSignedQr({
			data: JSON.parse(JSON.stringify(SAMPLE_DATA)) as Record<string, unknown>,
		});
		expect(decodeSignedQr(asObject).invoice).toEqual(decodeSignedQr(token).invoice);
	});

	it("accepts quoted numerics, which some wrappers emit", () => {
		const decoded = decodeSignedQr(
			mintSignedQr({
				data: { ...SAMPLE_DATA, TotInvVal: "16650.50", ItemCnt: "3" },
			}),
		);
		expect(decoded.invoice.totalInvoiceValue).toBeCloseTo(16650.5, 2);
		expect(decoded.invoice.itemCount).toBe(3);
	});

	it("preserves an unknown document type instead of rejecting it", () => {
		const decoded = decodeSignedQr(
			mintSignedQr({ data: { ...SAMPLE_DATA, DocTyp: "XYZ" } }),
		);
		expect(decoded.invoice.documentType).toBe("XYZ");
	});

	it("keeps the raw data claim so callers can re-verify independently", () => {
		const decoded = decodeSignedQr(mintSignedQr());
		expect(JSON.parse(decoded.raw.data)).toMatchObject({ DocNo: "CTDN23456" });
	});

	describe("rejections", () => {
		it("flags the B2C dynamic QR distinctly from unparseable text", () => {
			expect(() => decodeSignedQr("upi://pay?pa=merchant@bank&am=100")).toThrow(
				DynamicB2cQrError,
			);
		});

		it.each([
			["empty text", "   "],
			["not a JWS", "hello world"],
			["two parts only", "aaa.bbb"],
			["empty signature", "aaa.bbb."],
			["non-base64url characters", "aa*a.bbb.ccc"],
		])("rejects %s", (_case, text) => {
			expect(() => decodeSignedQr(text)).toThrow(GstQrParseError);
		});

		it("rejects an IRN that is not a 64-character hash", () => {
			expect(() =>
				decodeSignedQr(
					mintSignedQr({ data: { ...SAMPLE_DATA, Irn: "abc123" } }),
				),
			).toThrow(GstQrPayloadError);
		});

		it("rejects a DocDt that is not a real calendar date", () => {
			expect(() =>
				decodeSignedQr(
					mintSignedQr({ data: { ...SAMPLE_DATA, DocDt: "31/02/2021" } }),
				),
			).toThrow(/not a real date/);
		});

		it("names the offending field", () => {
			try {
				decodeSignedQr(
					mintSignedQr({
						data: { ...SAMPLE_DATA, TotInvVal: "not-a-number" },
					}),
				);
				expect.unreachable("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(GstQrPayloadError);
				expect((error as GstQrPayloadError).field).toBe("TotInvVal");
			}
		});

		it("rejects a payload with no data claim", () => {
			const token = mintSignedQr();
			const [header = "", , signature = ""] = token.split(".");
			const payload = Buffer.from(JSON.stringify({ iss: "NIC" })).toString(
				"base64url",
			);
			expect(() => decodeSignedQr(`${header}.${payload}.${signature}`)).toThrow(
				GstQrPayloadError,
			);
		});
	});
});

describe("verifySignedQr", () => {
	it("verifies a genuine signature", () => {
		const result = verifySignedQr(mintSignedQr(), { certificates: trusted() });

		expect(result.verified).toBe(true);
		expect(result.signatureVerification).toMatchObject({
			status: "verified",
			certificate: { label: "test IRP" },
		});
	});

	it("rejects a tampered signature", () => {
		const result = verifySignedQr(mintSignedQr({ tamper: true }), {
			certificates: trusted(),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification.status).toBe("invalid_signature");
	});

	it("rejects a payload edited after signing", () => {
		const token = mintSignedQr();
		const [header = "", , signature = ""] = token.split(".");
		const forged = Buffer.from(
			JSON.stringify({
				data: JSON.stringify({ ...SAMPLE_DATA, TotInvVal: 1 }),
				iss: "NIC",
			}),
		).toString("base64url");

		const result = verifySignedQr(`${header}.${forged}.${signature}`, {
			certificates: trusted(),
		});

		expect(result.invoice.totalInvoiceValue).toBe(1);
		expect(result.verified).toBe(false);
		expect(result.signatureVerification.status).toBe("invalid_signature");
	});

	it("reports unknown_key rather than invalid when the signer is not ours", () => {
		// Signed by a key we hold no certificate for: this is "we cannot check",
		// not "this is forged", and conflating them would be a false accusation.
		const result = verifySignedQr(mintSignedQr({ key: OTHER_KEY }), {
			certificates: trusted(),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification).toMatchObject({
			status: "unknown_key",
			kid: thumbprintOf(OTHER_CERT).hex,
		});
	});

	it("verifies once the other signer's certificate is supplied too", () => {
		const result = verifySignedQr(mintSignedQr({ key: OTHER_KEY }), {
			certificates: [
				...trusted(),
				loadSignerCertificate(OTHER_CERT, "other IRP"),
			],
		});

		expect(result.verified).toBe(true);
		expect(result.signatureVerification).toMatchObject({
			certificate: { label: "other IRP" },
		});
	});

	it("selects the certificate by x5t when kid is absent", () => {
		const result = verifySignedQr(mintSignedQr({ kid: null }), {
			certificates: trusted(),
		});
		expect(result.verified).toBe(true);
	});

	it("does not check anything when no certificates are supplied", () => {
		const result = verifySignedQr(mintSignedQr());

		expect(result.verified).toBe(false);
		expect(result.signatureVerification.status).toBe("not_checked");
		// The invoice is still readable: decoding does not depend on trust.
		expect(result.invoice.documentNumber).toBe("CTDN23456");
	});

	it("refuses an algorithm swap instead of trying to verify it", () => {
		const result = verifySignedQr(mintSignedQr({ alg: "none" }), {
			certificates: trusted(),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification).toMatchObject({
			status: "unsupported_algorithm",
			alg: "none",
		});
	});

	it("reports a certificate outside its validity window", () => {
		const result = verifySignedQr(mintSignedQr(), {
			certificates: trusted(),
			at: new Date("1990-01-01T00:00:00Z"),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification.status).toBe("certificate_expired");
	});

	it("will not guess between several certificates when the header names none", () => {
		const result = verifySignedQr(mintSignedQr({ kid: null, x5t: null }), {
			certificates: [
				...trusted(),
				loadSignerCertificate(OTHER_CERT, "other IRP"),
			],
		});

		expect(result.signatureVerification.status).toBe("unknown_key");
	});

	it("uses the only certificate when the header names none", () => {
		const result = verifySignedQr(mintSignedQr({ kid: null, x5t: null }), {
			certificates: trusted(),
		});

		expect(result.verified).toBe(true);
	});
});

describe("loadSignerCertificate", () => {
	it("derives both thumbprint encodings from one certificate", () => {
		const certificate = loadSignerCertificate(TEST_CERT, "test IRP");
		const expected = thumbprintOf(TEST_CERT);

		expect(certificate.thumbprintHex).toBe(expected.hex);
		expect(certificate.thumbprintBase64Url).toBe(expected.base64url);
		expect(
			Buffer.from(certificate.thumbprintBase64Url, "base64url").toString("hex"),
		).toBe(certificate.thumbprintHex.toLowerCase());
	});

	it("rejects something that is not a certificate", () => {
		expect(() => loadSignerCertificate("not a pem", "bad")).toThrow(
			CertificateError,
		);
	});
});
