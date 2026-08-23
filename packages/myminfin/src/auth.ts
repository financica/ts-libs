import { base64url, importPKCS8, SignJWT } from "jose";
import { authorizeUrl, tokenUrl } from "./endpoints";
import { assertOk, resolveFetch, wrapFetchError } from "./http";
import type {
	AuthConfig,
	AuthorizationUrlParams,
	AuthorizationUrlResult,
	RefreshParams,
	TokenExchangeParams,
	TokenSet,
} from "./types";

/** Raw body of the OAuth token endpoint, as returned by MyMinFin. */
interface TokenResponse {
	access_token: string;
	refresh_token: string;
	id_token: string;
	scope: string;
	token_type: string;
	expires_in: number;
	error_description?: unknown;
}

/**
 * Handles OIDC/OAuth2 authentication with the SPF Finances Authorization Server.
 *
 * Implements the Authorization Code flow with PKCE (RFC 7636) and
 * JWT-based client authentication (RFC 7523).
 */
export class MyMinFinAuth {
	private readonly config: AuthConfig;
	private readonly fetchImpl: typeof fetch;
	private resolvedKey: CryptoKey | null = null;

	constructor(config: AuthConfig) {
		this.config = config;
		this.fetchImpl = resolveFetch(config.fetch);
	}

	/**
	 * Build an authorization URL for redirecting the end-user's browser.
	 * Returns the URL along with PKCE and state values that must be stored
	 * for the subsequent token exchange.
	 */
	async getAuthorizationUrl(
		params: AuthorizationUrlParams,
	): Promise<AuthorizationUrlResult> {
		const state = generateRandom();
		const nonce = generateRandom();
		const codeVerifier = generateRandom();
		const codeChallenge = await computeCodeChallenge(codeVerifier);

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
	async exchangeCode(
		params: TokenExchangeParams,
		options?: { signal?: AbortSignal },
	): Promise<TokenSet> {
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

		return this.postToken(body, options?.signal);
	}

	/**
	 * Use a refresh token to obtain a new access token.
	 * Each refresh token can only be used once; the response includes a new one.
	 */
	async refreshToken(
		params: RefreshParams,
		options?: { signal?: AbortSignal },
	): Promise<TokenSet> {
		const clientAssertion = await this.buildClientAssertionJwt();

		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: params.refreshToken,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: clientAssertion,
		});

		return this.postToken(body, options?.signal);
	}

	// -----------------------------------------------------------------------
	// Internal helpers
	// -----------------------------------------------------------------------

	private async postToken(
		body: URLSearchParams,
		signal?: AbortSignal,
	): Promise<TokenSet> {
		const url = tokenUrl(this.config.environment);

		let res: Response;
		try {
			res = await this.fetchImpl(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
					Accept: "application/json",
				},
				body: body.toString(),
				...(signal ? { signal } : {}),
			});
		} catch (error) {
			throw wrapFetchError(error, url);
		}

		// Check the status before touching the body: a non-JSON 5xx must be a
		// MyMinFinApiError, not a SyntaxError from `res.json()`. Token errors
		// are OAuth `{error, error_description}` bodies, not RFC 7807.
		await assertOk(res, {
			message: (errorBody) =>
				typeof errorBody?.["error_description"] === "string"
					? errorBody["error_description"]
					: "Token request failed",
		});

		const json = (await res.json()) as TokenResponse;

		return {
			accessToken: json.access_token,
			refreshToken: json.refresh_token,
			idToken: json.id_token,
			scope: json.scope,
			tokenType: json.token_type,
			expiresIn: json.expires_in,
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
			.setIssuedAt()
			.setExpirationTime("5m")
			.setJti(generateRandom())
			.sign(key);
	}
}

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636)
// ---------------------------------------------------------------------------

function generateRandom(): string {
	return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}

async function computeCodeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64url.encode(new Uint8Array(digest));
}
