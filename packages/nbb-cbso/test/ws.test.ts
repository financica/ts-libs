import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NbbCbsoApiError, NbbCbsoClient, NbbCbsoError } from "../src/ws/index.js";
import type { FetchLike } from "../src/ws/index.js";

// Bodies captured from the live service (ws.cbso.nbb.be).
const fixture = (name: string): string =>
	readFileSync(
		fileURLToPath(new URL(`./fixtures/ws/${name}`, import.meta.url)),
		"utf8",
	);

interface Call {
	url: string;
	headers: Record<string, string>;
}

const respond = (status: number, body: string | Uint8Array) => ({
	ok: status >= 200 && status < 300,
	status,
	text: async () =>
		typeof body === "string" ? body : new TextDecoder().decode(body),
	arrayBuffer: async () =>
		(typeof body === "string" ? new TextEncoder().encode(body) : body).slice()
			.buffer,
});

const clientFor = (
	route: (url: string, accept: string) => ReturnType<typeof respond>,
): { client: NbbCbsoClient; calls: Call[] } => {
	const calls: Call[] = [];
	const fetch: FetchLike = async (url, init) => {
		calls.push({ url, headers: init.headers });
		return route(url, init.headers["Accept"] ?? "");
	};
	return { client: new NbbCbsoClient({ subscriptionKey: "key-1", fetch }), calls };
};

describe("NbbCbsoClient.listDeposits", () => {
	it("maps the live reference list, newest exercise first", async () => {
		const { client, calls } = clientFor(() =>
			respond(200, fixture("references-0766280697.json")),
		);
		const deposits = await client.listDeposits("BE 0766.280.697");

		expect(calls[0]?.url).toBe(
			"https://ws.cbso.nbb.be/authentic/legalEntity/0766280697/references",
		);
		expect(calls[0]?.headers).toMatchObject({
			Accept: "application/json",
			"NBB-CBSO-Subscription-Key": "key-1",
		});
		expect(calls[0]?.headers["X-Request-Id"]).toMatch(/^[0-9a-f-]{36}$/);
		expect(deposits.map((d) => d.exercise.end)).toEqual([
			"2024-12-31",
			"2023-12-31",
			"2022-12-31",
			"2021-12-31",
		]);
		expect(deposits[0]).toMatchObject({
			referenceNumber: "2025-00410222",
			depositDate: "2025-08-27",
			exercise: { start: "2024-01-01", end: "2024-12-31" },
			model: "m87-f",
			pdfFiling: false,
			depositType: "Initial",
			enterpriseNumber: "0766280697",
			legalForm: "610",
			generalAssemblyDate: "2025-06-02",
			fulfillsLegalValidation: true,
			address: { street: "Rue du Poinçon", number: "51A", postalCode: "1000" },
		});
		expect(deposits[0]?.address).not.toHaveProperty("box", null);
	});

	it("filters by the exercise's closing year and lists nothing on a 404", async () => {
		const { client, calls } = clientFor(() =>
			respond(404, fixture("legal-entity-not-found.json")),
		);
		await expect(
			client.listDeposits("0766280697", { year: 2025 }),
		).resolves.toEqual([]);
		expect(calls[0]?.url).toMatch(/\/references\?year=2025$/);
	});

	it("drops the NBB's 9999-01-01 placeholder for a missing general meeting", async () => {
		const row = {
			...JSON.parse(fixture("references-0766280697.json"))[0],
			ModelType: "m908-p",
			GeneralAssemblyDate: "9999-01-01",
			DepositType: "Rectification",
		};
		const { client } = clientFor(() => respond(200, JSON.stringify([row])));
		const [deposit] = await client.listDeposits("0766280697");
		expect(deposit).toMatchObject({ pdfFiling: true, depositType: undefined });
		expect(deposit?.generalAssemblyDate).toBeUndefined();
	});

	it("rejects a malformed enterprise number before any request", async () => {
		const { client, calls } = clientFor(() => respond(200, "[]"));
		await expect(client.listDeposits("12345")).rejects.toBeInstanceOf(NbbCbsoError);
		expect(calls).toHaveLength(0);
	});
});

describe("NbbCbsoClient documents", () => {
	it("asks for each representation by its media type", async () => {
		const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
		const { client, calls } = clientFor((_url, accept) =>
			accept === "application/pdf"
				? respond(200, pdf)
				: accept === "application/x.xbrl"
					? respond(200, "<xbrli:xbrl/>")
					: respond(200, '{"ReferenceNumber":"2025-00410222","Rubrics":[]}'),
		);

		expect(await client.getPdf("2025-00410222")).toEqual(pdf);
		expect(await client.getXbrl("2025-00410222")).toBe("<xbrli:xbrl/>");
		expect(await client.getJson("2025-00410222")).toEqual({
			ReferenceNumber: "2025-00410222",
			Rubrics: [],
		});
		expect(calls.map((c) => c.headers["Accept"])).toEqual([
			"application/pdf",
			"application/x.xbrl",
			"application/x.jsonxbrl",
		]);
		expect(calls[0]?.url).toBe(
			"https://ws.cbso.nbb.be/authentic/deposit/2025-00410222/accountingData",
		);
	});

	it("returns null for a representation the NBB does not hold", async () => {
		const { client } = clientFor(() =>
			respond(404, fixture("no-xbrl-for-pdf-filing.json")),
		);
		await expect(client.getXbrl("2024-00069721")).resolves.toBeNull();
		await expect(client.getDeposit("2024-00069721")).resolves.toBeNull();
	});

	it("throws an API error with the body on any other failure", async () => {
		const body =
			'{ "statusCode": 401, "message": "Access denied due to invalid subscription key." }';
		const { client } = clientFor(() => respond(401, body));
		const error = await client.getPdf("2025-00410222").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NbbCbsoApiError);
		expect(error).toMatchObject({ status: 401, details: body });
	});

	it("wraps a network failure", async () => {
		const client = new NbbCbsoClient({
			subscriptionKey: "key-1",
			fetch: async () => {
				throw new TypeError("fetch failed");
			},
		});
		const error = await client.getPdf("2025-00410222").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NbbCbsoError);
		expect(error).not.toBeInstanceOf(NbbCbsoApiError);
		expect((error as NbbCbsoError).cause).toBeInstanceOf(TypeError);
	});
});
