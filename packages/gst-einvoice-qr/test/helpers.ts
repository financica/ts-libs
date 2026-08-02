import { createSign, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export const readFixture = (name: string): string =>
	readFileSync(join(fixtures, name), "utf8");

export const TEST_CERT = readFixture("test-signer.cert.pem");
export const TEST_KEY = readFixture("test-signer.key.pem");
export const OTHER_CERT = readFixture("other-signer.cert.pem");
export const OTHER_KEY = readFixture("other-signer.key.pem");

const base64url = (value: string | Buffer): string =>
	Buffer.from(value as string).toString("base64url");

/**
 * The invoice payload from the ClearTax-documented NIC sample, field spellings
 * and formats verbatim. `IrnDt` is added because most IRPs emit it.
 */
export const SAMPLE_DATA = {
	SellerGstin: "37BZNPM9430M1KL",
	BuyerGstin: "03BZNPM9430M1KL",
	DocNo: "CTDN23456",
	DocTyp: "INV",
	DocDt: "05/08/2020",
	TotInvVal: 16650,
	ItemCnt: 1,
	MainHsnCode: "39231010",
	Irn: "afdcc32a0eaa3a054cffcd251884d3e3f4f726b75c8943e7d35fbabc82f05d8a",
	IrnDt: "2020-08-05 11:32:04",
} as const;

export interface MintOptions {
	data?: Record<string, unknown> | string;
	issuer?: string | null;
	alg?: string;
	kid?: string | null;
	x5t?: string | null;
	key?: string;
	/** Corrupt the signature after signing, to exercise the invalid path. */
	tamper?: boolean;
}

/** Mint a signed QR the way an IRP does: RS256 over `<header>.<payload>`. */
export const mintSignedQr = (options: MintOptions = {}): string => {
	const {
		data = SAMPLE_DATA,
		issuer = "NIC",
		alg = "RS256",
		key = TEST_KEY,
		tamper = false,
	} = options;

	const certificatePem = key === OTHER_KEY ? OTHER_CERT : TEST_CERT;
	const thumbprint = thumbprintOf(certificatePem);

	const header: Record<string, unknown> = { alg, typ: "JWT" };
	const kid = options.kid === undefined ? thumbprint.hex : options.kid;
	const x5t = options.x5t === undefined ? thumbprint.base64url : options.x5t;
	if (kid !== null) header["kid"] = kid;
	if (x5t !== null) header["x5t"] = x5t;

	const payload: Record<string, unknown> = {
		data: typeof data === "string" ? data : JSON.stringify(data),
	};
	if (issuer !== null) payload["iss"] = issuer;

	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
		JSON.stringify(payload),
	)}`;

	const signer = createSign("RSA-SHA256");
	signer.update(signingInput, "ascii");
	signer.end();
	const signature = signer.sign(key);
	if (tamper) signature[0] = signature[0] === 0 ? 1 : 0;

	return `${signingInput}.${signature.toString("base64url")}`;
};

export const thumbprintOf = (
	certificatePem: string,
): { hex: string; base64url: string } => {
	const hex = new X509Certificate(certificatePem).fingerprint
		.replaceAll(":", "")
		.toUpperCase();
	return { hex, base64url: Buffer.from(hex, "hex").toString("base64url") };
};
