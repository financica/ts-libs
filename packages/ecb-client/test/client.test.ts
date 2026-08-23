import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { EcbClient } from "../src/client.js";
import type { FetchLike } from "../src/client.js";
import type { RateSnapshot } from "../src/types.js";
import { EcbError, EcbHttpError, NoRateError } from "../src/errors.js";

const fixture = (name: string): string =>
	readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

// Maps `${seriesKey}|${endPeriod}` to the captured ECB response that the live
// data API returns for that exact request.
const FIXTURES: Record<string, string> = {
	"D.USD.EUR.SP00.A|2024-01-15": "usd-2024-01-15.csv",
	"D.USD.EUR.SP00.A|2024-01-13": "usd-2024-01-13-weekend.csv",
	"D.USD.EUR.SP00.A|1998-01-02": "empty.csv",
	"D.GBP.EUR.SP00.A|2024-01-15": "gbp-2024-01-15.csv",
	"D.USD+GBP.EUR.SP00.A|2024-01-15": "usd-gbp-2024-01-15.csv",
	"D.GBP+USD.EUR.SP00.A|2024-01-15": "usd-gbp-2024-01-15.csv",
	"D.USD+GBP+CHF.EUR.SP00.A|2024-01-15": "subset-2024-01-15.csv",
	"D..EUR.SP00.A|2024-01-15": "all-2024-01-15.csv",
	"D.USD+GBP.EUR.SP00.A|2024-01-11|2024-01-15":
		"usd-gbp-series-2024-01-11-2024-01-15.csv",
};

const buildFetch = (): { fetch: FetchLike; calls: string[] } => {
	const calls: string[] = [];
	const fetch: FetchLike = async (url) => {
		calls.push(url);
		const series = url.match(
			/\/data\/EXR\/([^?]+)\?startPeriod=(\d{4}-\d{2}-\d{2})&endPeriod=(\d{4}-\d{2}-\d{2})/,
		);
		if (series) {
			const file = FIXTURES[`${series[1]}|${series[2]}|${series[3]}`];
			if (file === undefined) {
				return { ok: false, status: 404, text: async () => `no fixture` };
			}
			return { ok: true, status: 200, text: async () => fixture(file) };
		}
		const match = url.match(
			/\/data\/EXR\/([^?]+)\?.*endPeriod=(\d{4}-\d{2}-\d{2})/,
		);
		const key = match?.[1] && match[2] ? `${match[1]}|${match[2]}` : url;
		const file = FIXTURES[key];
		if (file === undefined) {
			return {
				ok: false,
				status: 404,
				text: async () => `no fixture for ${key}`,
			};
		}
		return { ok: true, status: 200, text: async () => fixture(file) };
	};
	return { fetch, calls };
};

describe("EcbClient.getRate", () => {
	let calls: string[];
	let client: EcbClient;
	beforeEach(() => {
		const f = buildFetch();
		calls = f.calls;
		client = new EcbClient({ fetch: f.fetch });
	});

	it("returns the rate and effective date for a business day", async () => {
		const rate = await client.getRate("USD", "2024-01-15");
		expect(rate).toEqual({ currency: "USD", rate: 1.0945, date: "2024-01-15" });
	});

	it("falls back to the most recent prior business day on a weekend", async () => {
		// 2024-01-13 is a Saturday; ECB's last observation is Friday the 12th.
		const rate = await client.getRate("USD", "2024-01-13");
		expect(rate.date).toBe("2024-01-12");
		expect(rate.rate).toBe(1.0942);
	});

	it("returns a unit rate for EUR without any network call", async () => {
		const rate = await client.getRate("EUR", "2024-01-15");
		expect(rate).toEqual({ currency: "EUR", rate: 1, date: "2024-01-15" });
		expect(calls).toHaveLength(0);
	});

	it("accepts a Date object", async () => {
		const rate = await client.getRate("USD", new Date("2024-01-15T12:00:00Z"));
		expect(rate.rate).toBe(1.0945);
	});

	it("throws NoRateError when no observation exists", async () => {
		await expect(client.getRate("USD", "1998-01-02")).rejects.toBeInstanceOf(
			NoRateError,
		);
	});

	it("caches snapshots by request", async () => {
		await client.getRate("USD", "2024-01-15");
		await client.getRate("USD", "2024-01-15");
		expect(calls).toHaveLength(1);
	});

	it("throws EcbHttpError with the status on a non-2xx response", async () => {
		const error = await client.getRate("USD", "2024-02-29").catch((e) => e);
		expect(error).toBeInstanceOf(EcbHttpError);
		expect((error as EcbHttpError).status).toBe(404);
	});

	it("rejects a malformed date", async () => {
		await expect(client.getRate("USD", "15/01/2024")).rejects.toBeInstanceOf(
			EcbError,
		);
	});

	it("rejects an invalid Date object before building a URL", async () => {
		const f = buildFetch();
		const local = new EcbClient({ fetch: f.fetch });
		await expect(
			local.getRate("USD", new Date("not a date")),
		).rejects.toBeInstanceOf(EcbError);
		expect(f.calls).toHaveLength(0);
	});

	it("normalizes a Date in UTC, not local time", async () => {
		// 23:30 UTC on the 15th is already the 16th in any zone east of UTC+0:30.
		await client.getRate("USD", new Date("2024-01-15T23:30:00Z"));
		expect(calls[0]).toContain("endPeriod=2024-01-15");
	});

	it("wraps a rejected fetch in EcbError and keeps the cause", async () => {
		const failure = new TypeError("fetch failed");
		const local = new EcbClient({
			fetch: async () => {
				throw failure;
			},
		});
		const error = await local.getRate("USD", "2024-01-15").catch((e) => e);
		expect(error).toBeInstanceOf(EcbError);
		expect(error).not.toBeInstanceOf(EcbHttpError);
		expect((error as EcbError).cause).toBe(failure);
	});

	it("surfaces a timeout as EcbError with the abort as cause", async () => {
		const local = new EcbClient({
			timeoutMs: 5,
			fetch: (_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason ?? new Error("aborted")),
					);
				}),
		});
		const error = await local.getRate("USD", "2024-01-15").catch((e) => e);
		expect(error).toBeInstanceOf(EcbError);
		expect(error).not.toBeInstanceOf(EcbHttpError);
		expect((error as EcbError).name).toBe("EcbError");
		expect((error as EcbError).cause).toBeInstanceOf(Error);
		expect(((error as EcbError).cause as Error).name).toBe("AbortError");
	});

	it("passes an abort signal by default and none when timeoutMs is 0", async () => {
		const seen: (AbortSignal | undefined)[] = [];
		const spy: FetchLike = async (url, init) => {
			seen.push(init?.signal);
			return buildFetch().fetch(url, init);
		};
		await new EcbClient({ fetch: spy }).getRate("USD", "2024-01-15");
		await new EcbClient({ fetch: spy, timeoutMs: 0 }).getRate("USD", "2024-01-15");
		expect(seen[0]).toBeInstanceOf(AbortSignal);
		expect(seen[1]).toBeUndefined();
	});

	it("refetches every time when cache is null", async () => {
		const f = buildFetch();
		const local = new EcbClient({ fetch: f.fetch, cache: null });
		await local.getRate("USD", "2024-01-15");
		await local.getRate("USD", "2024-01-15");
		expect(f.calls).toHaveLength(2);
	});

	it("uses a custom RateCache keyed by request URL", async () => {
		const store = new Map<string, RateSnapshot>();
		const f = buildFetch();
		const local = new EcbClient({
			fetch: f.fetch,
			cache: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
		});
		await local.getRate("USD", "2024-01-15");
		expect([...store.keys()]).toEqual([f.calls[0]]);
		await local.getRate("USD", "2024-01-15");
		expect(f.calls).toHaveLength(1);
		// A different date is a different URL, so a different cache entry.
		await local.getRate("USD", "2024-01-13");
		expect(store.size).toBe(2);
	});
});

describe("EcbClient.getRates", () => {
	let client: EcbClient;
	beforeEach(() => {
		client = new EcbClient({ fetch: buildFetch().fetch });
	});

	it("resolves a requested subset", async () => {
		const snapshot = await client.getRates("2024-01-15", ["USD", "GBP", "CHF"]);
		const byCurrency = Object.fromEntries(
			snapshot.rates.map((r) => [r.currency, r.rate]),
		);
		expect(byCurrency["USD"]).toBe(1.0945);
		expect(byCurrency["GBP"]).toBe(0.86075);
		expect(byCurrency["CHF"]).toBeTypeOf("number");
	});

	it("includes EUR as a unit rate when requested", async () => {
		const snapshot = await client.getRates("2024-01-15", ["EUR", "USD"]);
		const eur = snapshot.rates.find((r) => r.currency === "EUR");
		expect(eur).toEqual({ currency: "EUR", rate: 1, date: "2024-01-15" });
		expect(snapshot.rates.find((r) => r.currency === "USD")?.rate).toBe(1.0945);
	});

	it("returns an empty snapshot for [] and for EUR alone without a call", async () => {
		const f = buildFetch();
		const local = new EcbClient({ fetch: f.fetch });
		expect(await local.getRates("2024-01-15", [])).toEqual({
			requestedDate: "2024-01-15",
			rates: [],
		});
		expect(await local.getRates("2024-01-15", ["EUR"])).toEqual({
			requestedDate: "2024-01-15",
			rates: [{ currency: "EUR", rate: 1, date: "2024-01-15" }],
		});
		expect(f.calls).toHaveLength(0);
	});

	it("returns only the currencies that have an observation (partial data)", async () => {
		// The USD+GBP fixture stands in for a response where one requested series
		// (CHF) yields no observation. Pinned: getRates reports what the ECB
		// returned rather than throwing — callers that need every currency use
		// getRate/convert, which raise NoRateError for the missing leg.
		const local = new EcbClient({
			fetch: async () => ({
				ok: true,
				status: 200,
				text: async () => fixture("usd-gbp-2024-01-15.csv"),
			}),
		});
		const snapshot = await local.getRates("2024-01-15", ["USD", "GBP", "CHF"]);
		expect(snapshot.rates.map((r) => r.currency).sort()).toEqual(["GBP", "USD"]);
	});

	it("skips rows whose OBS_VALUE is blank or not a finite number, never yielding a 0 or NaN rate", async () => {
		const header = "KEY,CURRENCY,TIME_PERIOD,OBS_VALUE";
		const local = new EcbClient({
			fetch: async () => ({
				ok: true,
				status: 200,
				text: async () =>
					`${header}\nEXR.D.USD.EUR.SP00.A,USD,2024-01-15,1.0945\nEXR.D.GBP.EUR.SP00.A,GBP,2024-01-15,\nEXR.D.CHF.EUR.SP00.A,CHF,2024-01-15,NaN\n`,
			}),
		});
		const snapshot = await local.getRates("2024-01-15", ["USD", "GBP", "CHF"]);
		expect(snapshot.rates).toEqual([
			{ currency: "USD", rate: 1.0945, date: "2024-01-15" },
		]);
	});

	it("returns discontinued series at their own last-published date", async () => {
		const snapshot = await client.getRates("2024-01-15");
		expect(snapshot.rates.length).toBeGreaterThan(30);
		const ars = snapshot.rates.find((r) => r.currency === "ARS");
		// ECB stopped publishing ARS daily; its last observation predates 2024.
		expect(ars?.date).toBe("2020-10-30");
	});
});

describe("EcbClient.getSeries", () => {
	let calls: string[];
	let client: EcbClient;
	beforeEach(() => {
		const f = buildFetch();
		calls = f.calls;
		client = new EcbClient({ fetch: f.fetch });
	});

	it("returns the whole window in one request, sorted by [date, currency], with weekends absent", async () => {
		const series = await client.getSeries("2024-01-11", "2024-01-15", [
			"USD",
			"GBP",
		]);
		expect(calls).toHaveLength(1);
		expect(series).toMatchObject({ from: "2024-01-11", to: "2024-01-15" });
		// 11, 12 and 15 January 2024 are TARGET business days; the 13th/14th are a
		// weekend and must be absent, not back-filled. Two currencies × three days.
		expect(series.rates).toHaveLength(6);
		expect(new Set(series.rates.map((r) => r.date))).toEqual(
			new Set(["2024-01-11", "2024-01-12", "2024-01-15"]),
		);
		const sorted = [...series.rates].sort(
			(a, b) =>
				a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency),
		);
		expect(series.rates).toEqual(sorted);
		for (const rate of series.rates) {
			expect(rate.date >= series.from && rate.date <= series.to).toBe(true);
		}
	});

	it("drops EUR from the request and makes no call for EUR alone", async () => {
		const series = await client.getSeries("2024-01-11", "2024-01-15", ["EUR"]);
		expect(series.rates).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("caches the window by request", async () => {
		await client.getSeries("2024-01-11", "2024-01-15", ["USD", "GBP"]);
		await client.getSeries("2024-01-11", "2024-01-15", ["USD", "GBP"]);
		expect(calls).toHaveLength(1);
	});

	it("rejects an inverted range", async () => {
		await expect(
			client.getSeries("2024-01-15", "2024-01-11", ["USD"]),
		).rejects.toBeInstanceOf(EcbError);
	});
});

describe("EcbClient.convert", () => {
	let client: EcbClient;
	beforeEach(() => {
		client = new EcbClient({ fetch: buildFetch().fetch });
	});

	it("converts a foreign amount to EUR", async () => {
		const result = await client.convert({
			amount: 100,
			from: "USD",
			to: "EUR",
			date: "2024-01-15",
		});
		expect(result.amount).toBeCloseTo(100 / 1.0945, 10);
		expect(result.rate).toBeCloseTo(1 / 1.0945, 12);
		expect(result.rateDate).toBe("2024-01-15");
	});

	it("converts EUR to a foreign amount", async () => {
		const result = await client.convert({
			amount: 100,
			from: "EUR",
			to: "USD",
			date: "2024-01-15",
		});
		expect(result.amount).toBeCloseTo(109.45, 10);
		expect(result.rate).toBe(1.0945);
	});

	it("crosses two foreign currencies through the euro", async () => {
		const result = await client.convert({
			amount: 100,
			from: "USD",
			to: "GBP",
			date: "2024-01-15",
		});
		expect(result.rate).toBeCloseTo(0.86075 / 1.0945, 12);
		expect(result.amount).toBeCloseTo((100 * 0.86075) / 1.0945, 10);
	});

	it("reports the later of the two legs' dates as rateDate", async () => {
		// USD last observed on the 15th, ARS discontinued on 2020-10-30 (see the
		// all-currencies fixture): the cross rate is only as fresh as its newest leg.
		const local = new EcbClient({
			fetch: async () => ({
				ok: true,
				status: 200,
				text: async () => fixture("all-2024-01-15.csv"),
			}),
		});
		const result = await local.convert({
			amount: 1,
			from: "ARS",
			to: "USD",
			date: "2024-01-15",
		});
		expect(result.rateDate).toBe("2024-01-15");
	});

	it("round-trips: rate(A→B) × rate(B→A) ≈ 1", async () => {
		const there = await client.convert({
			amount: 1,
			from: "USD",
			to: "GBP",
			date: "2024-01-15",
		});
		const back = await client.convert({
			amount: 1,
			from: "GBP",
			to: "USD",
			date: "2024-01-15",
		});
		expect(there.rate * back.rate).toBeCloseTo(1, 12);
	});

	it("is a no-op for identical currencies and makes no request", async () => {
		const f = buildFetch();
		const local = new EcbClient({ fetch: f.fetch });
		const result = await local.convert({
			amount: 42,
			from: "USD",
			to: "USD",
			date: "2024-01-15",
		});
		expect(result).toMatchObject({ amount: 42, rate: 1 });
		expect(f.calls).toHaveLength(0);
	});
});
