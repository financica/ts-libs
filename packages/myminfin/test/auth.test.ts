import {
	base64url,
	decodeJwt,
	decodeProtectedHeader,
	exportPKCS8,
	generateKeyPair,
	jwtVerify,
} from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MyMinFinAuth } from "../src/auth";
import { authorizeUrl, tokenUrl } from "../src/endpoints";
import { MyMinFinApiError, MyMinFinError } from "../src/types";

let privateKeyPem: string;
let publicKey: CryptoKey;
let auth: MyMinFinAuth;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256", { extractable: true });
	privateKeyPem = await exportPKCS8(pair.privateKey);
	publicKey = pair.publicKey;
	auth = new MyMinFinAuth({
		clientId: "TestClient",
		privateKey: privateKeyPem,
		keyId: "test-key-1",
		redirectUri: "https://example.com/callback",
		environment: "test",
		fetch: (...args) => fetchMock(...args),
	});
});

/** Shared fetch mock; the top-level `auth` routes through it. */
const fetchMock = vi.fn<typeof fetch>();

const sha256base64url = async (input: string): Promise<string> =>
	base64url.encode(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
		),
	);

describe("MyMinFinAuth.getAuthorizationUrl", () => {
	it("builds an authorization request bound to the returned state, nonce and PKCE verifier", async () => {
		const result = await auth.getAuthorizationUrl({
			ecb: "0123456789",
			scopes: ["myminfin_docs_read"],
		});
		const url = new URL(result.url);
		const p = url.searchParams;

		expect(url.origin + url.pathname).toBe(authorizeUrl("test"));
		expect(p.get("response_type")).toBe("code");
		expect(p.get("client_id")).toBe("TestClient");
		expect(p.get("redirect_uri")).toBe("https://example.com/callback");
		expect(p.get("state")).toBe(result.state);
		expect(p.get("nonce")).toBe(result.nonce);
		// RFC 7636 §4.2: code_challenge = BASE64URL(SHA256(code_verifier)), no padding.
		expect(p.get("code_challenge_method")).toBe("S256");
		expect(p.get("code_challenge")).toBe(
			await sha256base64url(result.codeVerifier),
		);
		expect(p.get("code_challenge")).toHaveLength(43);
		// RFC 7636 §4.1: verifier is 43-128 unreserved characters.
		expect(result.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
	});

	it("carries the enterprise number as the ecb claim (FediamAPI convention)", async () => {
		const result = await auth.getAuthorizationUrl({ ecb: "0662348959" });
		const claims = new URL(result.url).searchParams.get("claims")!;
		expect(JSON.parse(claims)).toEqual({ ecb: "0662348959" });
	});

	it("always requests openid and profile, adds custom scopes once each", async () => {
		const result = await auth.getAuthorizationUrl({
			ecb: "0123456789",
			scopes: [
				"openid",
				"myminfin_docs_read",
				"intervat_write",
				"intervat_write",
			],
		});
		const scopes = new URL(result.url).searchParams.get("scope")!.split(" ");
		expect(scopes).toEqual(
			expect.arrayContaining([
				"openid",
				"profile",
				"myminfin_docs_read",
				"intervat_write",
			]),
		);
		expect(new Set(scopes).size).toBe(scopes.length);
	});

	it("generates unique state, nonce and verifier per call", async () => {
		const r1 = await auth.getAuthorizationUrl({ ecb: "0123456789" });
		const r2 = await auth.getAuthorizationUrl({ ecb: "0123456789" });
		expect(r1.state).not.toBe(r2.state);
		expect(r1.nonce).not.toBe(r2.nonce);
		expect(r1.codeVerifier).not.toBe(r2.codeVerifier);
	});

	it("targets the production authorization server when configured", async () => {
		const prodAuth = new MyMinFinAuth({
			clientId: "ProdClient",
			privateKey: privateKeyPem,
			keyId: "prod-key",
			redirectUri: "https://example.com/callback",
			environment: "production",
		});
		const url = new URL(
			(await prodAuth.getAuthorizationUrl({ ecb: "0123456789" })).url,
		);
		expect(url.origin + url.pathname).toBe(authorizeUrl("production"));
	});
});

describe("MyMinFinAuth token requests", () => {
	const tokenJson = {
		access_token: "at-1",
		refresh_token: "rt-1",
		id_token: "idt-1",
		scope: "openid profile",
		token_type: "Bearer",
		expires_in: 3600,
	};

	afterEach(() => {
		fetchMock.mockReset();
	});

	const stubToken = (init?: ResponseInit, body: unknown = tokenJson) => {
		fetchMock.mockResolvedValueOnce(
			new Response(typeof body === "string" ? body : JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
				...init,
			}),
		);
	};

	const sentBody = (call = 0): URLSearchParams => {
		const init = fetchMock.mock.calls[call]![1]!;
		return new URLSearchParams(init.body as string);
	};

	it("exchangeCode posts an RFC 7523 client assertion and PKCE verifier to the token endpoint", async () => {
		stubToken();
		const tokens = await auth.exchangeCode({
			code: "auth-code",
			redirectUri: "https://example.com/callback",
			codeVerifier: "verifier-xyz",
		});

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe(tokenUrl("test"));
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("content-type")).toMatch(
			/^application\/x-www-form-urlencoded/,
		);

		const body = sentBody();
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
		expect(body.get("redirect_uri")).toBe("https://example.com/callback");
		expect(body.get("code_verifier")).toBe("verifier-xyz");
		expect(body.get("client_id")).toBe("TestClient");
		// RFC 7523 §2.2 client authentication assertion type.
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);

		const assertion = body.get("client_assertion")!;
		// Signed with the configured key: verifiable with its public half.
		const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, {
			issuer: "TestClient",
			subject: "TestClient",
			audience: tokenUrl("test"),
		});
		expect(protectedHeader).toMatchObject({
			alg: "RS256",
			typ: "JWT",
			kid: "test-key-1",
		});
		// RFC 7523 §3: iss = sub = client_id, aud = token endpoint, exp present, jti unique.
		expect(payload.iss).toBe("TestClient");
		expect(payload.sub).toBe("TestClient");
		expect(payload.aud).toBe(tokenUrl("test"));
		// "5m" lifetime; iat and exp are read from two clock samples, so a
		// second boundary between them may shave one second off the delta.
		expect(payload.exp! - payload.iat!).toBeGreaterThanOrEqual(299);
		expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
		expect(payload.jti).toBeTruthy();

		// TokenSet mapping snake_case -> camelCase.
		expect(tokens).toEqual({
			accessToken: "at-1",
			refreshToken: "rt-1",
			idToken: "idt-1",
			scope: "openid profile",
			tokenType: "Bearer",
			expiresIn: 3600,
		});
	});

	it("refreshToken posts grant_type=refresh_token with a fresh assertion (unique jti)", async () => {
		stubToken();
		stubToken();
		await auth.refreshToken({ refreshToken: "rt-old" });
		await auth.refreshToken({ refreshToken: "rt-old" });

		const body = sentBody(0);
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("rt-old");
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		expect(body.has("code_verifier")).toBe(false);

		const jti0 = decodeJwt(sentBody(0).get("client_assertion")!).jti;
		const jti1 = decodeJwt(sentBody(1).get("client_assertion")!).jti;
		expect(jti0).toBeTruthy();
		expect(jti0).not.toBe(jti1);
		expect(decodeProtectedHeader(sentBody(1).get("client_assertion")!).kid).toBe(
			"test-key-1",
		);
	});

	it("accepts a CryptoKey directly and audiences the production token endpoint", async () => {
		const pair = await generateKeyPair("RS256");
		const prodAuth = new MyMinFinAuth({
			clientId: "ProdClient",
			privateKey: pair.privateKey,
			keyId: "prod-key",
			redirectUri: "https://example.com/callback",
			environment: "production",
			fetch: fetchMock,
		});
		stubToken();
		await prodAuth.refreshToken({ refreshToken: "rt" });
		expect(fetchMock.mock.calls[0]![0]).toBe(tokenUrl("production"));
		const { payload } = await jwtVerify(
			sentBody().get("client_assertion")!,
			pair.publicKey,
			{ audience: tokenUrl("production") },
		);
		expect(payload.iss).toBe("ProdClient");
	});

	it("surfaces the OAuth error_description on a non-OK token response", async () => {
		stubToken(
			{ status: 400 },
			{ error: "invalid_grant", error_description: "Authorization code expired" },
		);
		const err = await auth
			.exchangeCode({
				code: "x",
				redirectUri: "https://example.com/callback",
				codeVerifier: "v",
			})
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(MyMinFinApiError);
		expect((err as MyMinFinApiError).status).toBe(400);
		expect((err as MyMinFinApiError).message).toBe("Authorization code expired");
	});

	it("turns a non-JSON 5xx token response into MyMinFinApiError, not SyntaxError", async () => {
		stubToken(
			{ status: 502, headers: { "content-type": "text/html" } },
			"<html>Bad Gateway</html>",
		);
		const err = await auth
			.refreshToken({ refreshToken: "rt" })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(MyMinFinApiError);
		expect((err as MyMinFinApiError).status).toBe(502);
		expect((err as MyMinFinApiError).message).toBe("Token request failed");
	});

	it("wraps a fetch rejection in MyMinFinError with the cause attached", async () => {
		const failure = new TypeError("fetch failed");
		fetchMock.mockRejectedValueOnce(failure);
		const err = await auth
			.refreshToken({ refreshToken: "rt" })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(MyMinFinError);
		expect(err).not.toBeInstanceOf(MyMinFinApiError);
		expect((err as MyMinFinError).cause).toBe(failure);
	});

	it("falls back to a generic message when the error body has no error_description", async () => {
		stubToken({ status: 401 }, { error: "invalid_client" });
		const err = await auth
			.refreshToken({ refreshToken: "rt" })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(MyMinFinApiError);
		expect((err as MyMinFinApiError).status).toBe(401);
		expect((err as MyMinFinApiError).message).toBeTruthy();
	});
});
