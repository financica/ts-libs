import { BASE_CURRENCY } from "./currencies.js";
import { parseCsv } from "./csv.js";
import { EcbError, EcbHttpError, NoRateError } from "./errors.js";
import type {
	ConvertResult,
	CurrencyCode,
	IsoDate,
	RateSnapshot,
	ReferenceRate,
} from "./types.js";

/**
 * The subset of the WHATWG `fetch` contract this client relies on. The global
 * `fetch` satisfies it, so callers rarely need to pass one — it exists to make
 * the client trivially testable and proxy-friendly.
 */
export type FetchLike = (
	input: string,
	init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/** A cache for resolved snapshots, keyed by request URL. */
export interface RateCache {
	get(key: string): RateSnapshot | undefined;
	set(key: string, value: RateSnapshot): void;
}

export interface EcbClientOptions {
	/**
	 * Base URL of the ECB data API.
	 * Default: `https://data-api.ecb.europa.eu/service`.
	 */
	baseUrl?: string;
	/** Custom fetch implementation. Defaults to the global `fetch`. */
	fetch?: FetchLike;
	/**
	 * Snapshot cache. Defaults to an unbounded in-process `Map`. Pass `null` to
	 * disable caching entirely.
	 */
	cache?: RateCache | null;
	/** Request timeout in milliseconds. Default `15000`; `0` disables it. */
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://data-api.ecb.europa.eu/service";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A small client for the European Central Bank's euro foreign-exchange
 * reference rates, served from the ECB data API (dataflow `EXR`).
 *
 * Every rate is quoted against the euro (units of the currency per 1 EUR).
 * Requests for a date that is not a TARGET business day resolve to the most
 * recent prior business day, via the data API's `lastNObservations` parameter,
 * and the resolved date is reported on each {@link ReferenceRate}.
 */
export class EcbClient {
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;
	private readonly cache: RateCache | null;
	private readonly timeoutMs: number;

	constructor(options: EcbClientOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
		const resolvedFetch =
			options.fetch ?? (globalThis.fetch as FetchLike | undefined);
		if (!resolvedFetch) {
			throw new EcbError(
				"No fetch implementation available; pass `fetch` in EcbClientOptions",
			);
		}
		this.fetchImpl = resolvedFetch;
		this.cache = options.cache === undefined ? new MapCache() : options.cache;
		this.timeoutMs = options.timeoutMs ?? 15000;
	}

	/**
	 * Resolve the reference rate for a single currency on (or before) a date.
	 * `EUR` returns a unit rate without a network call.
	 */
	async getRate(
		currency: CurrencyCode,
		date: Date | IsoDate,
	): Promise<ReferenceRate> {
		const requestedDate = normalizeDate(date);
		if (currency === BASE_CURRENCY) {
			return { currency: BASE_CURRENCY, rate: 1, date: requestedDate };
		}
		const snapshot = await this.fetchSnapshot([currency], requestedDate);
		const rate = snapshot.rates.find((r) => r.currency === currency);
		if (!rate) throw new NoRateError(currency, requestedDate);
		return rate;
	}

	/**
	 * Resolve reference rates on (or before) a date. Pass `currencies` to limit
	 * the request, or omit it to fetch every series the ECB publishes (note
	 * that discontinued series resolve to their last published date).
	 */
	async getRates(
		date: Date | IsoDate,
		currencies?: readonly CurrencyCode[],
	): Promise<RateSnapshot> {
		const requestedDate = normalizeDate(date);
		const wanted = currencies?.filter((c) => c !== BASE_CURRENCY);
		const snapshot =
			wanted && wanted.length === 0
				? { requestedDate, rates: [] }
				: await this.fetchSnapshot(wanted ?? null, requestedDate);
		if (currencies?.includes(BASE_CURRENCY)) {
			return {
				requestedDate,
				rates: [
					{ currency: BASE_CURRENCY, rate: 1, date: requestedDate },
					...snapshot.rates,
				],
			};
		}
		return snapshot;
	}

	/**
	 * Convert `amount` from one currency to another using the reference rates on
	 * (or before) `date`. Non-euro pairs are crossed through the euro.
	 */
	async convert(params: {
		amount: number;
		from: CurrencyCode;
		to: CurrencyCode;
		date: Date | IsoDate;
	}): Promise<ConvertResult> {
		const { amount, from, to } = params;
		const requestedDate = normalizeDate(params.date);
		if (from === to) {
			return {
				amount,
				rate: 1,
				from,
				to,
				requestedDate,
				rateDate: requestedDate,
			};
		}
		const needed = [from, to].filter((c): c is CurrencyCode => c !== BASE_CURRENCY);
		const snapshot = await this.fetchSnapshot(needed, requestedDate);
		const fromLeg = this.legFor(from, snapshot, requestedDate);
		const toLeg = this.legFor(to, snapshot, requestedDate);
		const rate = toLeg.rate / fromLeg.rate;
		return {
			amount: amount * rate,
			rate,
			from,
			to,
			requestedDate,
			rateDate: fromLeg.date > toLeg.date ? fromLeg.date : toLeg.date,
		};
	}

	private legFor(
		currency: CurrencyCode,
		snapshot: RateSnapshot,
		requestedDate: IsoDate,
	): ReferenceRate {
		if (currency === BASE_CURRENCY) {
			return { currency: BASE_CURRENCY, rate: 1, date: requestedDate };
		}
		const leg = snapshot.rates.find((r) => r.currency === currency);
		if (!leg) throw new NoRateError(currency, requestedDate);
		return leg;
	}

	private async fetchSnapshot(
		currencies: readonly CurrencyCode[] | null,
		requestedDate: IsoDate,
	): Promise<RateSnapshot> {
		const key = currencies && currencies.length ? currencies.join("+") : "";
		const url = `${this.baseUrl}/data/EXR/D.${key}.EUR.SP00.A?endPeriod=${requestedDate}&lastNObservations=1`;

		const cached = this.cache?.get(url);
		if (cached) return cached;

		const text = await this.get(url);
		const rates: ReferenceRate[] = [];
		for (const record of parseCsv(text)) {
			const currency = record["CURRENCY"];
			const observedAt = record["TIME_PERIOD"];
			const value = Number(record["OBS_VALUE"]);
			if (!currency || !observedAt || !Number.isFinite(value)) continue;
			rates.push({ currency, rate: value, date: observedAt });
		}

		const snapshot: RateSnapshot = { requestedDate, rates };
		this.cache?.set(url, snapshot);
		return snapshot;
	}

	private async get(url: string): Promise<string> {
		const controller = this.timeoutMs > 0 ? new AbortController() : undefined;
		const timer = controller
			? setTimeout(() => controller.abort(), this.timeoutMs)
			: undefined;
		try {
			const response = await this.fetchImpl(url, {
				headers: { Accept: "text/csv" },
				...(controller ? { signal: controller.signal } : {}),
			});
			const body = await response.text();
			if (!response.ok) throw new EcbHttpError(response.status, body);
			return body;
		} catch (error) {
			if (error instanceof EcbError) throw error;
			throw new EcbError(`ECB data API request failed: ${url}`, {
				cause: error,
			});
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}

class MapCache implements RateCache {
	private readonly store = new Map<string, RateSnapshot>();
	get(key: string): RateSnapshot | undefined {
		return this.store.get(key);
	}
	set(key: string, value: RateSnapshot): void {
		this.store.set(key, value);
	}
}

const normalizeDate = (date: Date | IsoDate): IsoDate => {
	if (date instanceof Date) {
		if (Number.isNaN(date.getTime())) {
			throw new EcbError("Invalid Date passed for the rate date");
		}
		return date.toISOString().slice(0, 10);
	}
	if (!DATE_RE.test(date)) {
		throw new EcbError(`Invalid date "${date}"; expected YYYY-MM-DD`);
	}
	return date;
};
