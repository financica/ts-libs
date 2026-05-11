import { createHash, randomBytes } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { authorizeUrl, tokenUrl } from "./endpoints.js";
import type {
	AuthConfig,
	AuthorizationUrlParams,
	AuthorizationUrlResult,
	RefreshParams,
	TokenExchangeParams,
	TokenSet,
} from "./types.js";
import { MyMinFinApiError } from "./types.js";

/**
 * Handles OIDC/OAuth2 authentication with the SPF Finances Authorization Server.
 *
 * Implements the Authorization Code flow with PKCE (RFC 7636) and
 * JWT-based client authentication (RFC 7523).
 */
export class MyMinFinAuth {
	private readonly config: AuthConfig;
	private resolvedKey: CryptoKey | null = null;

	constructor(config: AuthConfig) {
		this.config = config;
	}

	/**
	 * Build an authorization URL for redirecting the end-user's browser.
	 * Returns the URL along with PKCE and state values that must be stored
	 * for the subsequent token exchange.
	 */
	getAuthorizationUrl(params: AuthorizationUrlParams): AuthorizationUrlResult {
		const state = generateRandom();
		const nonce = generateRandom();
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = computeCodeChallenge(codeVerifier);

		const baseScopes = ["openid", "profile"];
		const allScopes = [...new Set([...baseScopes, ...(params.scopes ?? [])])].join(
			" ",
		);

		const ecbClaim = JSON.stringify({ ecb: params.ecb });

		const qs = new URLSearchParams({
			response_type: "code",
			client_id: this.config.clientId,
			scope: allScopes,
			redirect_uri: this.config.redirectUri,
			state,
			nonce,
			code_challenge_method: "S256",
			code_challenge: codeChallenge,
			claims: ecbClaim,
		});

		return {
			url: `${authorizeUrl(this.config.environment)}?${qs.toString()}`,
			state,
			nonce,
			codeVerifier,
		};
	}

	/**
	 * Exchange an authorization code for a token set.
	 * Call this after the user has been redirected back to your redirect URI.
	 */
	async exchangeCode(params: TokenExchangeParams): Promise<TokenSet> {
		const clientAssertion = await this.buildClientAssertionJwt();

		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
			code_verifier: params.codeVerifier,
			client_id: this.config.clientId,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: clientAssertion,
		});

		return this.postToken(body);
	}

	/**
	 * Use a refresh token to obtain a new access token.
	 * Each refresh token can only be used once; the response includes a new one.
	 */
	async refreshToken(params: RefreshParams): Promise<TokenSet> {
		const clientAssertion = await this.buildClientAssertionJwt();

		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: params.refreshToken,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: clientAssertion,
		});

		return this.postToken(body);
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	private async postToken(body: URLSearchParams): Promise<TokenSet> {
		const url = tokenUrl(this.config.environment);

		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
				Accept: "application/json",
			},
			body: body.toString(),
		});

		const json = (await res.json()) as Record<string, unknown>;

		if (!res.ok) {
			const errorDesc =
				typeof json["error_description"] === "string"
					? json["error_description"]
					: "Token request failed";
			throw new MyMinFinApiError(errorDesc, res.status);
		}

		return {
			accessToken: json["access_token"] as string,
			refreshToken: json["refresh_token"] as string,
			idToken: json["id_token"] as string,
			scope: json["scope"] as string,
			tokenType: json["token_type"] as string,
			expiresIn: json["expires_in"] as number,
		};
	}

	private async getPrivateKey(): Promise<CryptoKey> {
		if (this.resolvedKey) return this.resolvedKey;

		if (typeof this.config.privateKey === "string") {
			this.resolvedKey = await importPKCS8(this.config.privateKey, "RS256");
		} else {
			this.resolvedKey = this.config.privateKey;
		}

		return this.resolvedKey;
	}

	private async buildClientAssertionJwt(): Promise<string> {
		const key = await this.getPrivateKey();
		const audience = tokenUrl(this.config.environment);

		return new SignJWT({})
			.setProtectedHeader({
				alg: "RS256",
				typ: "JWT",
				kid: this.config.keyId,
			})
			.setIssuer(this.config.clientId)
			.setSubject(this.config.clientId)
			.setAudience(audience)
			.setExpirationTime("5m")
			.setJti(generateRandom())
			.sign(key);
	}
}

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636)
// ---------------------------------------------------------------------------

function generateRandom(): string {
	return base64UrlEncode(randomBytes(32));
}

function generateCodeVerifier(): string {
	return base64UrlEncode(randomBytes(32));
}

function computeCodeChallenge(verifier: string): string {
	const hash = createHash("sha256").update(verifier).digest();
	return base64UrlEncode(hash);
}

function base64UrlEncode(buf: Buffer | Uint8Array): string {
	return Buffer.from(buf)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
