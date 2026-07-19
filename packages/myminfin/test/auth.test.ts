import { describe, expect, it } from "vitest";
import { MyMinFinAuth } from "../src/auth";

const FAKE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7o4qne60TB3pq
6JSqRfQ4gZzNpDMiSCtHxozmJZ0vmhVjJMJTFBBOFAjdRMiff2MMXiCOkdl7Kdq6
RKOzVqK5vwn5GjNJfW2A9YXGmGzazNwtZHSWJlOlMSQwmeOMb2lAVIHYDHjJur4e
8DN1LHzmNJh0lggSSYfbUb/KLkg3jDSEoGiEmrBOaToZ3r14VxaFkJqNKCb6LhfA
OdMGF7IiU3L3+UmC3KnR1tLinFnfMKqjBfR5qFRo0pYWMOwIzz2cFqm/pSELj8Jb
VBd3tqGcWJ0gWlSSiURvAYK0J8NykIK6FMflIwJHpHbRIqvkdmMbpjw4olfWGuBB
GaOyhXAjAgMBAAECggEAFuq6Lgc2EJRQoC5VEux0QEGCM39p9v2bJL9FKx1KN+pJ
IJJUbkBkqNHDJFMbdFYEB8MsWHjJDwxj25TCYqgTqFQHmOBKxXdfmFIBoI8OQnKP
B0AWMZYfkVHo1FU3FMMf+6S5GWBP0gQT+MHtaGCWWPfFuv1LBUxZ0K5K2G3R3F9m
+hCPa4x6JVDtZEkPvLbLCgR1JOazxqjKq2FjdPKYuNh/M9WW4Udc8q56G6X2anz
C6p/MFUH8mYTx/wBqdqfbKf7sJ80AFb+4jGZdajcLCI1cXgIzwc9NjKR/tEwxBbe
BNWiQJGTdcr8VjqPwyFo1IuYinoRKKzHQepNL/FE4QKBgQDwJIkU92+tFpqbwkdq
hBvCvfGr/tiOBit5kKOT7HTeqY3yOPcBr0JUfp0l7paBFpiNp1pk0+4+Gw0Hd8NG
3QjNOA8ZnhAzNUb/FiHbhN4skqkJxr1WHNBxlG5K76OVK4v/csBfMM/c5/zLIufb
MjOJLUPLjmDMchgmXq4UrAD01QKBgQDnMnU8JBsgMXxYcb0/Kgj6ln/y0LuG0z6f
gPCDKKJjlpEbM+4rLkfMOyyrt+EcATuRAEhm6v0Si6WyMkwk50gD+B4y0Ws5a8Jj
CVpSMLN1JFGhPB4VJRFC/pVf/B7RFHZ1amYXF/0+qZRYKPOFRwVFYD3YPDAya2mD
U6kCxFBnJwKBgB0HqOhNZNqCc5KPdu3zuI5JJ5OqAo9JpS2gXjjQIBgBBmnPC8RC
v2ow5ij8K+FrYEN3fz/SBx2f5vWN1SQQF2fEL8mNBFKsBqzNf/wBa0V0daRbHDlT
x5B+PgjCd8LcY8Shf0Gnl0Hkp1py1CKn9LNXpnvBLCRd7hnXJDHlI/hAoGBAJlA
ooekyxva2Q25p07YHmnJtfQ3EDP5+S/kSB1zy1aCn+ATCshdDhvtmfFUCqE4NDB7Y
UTqbK/EquaHcLnPp6IzXOjYaogs4fVxcULhH73s0hNjIE+e0Hbc9eTZ7BOHy3PJ8
QF3+mCz/B+IjiSC7Aj7Lv0LPNWKa0eX0z35t/0HPAoGBAM7lfMYYb0rN/sNdGSWX
aJKf5q0u3ip1QSYCVpILBmBQ0MU0yLYAxXq54FRWg0QhzCRjJbH7Av/SYBlJGmsA
e5W3DjMqFt/Ib9MTLRkQ4VMoSjJEJtRe1c7IGbpzJ6K0eBg8sYjXdDJHR/j9Z5Ig
+kZp+eFKjzblK5e3ON9/Sjhl
-----END PRIVATE KEY-----`;

describe("MyMinFinAuth", () => {
	const auth = new MyMinFinAuth({
		clientId: "TestClient",
		privateKey: FAKE_PRIVATE_KEY,
		keyId: "test-key-1",
		redirectUri: "https://example.com/callback",
		environment: "test",
	});

	describe("getAuthorizationUrl", () => {
		it("returns a valid authorization URL", async () => {
			const result = await auth.getAuthorizationUrl({
				ecb: "0123456789",
				scopes: ["myminfin_docs_read"],
			});

			expect(result.url).toContain(
				"https://fediamapi-a.minfin.be/sso/oauth2/authorize",
			);
			expect(result.url).toContain("response_type=code");
			expect(result.url).toContain("client_id=TestClient");
			expect(result.url).toContain("code_challenge_method=S256");
			expect(result.state).toBeTruthy();
			expect(result.nonce).toBeTruthy();
			expect(result.codeVerifier).toBeTruthy();
		});

		it("includes ECB claim in URL", async () => {
			const result = await auth.getAuthorizationUrl({ ecb: "0662348959" });
			const url = new URL(result.url);
			const claims = url.searchParams.get("claims");
			expect(claims).toBe('{"ecb":"0662348959"}');
		});

		it("always includes openid and profile scopes", async () => {
			const result = await auth.getAuthorizationUrl({ ecb: "0123456789" });
			const url = new URL(result.url);
			const scope = url.searchParams.get("scope")!;
			expect(scope).toContain("openid");
			expect(scope).toContain("profile");
		});

		it("includes custom scopes", async () => {
			const result = await auth.getAuthorizationUrl({
				ecb: "0123456789",
				scopes: ["myminfin_docs_read", "intervat_write"],
			});
			const url = new URL(result.url);
			const scope = url.searchParams.get("scope")!;
			expect(scope).toContain("myminfin_docs_read");
			expect(scope).toContain("intervat_write");
		});

		it("deduplicates scopes", async () => {
			const result = await auth.getAuthorizationUrl({
				ecb: "0123456789",
				scopes: ["openid", "profile", "custom"],
			});
			const url = new URL(result.url);
			const scope = url.searchParams.get("scope")!;
			const parts = scope.split(" ");
			const unique = new Set(parts);
			expect(parts.length).toBe(unique.size);
		});

		it("generates unique state and nonce per call", async () => {
			const r1 = await auth.getAuthorizationUrl({ ecb: "0123456789" });
			const r2 = await auth.getAuthorizationUrl({ ecb: "0123456789" });
			expect(r1.state).not.toBe(r2.state);
			expect(r1.nonce).not.toBe(r2.nonce);
			expect(r1.codeVerifier).not.toBe(r2.codeVerifier);
		});

		it("uses production URLs when configured", async () => {
			const prodAuth = new MyMinFinAuth({
				clientId: "ProdClient",
				privateKey: FAKE_PRIVATE_KEY,
				keyId: "prod-key",
				redirectUri: "https://example.com/callback",
				environment: "production",
			});

			const result = await prodAuth.getAuthorizationUrl({ ecb: "0123456789" });
			expect(result.url).toContain(
				"https://fediamapi.minfin.fgov.be/sso/oauth2/authorize",
			);
		});

		it("code_challenge is 43 characters (no padding)", async () => {
			const result = await auth.getAuthorizationUrl({ ecb: "0123456789" });
			const url = new URL(result.url);
			const challenge = url.searchParams.get("code_challenge")!;
			expect(challenge.length).toBe(43);
			expect(challenge).not.toContain("=");
		});
	});
});
