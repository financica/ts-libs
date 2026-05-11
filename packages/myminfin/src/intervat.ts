import { intervatVatUrl } from "./endpoints.js";
import { assertOk } from "./client.js";
import type {
	ClientConfig,
	BusinessValidationError,
	VatSubmissionResult,
} from "./types.js";
import { MyMinFinApiError } from "./types.js";

/**
 * Client for the Intervat VAT return submission API.
 *
 * Allows submitting VAT returns in XML format. Requires a valid OAuth2
 * access token obtained via {@link MyMinFinAuth}.
 */
export class IntervatClient {
	private readonly accessToken: string;
	private readonly config: ClientConfig;

	constructor(config: ClientConfig) {
		this.accessToken = config.accessToken;
		this.config = config;
	}

	/**
	 * Submit a VAT return for a given VAT number.
	 *
	 * @param vatNumber - The VAT number (10 digits, no dots)
	 * @param xml - The VAT return XML content (conforming to the Intervat XSD)
	 * @returns Submission result including the proof UUID
	 */
	async submitVatReturn(
		vatNumber: string,
		xml: string,
	): Promise<VatSubmissionResult> {
		const url = intervatVatUrl(this.config.environment, vatNumber);

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/xml",
				Accept: "application/json",
			},
			body: xml,
		});

		if (!res.ok) {
			let problem: BusinessValidationError | undefined;
			try {
				problem = (await res.json()) as BusinessValidationError;
			} catch {
				// Not JSON
			}

			const message =
				problem?.detail ??
				problem?.title ??
				`HTTP ${res.status} ${res.statusText}`;
			throw new MyMinFinApiError(message, res.status, problem);
		}

		const json = (await res.json()) as VatSubmissionResult;
		return json;
	}

	/**
	 * Submit a VAT return from a file (XML or renamed ZIP with annexes).
	 *
	 * @param vatNumber - The VAT number (10 digits, no dots)
	 * @param file - File content as a Buffer or Uint8Array
	 * @param contentType - MIME type ("application/xml" or "application/zip")
	 */
	async submitVatReturnFile(
		vatNumber: string,
		file: Buffer | Uint8Array,
		contentType: "application/xml" | "application/zip" = "application/xml",
	): Promise<VatSubmissionResult> {
		const url = intervatVatUrl(this.config.environment, vatNumber);

		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": contentType,
				Accept: "application/json",
			},
			body: Buffer.from(file),
		});

		if (!res.ok) {
			let problem: BusinessValidationError | undefined;
			try {
				problem = (await res.json()) as BusinessValidationError;
			} catch {
				// Not JSON
			}

			const message =
				problem?.detail ??
				problem?.title ??
				`HTTP ${res.status} ${res.statusText}`;
			throw new MyMinFinApiError(message, res.status, problem);
		}

		const json = (await res.json()) as VatSubmissionResult;
		return json;
	}

	/**
	 * Download the OpenAPI specification YAML for the Intervat API.
	 */
	async getOpenApiSpec(): Promise<string> {
		const base =
			this.config.environment === "test"
				? "https://wsapi-a.minfin.be"
				: "https://wsapi.fgov.minfin.be";

		const url = `${base}/Intervat/api/OAU/v1/doc/intervat-external-api.yaml`;

		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				Accept: "application/octet-stream",
			},
		});

		await assertOk(res);
		return res.text();
	}
}
