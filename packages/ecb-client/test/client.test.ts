import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { EcbClient } from "../src/client.js";
import type { FetchLike } from "../src/client.js";
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

	it("returns the whole window in one request, oldest first", async () => {
		const series = await client.getSeries("2024-01-11", "2024-01-15", [
			"USD",
			"GBP",
		]);
		expect(calls).toHaveLength(1);
		expect(series).toMatchObject({ from: "2024-01-11", to: "2024-01-15" });
		expect(series.rates.map((r) => [r.date, r.currency, r.rate])).toEqual([
			["2024-01-11", "GBP", 0.86123],
			["2024-01-11", "USD", 1.0968],
			["2024-01-12", "GBP", 0.8604],
			["2024-01-12", "USD", 1.0953],
			["2024-01-15", "GBP", 0.86075],
			["2024-01-15", "USD", 1.0945],
		]);
	});

	it("omits non-business days rather than carrying the prior rate forward", async () => {
		const series = await client.getSeries("2024-01-11", "2024-01-15", [
			"USD",
			"GBP",
		]);
		// 13 and 14 January 2024 are a weekend: absent, not back-filled.
		expect(series.rates.some((r) => r.date === "2024-01-13")).toBe(false);
		expect(series.rates.some((r) => r.date === "2024-01-14")).toBe(false);
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
