import {
	type DeclarationType,
	intervatDeclarationUrl,
	intervatOpenApiUrl,
} from "./endpoints";
import { assertOk, authorizedFetch, resolveFetch } from "./http";
import type { ClientConfig, Environment, VatSubmissionResult } from "./types";
import { zipSingleFile } from "./zip";

/**
 * Client for the Intervat declaration submission API.
 *
 * Intervat takes a declaration as a ZIP holding one XML file (annexes may ride
 * along); a bare `application/xml` body is refused with a 415. Requires a valid
 * OAuth2 access token obtained via {@link MyMinFinAuth}.
 */
export class IntervatClient {
	private readonly accessToken: string;
	private readonly environment: Environment;
	private readonly fetchImpl: typeof fetch;

	constructor(config: ClientConfig) {
		this.accessToken = config.accessToken;
		this.environment = config.environment;
		this.fetchImpl = resolveFetch(config.fetch);
	}

	/**
	 * Submit a VAT return, zipped for you.
	 *
	 * @param vatNumber - The declarant's VAT number (10 digits, no dots)
	 * @param xml - The `VATConsignment` XML (conforming to the Intervat XSD)
	 * @returns Submission result including the proof UUID
	 */
	submitVatReturn(
		vatNumber: string,
		xml: string,
		options?: { signal?: AbortSignal },
	): Promise<VatSubmissionResult> {
		return this.submitDeclaration("tva", vatNumber, xml, options);
	}

	/**
	 * Submit any declaration Intervat takes (VAT return, client listing, EC
	 * sales list, ...), zipping the XML for you.
	 *
	 * @param declarationType - Which declaration, e.g. `"tva"` or `"lc"`
	 * @param ownerIdentifier - The declarant's VAT number (10 digits, no dots)
	 * @param xml - The consignment XML (conforming to its XSD)
	 */
	submitDeclaration(
		declarationType: DeclarationType,
		ownerIdentifier: string,
		xml: string,
		options?: { signal?: AbortSignal },
	): Promise<VatSubmissionResult> {
		return this.submitDeclarationArchive(
			declarationType,
			ownerIdentifier,
			zipSingleFile("declaration.xml", xml),
			options,
		);
	}

	/**
	 * Submit a ready-made ZIP, for a declaration that carries annexes.
	 */
	submitDeclarationArchive(
		declarationType: DeclarationType,
		ownerIdentifier: string,
		archive: Uint8Array,
		options?: { signal?: AbortSignal },
	): Promise<VatSubmissionResult> {
		return this.submit(declarationType, ownerIdentifier, archive, options?.signal);
	}

	/**
	 * Download the OpenAPI specification YAML for the Intervat API.
	 */
	async getOpenApiSpec(options?: { signal?: AbortSignal }): Promise<string> {
		const res = await authorizedFetch(
			this.fetchImpl,
			intervatOpenApiUrl(this.environment),
			this.accessToken,
			{
				headers: { Accept: "application/octet-stream" },
				signal: options?.signal,
			},
		);
		await assertOk(res);
		return res.text();
	}

	private async submit(
		declarationType: DeclarationType,
		ownerIdentifier: string,
		archive: Uint8Array,
		signal?: AbortSignal,
	): Promise<VatSubmissionResult> {
		const res = await authorizedFetch(
			this.fetchImpl,
			intervatDeclarationUrl(this.environment, declarationType, ownerIdentifier),
			this.accessToken,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/zip",
					Accept: "application/json",
				},
				body: Buffer.from(archive),
				signal,
			},
		);

		await assertOk(res);
		return (await res.json()) as VatSubmissionResult;
	}
}
