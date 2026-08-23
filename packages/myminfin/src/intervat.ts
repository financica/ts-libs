import { intervatOpenApiUrl, intervatVatUrl } from "./endpoints";
import { assertOk, authorizedFetch, resolveFetch } from "./http";
import type { ClientConfig, Environment, VatSubmissionResult } from "./types";

/** MIME types Intervat accepts for an uploaded declaration. */
type IntervatContentType = "application/xml" | "application/zip";

/**
 * Client for the Intervat VAT return submission API.
 *
 * Allows submitting VAT returns in XML format. Requires a valid OAuth2
 * access token obtained via {@link MyMinFinAuth}.
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
	 * Submit a VAT return for a given VAT number.
	 *
	 * @param vatNumber - The VAT number (10 digits, no dots)
	 * @param xml - The VAT return XML content (conforming to the Intervat XSD)
	 * @returns Submission result including the proof UUID
	 */
	submitVatReturn(
		vatNumber: string,
		xml: string,
		options?: { signal?: AbortSignal },
	): Promise<VatSubmissionResult> {
		return this.submit(vatNumber, xml, "application/xml", options?.signal);
	}

	/**
	 * Submit a VAT return from a file (XML or renamed ZIP with annexes).
	 *
	 * @param vatNumber - The VAT number (10 digits, no dots)
	 * @param file - File content as a Buffer or Uint8Array
	 * @param contentType - MIME type ("application/xml" or "application/zip")
	 */
	submitVatReturnFile(
		vatNumber: string,
		file: Buffer | Uint8Array,
		contentType: IntervatContentType = "application/xml",
		options?: { signal?: AbortSignal },
	): Promise<VatSubmissionResult> {
		return this.submit(vatNumber, Buffer.from(file), contentType, options?.signal);
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
		vatNumber: string,
		body: BodyInit,
		contentType: IntervatContentType,
		signal?: AbortSignal,
	): Promise<VatSubmissionResult> {
		const res = await authorizedFetch(
			this.fetchImpl,
			intervatVatUrl(this.environment, vatNumber),
			this.accessToken,
			{
				method: "POST",
				headers: {
					"Content-Type": contentType,
					Accept: "application/json",
				},
				body,
				signal,
			},
		);

		await assertOk(res);
		return (await res.json()) as VatSubmissionResult;
	}
}
