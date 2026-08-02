import type { Environment } from "./types";

const ENDPOINTS = {
	test: {
		api: "https://wsapi-a.minfin.be",
		oidc: "https://fediamapi-a.minfin.be",
	},
	production: {
		api: "https://wsapi.minfin.fgov.be",
		oidc: "https://fediamapi.minfin.fgov.be",
	},
} as const;

export function apiBase(env: Environment): string {
	return ENDPOINTS[env].api;
}

export function oidcBase(env: Environment): string {
	return ENDPOINTS[env].oidc;
}

export function authorizeUrl(env: Environment): string {
	return `${oidcBase(env)}/sso/oauth2/authorize`;
}

export function tokenUrl(env: Environment): string {
	return `${oidcBase(env)}/sso/oauth2/access_token`;
}

export function jwksUrl(env: Environment): string {
	return `${oidcBase(env)}/sso/oauth2/connect/jwk_uri`;
}

export function discoveryUrl(env: Environment): string {
	return `${oidcBase(env)}/sso/oauth2/.well-known/openid-configuration`;
}

export function issuerUrl(env: Environment): string {
	return `${oidcBase(env)}/sso/oauth2`;
}

export function myminfinDocumentsUrl(env: Environment): string {
	return `${apiBase(env)}/FineAPI/Generic/OAU/v2/documents`;
}

export function intervatVatUrl(env: Environment, vatNumber: string): string {
	return `${apiBase(env)}/Intervat/api/OAU/v1/declaration/vat/${vatNumber}`;
}

export function intervatOpenApiUrl(env: Environment): string {
	return `${apiBase(env)}/Intervat/api/OAU/v1/doc/intervat-external-api.yaml`;
}
