// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type Environment = "test" | "production";

export interface AuthConfig {
	/** Override the global `fetch` (e.g. for testing). Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
	/** OIDC client ID provided during registration */
	clientId: string;
	/** RS256 private key (PEM string or CryptoKey) for signing client assertion JWTs */
	privateKey: string | CryptoKey;
	/** Key ID (kid) matching the public key in your JWKS */
	keyId: string;
	/** Redirect URI registered with SPF Finances */
	redirectUri: string;
	/** Target environment */
	environment: Environment;
}

export interface ClientConfig {
	/** Override the global `fetch` (e.g. for testing). Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
	/** OAuth2 Bearer access token */
	accessToken: string;
	/** Target environment */
	environment: Environment;
}

// ---------------------------------------------------------------------------
// OIDC / OAuth2
// ---------------------------------------------------------------------------

export interface AuthorizationUrlParams {
	/** 10-digit enterprise number (ECB/BCE) of the business customer */
	ecb: string;
	/** OAuth2 scopes to request (openid and profile are always included) */
	scopes?: string[];
}

export interface AuthorizationUrlResult {
	/** Full authorization URL to redirect the user to */
	url: string;
	/** Opaque state value for CSRF protection */
	state: string;
	/** Nonce for ID token validation */
	nonce: string;
	/** PKCE code_verifier (store securely, needed for token exchange) */
	codeVerifier: string;
}

export interface TokenExchangeParams {
	/** Authorization code from the callback */
	code: string;
	/** The code_verifier generated during the authorization request */
	codeVerifier: string;
	/** Redirect URI used in the authorization request */
	redirectUri: string;
}

export interface RefreshParams {
	/** Active refresh token */
	refreshToken: string;
}

export interface TokenSet {
	/** Bearer access token for API calls */
	accessToken: string;
	/** Refresh token for obtaining new access tokens */
	refreshToken: string;
	/** Encoded ID token JWT */
	idToken: string;
	/** Authorized scopes (space-separated) */
	scope: string;
	/** Token type (always "Bearer") */
	tokenType: string;
	/** Access token lifetime in seconds */
	expiresIn: number;
}

export interface IdTokenClaims {
	/** National number of the authenticated user */
	sub: string;
	/** Always "externalapi" for API tokens */
	userType: string;
	/** Enterprise number associated with the tokens */
	customerEcb: string;
	/** First name of the authenticated user (only available first 3 minutes) */
	customerFirstname?: string;
	/** Last name of the authenticated user (only available first 3 minutes) */
	customerName?: string;
	/** Unix timestamp of authentication */
	customerAuthenticationTime: number;
}

// ---------------------------------------------------------------------------
// MyMinFin API — Document Search
// ---------------------------------------------------------------------------

export type OwnerType = "CBE" | "SSIN";

export interface DocumentSearchParams {
	/** Start date (YYYY-MM-dd). Required. Max 60 days in the past. */
	since: string;
	/** End date (YYYY-MM-dd). Optional. */
	until?: string;
	/** Owner type filter. Optional if ownerIdentifier is not specified. */
	ownerType?: OwnerType;
	/** Owner identifier (CBE or SSIN number). Optional if ownerType is not specified. */
	ownerIdentifier?: string;
}

/**
 * A name in SPF's four languages. `en` is null on every document type seen so
 * far; `fr` and `nl` are always filled.
 */
export interface LocalizedString {
	nl: string | null;
	fr: string | null;
	de: string | null;
	en: string | null;
}

/** The entity a document belongs to, as the search reports it. */
export interface DocumentOwner {
	type: OwnerType;
	/**
	 * The CBE or SSIN number. CBE numbers come back *without* their leading
	 * zero (`806154033` for enterprise 0806154033); pass the value straight back
	 * as `ownerIdentifier` when downloading, the API accepts either form.
	 */
	identifier: string;
}

/** One `metadata` entry: a localized label with its values. */
export interface DocumentMetadataEntry {
	name: LocalizedString;
	values: string[];
}

/** A document as the FineAPI search returns it (`DocumentInfos` + `content`). */
export interface MyMinFinDocument {
	uuid: string;
	/** The download URL SPF advertise; `downloadDocument(uuid)` builds the same. */
	contentUrl: string | null;
	/** The document category, named in each language. There is no type code. */
	docType: LocalizedString;
	/**
	 * Who the document belongs to: the connected enterprise itself, or a
	 * mandator whose mandate makes it visible. A mandator's document must be
	 * downloaded with its owner passed explicitly or the API answers 403.
	 */
	relatedTo: DocumentOwner[];
	/** Raw metadata. The known labels are lifted into the fields below. */
	metadata: DocumentMetadataEntry[];
	/** Last modification date (YYYY-MM-dd); what `since`/`until` filter on. */
	modifiedOn: string | null;
	/** From metadata "Mimetype". SPF also emit `plain/text` (sic). */
	mimeType: string | null;
	/** From metadata "Publicatiedatum" / "Date de publication" (YYYY-MM-dd). */
	publishedOn: string | null;
	/** From metadata "Externe referentie" / "Référence externe", when present. */
	externalReference: string | null;
}

export interface DocumentSearchResult {
	documents: MyMinFinDocument[];
	/** SPF's own count of matching documents, when the collection carries it. */
	total: number | null;
	/** When SPF last synchronized their cache; null if never or not reported. */
	lastSyncDate: string | null;
}

export interface DocumentDownloadParams {
	/** Owner type (required when downloading documents owned by another entity) */
	ownerType?: OwnerType;
	/** Owner identifier */
	ownerIdentifier?: string;
}

// ---------------------------------------------------------------------------
// Intervat API — VAT Returns
// ---------------------------------------------------------------------------

export interface VatSubmissionResult {
	/** UUID of the submission proof */
	uuid: string;
	/** Raw response body */
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export interface ProblemDetail {
	/** Problem type URI */
	type: string;
	/** Human-readable title */
	title: string;
	/** HTTP status code */
	status: number;
	/** Human-readable detail */
	detail: string;
	/** Error instance URI (tracking UUID) */
	instance?: string;
	/** Reference URL for the error type */
	href?: string;
}

export interface BusinessRuleError {
	vatNumber: string;
	sequenceNumber: number;
	type: "ERROR" | "WARNING";
	errorIdentifier: string;
	descriptions: {
		fr?: string;
		nl?: string;
		de?: string;
		en?: string;
	};
}

export interface BusinessValidationError extends ProblemDetail {
	businessrules: BusinessRuleError[];
}

/**
 * Base class for every error thrown by this package. Network failures and
 * aborted requests are wrapped in a `MyMinFinError` with `cause` set to the
 * original rejection; HTTP-level failures are the {@link MyMinFinApiError}
 * subclass.
 */
export class MyMinFinError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "MyMinFinError";
		this.cause = options?.cause;
	}
}

/**
 * Thrown for every non-OK HTTP response. `status` is the HTTP status code;
 * `problem` is the RFC 7807 body when the server sent one (Intervat business
 * validation errors extend it with `businessrules`). `details` aliases
 * `problem` for parity with the other HTTP clients in this repository.
 */
export class MyMinFinApiError extends MyMinFinError {
	readonly status: number;
	readonly problem: ProblemDetail | BusinessValidationError | undefined;
	/**
	 * Seconds to wait before calling again, from the `Retry-After` header of a
	 * 429. SPF rate-limit per company (one document search every 10 minutes,
	 * a handful of downloads a minute), so a caller should schedule around this
	 * rather than retry blindly.
	 */
	readonly retryAfterSeconds: number | undefined;

	constructor(
		message: string,
		status: number,
		problem?: ProblemDetail | BusinessValidationError,
		options?: { cause?: unknown; retryAfterSeconds?: number | undefined },
	) {
		super(message, options);
		this.name = "MyMinFinApiError";
		this.status = status;
		this.problem = problem;
		this.retryAfterSeconds = options?.retryAfterSeconds;
	}

	/** The response body, when it was a problem detail. Same value as `problem`. */
	get details(): ProblemDetail | BusinessValidationError | undefined {
		return this.problem;
	}
}
