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

const base64url = (value: string): string => Buffer.from(value).toString("base64url");

/** Re-use a genuinely minted token's header and signature around a hand-built payload. */
const withPayload = (payload: unknown): string => {
	const [header = "", , signature = ""] = mintSignedQr().split(".");
	return `${header}.${base64url(JSON.stringify(payload))}.${signature}`;
};

/** Hand-built token: header and payload given as raw JSON text. */
const withSegments = (header: string, payload: string): string =>
	`${base64url(header)}.${base64url(payload)}.c2ln`;

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
			// DocDt "05/08/2020" is DD/MM/YYYY: 5 August, not 8 May — the trap
			// this format sets for non-Indian readers.
			documentDate: "2020-08-05",
			totalInvoiceValue: 16650,
			itemCount: 1,
			mainHsnCode: "39231010",
			irn: "afdcc32a0eaa3a054cffcd251884d3e3f4f726b75c8943e7d35fbabc82f05d8a",
			// IrnDt stays naive (no Z / offset): the IRP does not say which zone.
			irnDate: "2020-08-05T11:32:04",
		});
	});

	it("accepts a T-separated IrnDt as well as the space-separated form", () => {
		const decoded = decodeSignedQr(
			mintSignedQr({ data: { ...SAMPLE_DATA, IrnDt: "2020-08-05T11:32:04" } }),
		);
		expect(decoded.invoice.irnDate).toBe("2020-08-05T11:32:04");
	});

	it("accepts a payload with no IrnDt", () => {
		const { IrnDt: _omitted, ...withoutIrnDate } = SAMPLE_DATA;
		const decoded = decodeSignedQr(mintSignedQr({ data: withoutIrnDate }));
		expect(decoded.invoice.irnDate).toBeNull();
	});

	it("accepts a gateway that hands back `data` as an object", () => {
		// The IRP emits `data` as an escaped JSON string; some gateway wrappers
		// re-parse it and hand back a real object. Build that payload by hand:
		// mintSignedQr always stringifies.
		const asObject = decodeSignedQr(withPayload({ data: SAMPLE_DATA, iss: "NIC" }));
		const asString = decodeSignedQr(mintSignedQr());

		expect(asObject.invoice).toEqual(asString.invoice);
		expect(asObject.issuer).toBe("NIC");
		// `raw.data` is documented as the string claim; when the claim was an
		// object there is no string to hand back, so it is empty rather than a
		// re-serialisation the signature never covered.
		expect(asObject.raw.data).toBe("");
		expect(asString.raw.data).toBe(JSON.stringify(SAMPLE_DATA));
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
			["a header without alg", withSegments('{"typ":"JWT"}', '{"data":"{}"}')],
			["a header with an empty alg", withSegments('{"alg":""}', '{"data":"{}"}')],
			[
				"a header that is a JSON array",
				withSegments('["RS256"]', '{"data":"{}"}'),
			],
			["a header that is not JSON", withSegments("alg=RS256", '{"data":"{}"}')],
			[
				"a payload that is a JSON string",
				withSegments('{"alg":"RS256"}', '"data"'),
			],
			["a payload that is null", withSegments('{"alg":"RS256"}', "null")],
		])("rejects %s", (_case, text) => {
			expect(() => decodeSignedQr(text)).toThrow(GstQrParseError);
		});

		it.each([
			["TotInvVal", "not-a-number"],
			["DocDt", "31/02/2021"], // not a real calendar date; Date would roll it forward
			["DocDt", "2021-02-03"], // ISO order, not the IRP's DD/MM/YYYY
			["Irn", "abc123"], // not a 64-character hex hash
			["IrnDt", "05/08/2020 11:32"],
			["SellerGstin", undefined], // required field missing
		])("rejects a bad %s and names the field", (field, badValue) => {
			const data: Record<string, unknown> = { ...SAMPLE_DATA };
			if (badValue === undefined) delete data[field];
			else data[field] = badValue;

			let thrown: unknown;
			try {
				decodeSignedQr(mintSignedQr({ data }));
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(GstQrPayloadError);
			expect((thrown as GstQrPayloadError).field).toBe(field);
		});

		it("rejects a payload with no data claim", () => {
			expect(() => decodeSignedQr(withPayload({ iss: "NIC" }))).toThrow(
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
		const result = verifySignedQr(
			withPayload({
				data: JSON.stringify({ ...SAMPLE_DATA, TotInvVal: 1 }),
				iss: "NIC",
			}),
			{ certificates: trusted() },
		);

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

	it("does not fall back to the only certificate when kid names another key", () => {
		// A header that names a key we do not hold must not silently be checked
		// against whatever single certificate happens to be configured: that
		// would let a forger pick a kid and have the wrong key "verify" it.
		const kid = "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF";
		const result = verifySignedQr(mintSignedQr({ kid, x5t: null }), {
			certificates: trusted(),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification).toMatchObject({
			status: "unknown_key",
			kid,
		});
	});

	it("matches a colon-separated lowercase kid against the same thumbprint", () => {
		const hex = thumbprintOf(TEST_CERT).hex.toLowerCase();
		const kid = hex.match(/.{2}/g)?.join(":") ?? "";
		const result = verifySignedQr(mintSignedQr({ kid, x5t: null }), {
			certificates: trusted(),
		});
		expect(result.verified).toBe(true);
	});

	it("falls through to x5t when kid names no known key but x5t does", () => {
		const result = verifySignedQr(
			mintSignedQr({ kid: "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF" }),
			{ certificates: trusted() },
		);
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

	it.each([
		["before it became valid", "1990-01-01T00:00:00.000Z"],
		["after it expired", "2150-01-01T00:00:00.000Z"],
	])("reports a certificate checked %s, echoing the instant", (_case, at) => {
		const result = verifySignedQr(mintSignedQr(), {
			certificates: trusted(),
			at: new Date(at),
		});

		expect(result.verified).toBe(false);
		expect(result.signatureVerification).toMatchObject({
			status: "certificate_expired",
			at,
		});
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

		// `openssl x509 -fingerprint -sha1 -noout -in test/fixtures/test-signer.cert.pem`
		// → 6C:1E:BC:AF:54:4E:0D:D6:E3:CE:34:FC:E8:23:79:53:70:0E:D5:62
		expect(certificate.thumbprintHex).toBe(
			"6C1EBCAF544E0DD6E3CE34FCE8237953700ED562",
		);
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
