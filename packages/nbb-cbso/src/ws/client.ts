import { NbbCbsoApiError, NbbCbsoError } from "../errors.js";
import type { DepositAddress, DepositFormat, DepositReference } from "./types.js";

/**
 * The subset of the WHATWG `fetch` contract this client relies on. The global
 * `fetch` satisfies it; pass one to test the client or route it via a proxy.
 */
export type FetchLike = (
	input: string,
	init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{
	ok: boolean;
	status: number;
	text: () => Promise<string>;
	arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export interface NbbCbsoClientOptions {
	/** Primary or secondary key of the "Authentic Data" subscription. */
	subscriptionKey: string;
	/** Default `https://ws.cbso.nbb.be` (UAT: `https://ws.uat2.cbso.nbb.be`). */
	baseUrl?: string;
	/** Custom fetch implementation. Defaults to the global `fetch`. */
	fetch?: FetchLike;
	/** Request timeout in milliseconds. Default `30000`; `0` disables it. */
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://ws.cbso.nbb.be";
const ENTERPRISE_RE = /^\d{10}$/;
const REFERENCE_RE = /^\d{4}-\d{8}$/;

const ACCEPT: Record<DepositFormat, string> = {
	pdf: "application/pdf",
	xbrl: "application/x.xbrl",
	json: "application/x.jsonxbrl",
};

/**
 * Client for the Central Balance Sheet Office's "Authentic Data Query" web
 * service: the filings a legal entity has deposited, and each filing's PDF,
 * XBRL or JSON representation.
 *
 * A 404 is an answer, not a failure: a legal entity with no filing (or none
 * for the requested year) lists as `[]`, and a representation the NBB does not
 * hold (an XBRL for a PDF filing, any document of a pre-1999 filing) is `null`.
 */
export class NbbCbsoClient {
	private readonly baseUrl: string;
	private readonly subscriptionKey: string;
	private readonly fetchImpl: FetchLike;
	private readonly timeoutMs: number;

	constructor(options: NbbCbsoClientOptions) {
		if (!options.subscriptionKey) {
			throw new NbbCbsoError("A subscription key is required");
		}
		this.subscriptionKey = options.subscriptionKey;
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
		const resolvedFetch =
			options.fetch ?? (globalThis.fetch as FetchLike | undefined);
		if (!resolvedFetch) {
			throw new NbbCbsoError(
				"No fetch implementation available; pass `fetch` in NbbCbsoClientOptions",
			);
		}
		this.fetchImpl = resolvedFetch;
		this.timeoutMs = options.timeoutMs ?? 30000;
	}

	/**
	 * Every published filing of a legal entity, newest exercise first. `year`
	 * narrows to the exercise ending in that calendar year.
	 */
	async listDeposits(
		enterpriseNumber: string,
		options: { year?: number } = {},
	): Promise<DepositReference[]> {
		const id = normalizeEnterpriseNumber(enterpriseNumber);
		const query = options.year === undefined ? "" : `?year=${options.year}`;
		const response = await this.request(
			`/authentic/legalEntity/${id}/references${query}`,
			"application/json",
		);
		if (!response) return [];
		const body = parseJson(await response.text());
		if (!Array.isArray(body)) {
			throw new NbbCbsoError("Expected an array of deposit references");
		}
		return body
			.map(toDepositReference)
			.sort((a, b) => b.exercise.end.localeCompare(a.exercise.end));
	}

	/** One filing's reference, or `null` when the NBB has no such reference. */
	async getDeposit(referenceNumber: string): Promise<DepositReference | null> {
		const response = await this.request(
			`/authentic/deposit/${normalizeReference(referenceNumber)}/reference`,
			"application/json",
		);
		return response ? toDepositReference(parseJson(await response.text())) : null;
	}

	/** The filing's PDF, as the NBB publishes it (generated from XBRL for an XBRL filing). */
	async getPdf(referenceNumber: string): Promise<Uint8Array | null> {
		const response = await this.document(referenceNumber, "pdf");
		return response ? new Uint8Array(await response.arrayBuffer()) : null;
	}

	/** The XBRL instance as deposited; `null` for a PDF filing. */
	async getXbrl(referenceNumber: string): Promise<string | null> {
		const response = await this.document(referenceNumber, "xbrl");
		return response ? response.text() : null;
	}

	/**
	 * The NBB's JSON rendering of an XBRL filing (rubrics, administrators,
	 * shareholders, participating interests); `null` for a PDF filing or one
	 * deposited before 4 April 2022.
	 */
	async getJson(referenceNumber: string): Promise<Record<string, unknown> | null> {
		const response = await this.document(referenceNumber, "json");
		if (!response) return null;
		const body = parseJson(await response.text());
		if (!isRecord(body)) throw new NbbCbsoError("Expected a JSON object");
		return body;
	}

	private document(referenceNumber: string, format: DepositFormat) {
		return this.request(
			`/authentic/deposit/${normalizeReference(referenceNumber)}/accountingData`,
			ACCEPT[format],
		);
	}

	/** One GET; resolves `null` on a 404, throws on any other non-2xx. */
	private async request(path: string, accept: string) {
		const controller = this.timeoutMs > 0 ? new AbortController() : undefined;
		const timer = controller
			? setTimeout(() => controller.abort(), this.timeoutMs)
			: undefined;
		try {
			const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
				headers: {
					Accept: accept,
					"NBB-CBSO-Subscription-Key": this.subscriptionKey,
					// Required: the service answers 500 without one.
					"X-Request-Id": crypto.randomUUID(),
				},
				...(controller ? { signal: controller.signal } : {}),
			});
			if (response.status === 404) return null;
			if (!response.ok) {
				throw new NbbCbsoApiError(response.status, await response.text(), path);
			}
			return response;
		} catch (error) {
			if (error instanceof NbbCbsoError) throw error;
			throw new NbbCbsoError(`CBSO web services request failed: ${path}`, {
				cause: error,
			});
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}

const normalizeEnterpriseNumber = (value: string): string => {
	const digits = value.replace(/^BE/i, "").replace(/[\s.]/g, "");
	const id = digits.length === 9 ? `0${digits}` : digits;
	if (!ENTERPRISE_RE.test(id)) {
		throw new NbbCbsoError(`Invalid enterprise number "${value}"`);
	}
	return id;
};

const normalizeReference = (value: string): string => {
	if (!REFERENCE_RE.test(value)) {
		throw new NbbCbsoError(
			`Invalid deposit reference "${value}"; expected YYYY-NNNNNNNN`,
		);
	}
	return value;
};

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new NbbCbsoError("CBSO web services returned invalid JSON", {
			cause: error,
		});
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const str = (record: Record<string, unknown>, key: string): string | undefined => {
	const value = record[key];
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const required = (record: Record<string, unknown>, key: string): string => {
	const value = str(record, key);
	if (value === undefined) {
		throw new NbbCbsoError(`Deposit reference is missing ${key}`);
	}
	return value;
};

const toAddress = (value: unknown): DepositAddress => {
	if (!isRecord(value)) return {};
	return {
		street: str(value, "Street"),
		number: str(value, "Number"),
		box: str(value, "Box"),
		postalCode: str(value, "PostalCode"),
		city: str(value, "City"),
		countryCode: str(value, "CountryCode"),
	};
};

/** The NBB's placeholder for a filing that names no general meeting. */
const NO_ASSEMBLY = "9999-01-01";

const toDepositReference = (value: unknown): DepositReference => {
	if (!isRecord(value)) throw new NbbCbsoError("Expected a deposit reference object");
	const exercise = isRecord(value["ExerciseDates"]) ? value["ExerciseDates"] : {};
	const model = required(value, "ModelType");
	const depositType = str(value, "DepositType");
	const assembly = str(value, "GeneralAssemblyDate");
	return {
		referenceNumber: required(value, "ReferenceNumber"),
		depositDate: required(value, "DepositDate"),
		exercise: {
			start: required(exercise, "startDate"),
			end: required(exercise, "endDate"),
		},
		model,
		pdfFiling: model.endsWith("-p"),
		depositType:
			depositType === "Initial" || depositType === "Correction"
				? depositType
				: undefined,
		language: required(value, "Language"),
		currency: required(value, "Currency"),
		enterpriseNumber: required(value, "EnterpriseNumber"),
		enterpriseName: required(value, "EnterpriseName").replace(/\s+/g, " "),
		address: toAddress(value["Address"]),
		legalForm: str(value, "LegalForm"),
		legalSituation: str(value, "LegalSituation"),
		activityCode: str(value, "ActivityCode"),
		generalAssemblyDate: assembly === NO_ASSEMBLY ? undefined : assembly,
		fulfillsLegalValidation: value["FullFillLegalValidation"] === true,
	};
};
