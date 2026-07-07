import { intervatOpenApiUrl, intervatVatUrl } from "./endpoints";
import { assertOk, authorizedFetch } from "./http";
import type {
	ClientConfig,
	Environment,
	VatSubmissionResult,
} from "./types";

/**
 * Client for the Intervat VAT return submission API.
 *
 * Allows submitting VAT returns in XML format. Requires a valid OAuth2
 * access token obtained via {@link MyMinFinAuth}.
 */
export class IntervatClient {
	private readonly accessToken: string;
	private readonly environment: Environment;

	constructor(config: ClientConfig) {
		this.accessToken = config.accessToken;
		this.environment = config.environment;
	}

	/**
	 * Submit a VAT return for a given VAT number.
	 *
	 * @param vatNumber - The VAT number (10 digits, no dots)
	 * @param xml - The VAT return XML content (conforming to the Intervat XSD)
	 * @returns Submission result including the proof UUID
	 */
	submitVatReturn(vatNumber: string, xml: string): Promise<VatSubmissionResult> {
		return this.submit(vatNumber, xml, "application/xml");
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
		contentType: "application/xml" | "application/zip" = "application/xml",
	): Promise<VatSubmissionResult> {
		return this.submit(vatNumber, Buffer.from(file), contentType);
	}

	/**
	 * Download the OpenAPI specification YAML for the Intervat API.
	 */
	async getOpenApiSpec(): Promise<string> {
		const res = await authorizedFetch(
			intervatOpenApiUrl(this.environment),
			this.accessToken,
			{ headers: { Accept: "application/octet-stream" } },
		);
		await assertOk(res);
		return res.text();
	}

	private async submit(
		vatNumber: string,
		body: BodyInit,
		contentType: string,
	): Promise<VatSubmissionResult> {
		const res = await authorizedFetch(
			intervatVatUrl(this.environment, vatNumber),
			this.accessToken,
			{
				method: "POST",
				headers: {
					"Content-Type": contentType,
					Accept: "application/json",
				},
				body,
			},
		);

		await assertOk(res);
		return (await res.json()) as VatSubmissionResult;
	}
}
