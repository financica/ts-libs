import { describe, expect, it } from "vitest";
import {
	apiBase,
	authorizeUrl,
	discoveryUrl,
	intervatOpenApiUrl,
	intervatVatUrl,
	issuerUrl,
	jwksUrl,
	myminfinDocumentsUrl,
	oidcBase,
	tokenUrl,
} from "../src/endpoints";
import type { Environment } from "../src/types";

describe("endpoints", () => {
	// Hosts are external identifiers published by SPF Finances: the FediamAPI
	// authorization server and the WSAPI gateway, each with an acceptance ("-a")
	// and a production host. Getting one wrong means talking to the wrong system.
	it.each<[Environment, string, string]>([
		["test", "https://wsapi-a.minfin.be", "https://fediamapi-a.minfin.be"],
		[
			"production",
			"https://wsapi.minfin.fgov.be",
			"https://fediamapi.minfin.fgov.be",
		],
	])("%s environment pins the WSAPI and FediamAPI hosts", (env, api, oidc) => {
		expect(apiBase(env)).toBe(api);
		expect(oidcBase(env)).toBe(oidc);
	});

	it.each<Environment>(["test", "production"])(
		"%s: every derived URL hangs off its base and the VAT URL ends with the VAT number",
		(env) => {
			for (const fn of [
				authorizeUrl,
				tokenUrl,
				jwksUrl,
				discoveryUrl,
				issuerUrl,
			]) {
				expect(fn(env).startsWith(`${oidcBase(env)}/`)).toBe(true);
			}
			for (const fn of [myminfinDocumentsUrl, intervatOpenApiUrl]) {
				expect(fn(env).startsWith(`${apiBase(env)}/`)).toBe(true);
			}
			const vatUrl = intervatVatUrl(env, "0806153934");
			expect(vatUrl.startsWith(`${apiBase(env)}/`)).toBe(true);
			expect(vatUrl.endsWith("/0806153934")).toBe(true);
			// OIDC endpoints are children of the issuer (OpenID Connect Discovery 1.0 §4).
			for (const fn of [authorizeUrl, tokenUrl, jwksUrl, discoveryUrl]) {
				expect(fn(env).startsWith(`${issuerUrl(env)}/`)).toBe(true);
			}
		},
	);
});
