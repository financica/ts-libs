import { describe, expect, it } from "vitest";
import {
	apiBase,
	oidcBase,
	authorizeUrl,
	tokenUrl,
	jwksUrl,
	discoveryUrl,
	issuerUrl,
	myminfinDocumentsUrl,
	intervatVatUrl,
} from "../src/endpoints";

describe("endpoints", () => {
	describe("test environment", () => {
		it("returns correct API base", () => {
			expect(apiBase("test")).toBe("https://wsapi-a.minfin.be");
		});

		it("returns correct OIDC base", () => {
			expect(oidcBase("test")).toBe("https://fediamapi-a.minfin.be");
		});

		it("returns correct authorize URL", () => {
			expect(authorizeUrl("test")).toBe(
				"https://fediamapi-a.minfin.be/sso/oauth2/authorize",
			);
		});

		it("returns correct token URL", () => {
			expect(tokenUrl("test")).toBe(
				"https://fediamapi-a.minfin.be/sso/oauth2/access_token",
			);
		});

		it("returns correct JWKS URL", () => {
			expect(jwksUrl("test")).toBe(
				"https://fediamapi-a.minfin.be/sso/oauth2/connect/jwk_uri",
			);
		});

		it("returns correct discovery URL", () => {
			expect(discoveryUrl("test")).toBe(
				"https://fediamapi-a.minfin.be/sso/oauth2/.well-known/openid-configuration",
			);
		});

		it("returns correct issuer URL", () => {
			expect(issuerUrl("test")).toBe("https://fediamapi-a.minfin.be/sso/oauth2");
		});

		it("returns correct MyMinFin documents URL", () => {
			expect(myminfinDocumentsUrl("test")).toBe(
				"https://wsapi-a.minfin.be/FineAPI/Generic/OAU/v2/documents",
			);
		});

		it("returns correct Intervat VAT URL", () => {
			expect(intervatVatUrl("test", "0123456789")).toBe(
				"https://wsapi-a.minfin.be/Intervat/api/OAU/v1/declaration/vat/0123456789",
			);
		});
	});

	describe("production environment", () => {
		it("returns correct API base", () => {
			expect(apiBase("production")).toBe("https://wsapi.minfin.fgov.be");
		});

		it("returns correct OIDC base", () => {
			expect(oidcBase("production")).toBe("https://fediamapi.minfin.fgov.be");
		});

		it("returns correct authorize URL", () => {
			expect(authorizeUrl("production")).toBe(
				"https://fediamapi.minfin.fgov.be/sso/oauth2/authorize",
			);
		});

		it("returns correct token URL", () => {
			expect(tokenUrl("production")).toBe(
				"https://fediamapi.minfin.fgov.be/sso/oauth2/access_token",
			);
		});

		it("returns correct MyMinFin documents URL", () => {
			expect(myminfinDocumentsUrl("production")).toBe(
				"https://wsapi.minfin.fgov.be/FineAPI/Generic/OAU/v2/documents",
			);
		});

		it("returns correct Intervat VAT URL", () => {
			expect(intervatVatUrl("production", "0806153934")).toBe(
				"https://wsapi.minfin.fgov.be/Intervat/api/OAU/v1/declaration/vat/0806153934",
			);
		});
	});
});
