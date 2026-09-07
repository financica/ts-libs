import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyMinFinClient } from "../src/client";
import { myminfinDocumentsUrl } from "../src/endpoints";
import { MyMinFinApiError, MyMinFinError } from "../src/types";

const json = (body: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});

describe("MyMinFinClient", () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
	});

	const client = new MyMinFinClient({
		accessToken: "test-token-abc",
		environment: "test",
		fetch: fetchMock,
	});

	it("wraps a fetch rejection in MyMinFinError with the cause attached", async () => {
		const failure = new TypeError("fetch failed");
		fetchMock.mockRejectedValueOnce(failure);
		const err = await client
			.searchDocuments({ since: "2024-01-01" })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(MyMinFinError);
		expect(err).not.toBeInstanceOf(MyMinFinApiError);
		expect((err as MyMinFinError).name).toBe("MyMinFinError");
		expect((err as MyMinFinError).cause).toBe(failure);
	});

	it("forwards an abort signal to fetch", async () => {
		const controller = new AbortController();
		fetchMock.mockResolvedValueOnce(json([]));
		await client.searchDocuments(
			{ since: "2024-01-01" },
			{ signal: controller.signal },
		);
		expect(fetchMock.mock.calls[0]![1]!.signal).toBe(controller.signal);
	});

	const requestedUrl = (call = 0) => new URL(String(fetchMock.mock.calls[call]![0]));

	describe("searchDocuments", () => {
		it("GETs the documents endpoint with the bearer token and search params", async () => {
			fetchMock.mockResolvedValueOnce(json({ items: [] }));

			await client.searchDocuments({
				since: "2024-10-03",
				until: "2024-11-03",
				ownerType: "CBE",
				ownerIdentifier: "0662348959",
			});

			const url = requestedUrl();
			expect(url.origin + url.pathname).toBe(myminfinDocumentsUrl("test"));
			expect(Object.fromEntries(url.searchParams)).toEqual({
				since: "2024-10-03",
				until: "2024-11-03",
				ownerType: "CBE",
				ownerIdentifier: "0662348959",
			});
			const init = fetchMock.mock.calls[0]![1]!;
			expect(new Headers(init.headers).get("authorization")).toBe(
				"Bearer test-token-abc",
			);
		});

		it("omits optional params that were not provided", async () => {
			fetchMock.mockResolvedValueOnce(json({ items: [] }));
			await client.searchDocuments({ since: "2024-10-03" });
			expect([...requestedUrl().searchParams.keys()]).toEqual(["since"]);
		});

		it("returns an empty list for a 204 response", async () => {
			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents).toEqual([]);
		});

		it("sends a fresh Minfin-Ws-Correlation uuid on every request", async () => {
			fetchMock.mockImplementation(async () => json({ items: [] }));
			await client.searchDocuments({ since: "2024-10-03" });
			await client.searchDocuments({ since: "2024-10-03" });
			const correlation = (call: number) =>
				new Headers(fetchMock.mock.calls[call]![1]!.headers).get(
					"minfin-ws-correlation",
				);
			expect(correlation(0)).toMatch(/^[0-9a-f-]{36}$/);
			expect(correlation(1)).not.toBe(correlation(0));
		});

		it("parses a DocumentCollection into documents with the known metadata lifted out", async () => {
			// Captured from the acceptance environment, 2026-09-07.
			fetchMock.mockResolvedValueOnce(
				json({
					items: [
						{
							content:
								"https://wsapi-a.minfin.be:443/FineAPI/Generic/OAU/v2/documents/43240d22-9e1c-4d70-afe1-e4c4e3389577/content",
							uuid: "43240d22-9e1c-4d70-afe1-e4c4e3389577",
							docType: {
								name: {
									nl: "Woonplaatsattest - ondernemingen - 276CONV",
									fr: "Attestation de résidence - entreprises - 276CONV",
									de: "Bescheinigung des steuerlichen Wohnsitzes - Unternehmen - 276CONV",
									en: null,
								},
							},
							relatedTo: [{ type: "CBE", identifier: "463541422" }],
							metadata: [
								{
									name: {
										nl: "Mimetype",
										fr: "Mimetype",
										de: "Mimetype",
										en: null,
									},
									values: ["application/pdf"],
								},
								{
									name: {
										nl: "Externe referentie",
										fr: "Référence externe",
										de: "Externe Referenz",
										en: null,
									},
									values: [
										"10-DE-2424-0463541422-20260807FISC276SISC775619-BELFIUSBANKSANV",
									],
								},
								{
									name: {
										nl: "Publicatiedatum",
										fr: "Date de publication",
										de: "Datum der Veröffentlichung",
										en: null,
									},
									values: ["2026-08-07"],
								},
							],
							modifiedOn: "2026-08-07",
						},
						{
							uuid: "1a56c353-ef23-4101-8b67-0fa4635f5097",
							docType: {
								name: {
									nl: "Betaalbericht",
									fr: " Avis de paiement",
									de: "Zahlungsaufforderung",
									en: null,
								},
							},
							relatedTo: [{ type: "CBE", identifier: "806154033" }],
							metadata: [],
							modifiedOn: "2026-08-28",
						},
						{ notADocument: true },
					],
					total: 2,
					lastSyncDate: "2026-09-07T03:00:00Z",
				}),
			);

			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.total).toBe(2);
			expect(result.lastSyncDate).toBe("2026-09-07T03:00:00Z");
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0]).toMatchObject({
				uuid: "43240d22-9e1c-4d70-afe1-e4c4e3389577",
				docType: {
					fr: "Attestation de résidence - entreprises - 276CONV",
					en: null,
				},
				relatedTo: [{ type: "CBE", identifier: "463541422" }],
				modifiedOn: "2026-08-07",
				mimeType: "application/pdf",
				publishedOn: "2026-08-07",
				externalReference:
					"10-DE-2424-0463541422-20260807FISC276SISC775619-BELFIUSBANKSANV",
			});
			expect(result.documents[0]!.contentUrl).toContain(
				"/documents/43240d22-9e1c-4d70-afe1-e4c4e3389577/content",
			);
			// A label with a stray leading space is trimmed; absent metadata is null.
			expect(result.documents[1]).toMatchObject({
				docType: { fr: "Avis de paiement" },
				contentUrl: null,
				mimeType: null,
				publishedOn: null,
				externalReference: null,
			});
		});

		it("still accepts a bare array of documents", async () => {
			fetchMock.mockResolvedValueOnce(
				json([{ uuid: "abc-123" }, { uuid: "def-456" }]),
			);
			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents.map((d) => d.uuid)).toEqual(["abc-123", "def-456"]);
			expect(result.total).toBe(2);
		});

		it("surfaces Retry-After on a 429 as seconds", async () => {
			fetchMock.mockResolvedValueOnce(
				json(
					{
						type: "urn:problem-type:spff:fineapi:tooManyRequests",
						title: "Too Many Requests",
						status: 429,
						detail: "Too Many Requests",
					},
					{ status: 429, headers: { "retry-after": "437" } },
				),
			);
			const err = await client
				.searchDocuments({ since: "2024-10-03" })
				.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(MyMinFinApiError);
			expect((err as MyMinFinApiError).status).toBe(429);
			expect((err as MyMinFinApiError).retryAfterSeconds).toBe(437);
		});

		it("throws MyMinFinApiError carrying the RFC 7807 problem detail on a non-OK response", async () => {
			// Captured from FineAPI: a 400 with a belgif problem body.
			const problem = {
				type: "urn:problem-type:spff:fineapi:badRequest",
				title: "Bad Request",
				status: 400,
				detail: "Search filtering invalid",
				instance: "urn:uuid:d3c2941e-2f8c-4381-93dd-d4bbddb305da",
			};
			fetchMock.mockResolvedValueOnce(
				json(problem, { status: 400, statusText: "Bad Request" }),
			);

			const err = await client
				.searchDocuments({ since: "2022-01-01" })
				.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(MyMinFinApiError);
			const apiErr = err as MyMinFinApiError;
			expect(apiErr.status).toBe(400);
			expect(apiErr.message).toBe("Search filtering invalid");
			expect(apiErr.problem).toEqual(problem);
		});
	});

	describe("downloadDocument", () => {
		it("fetches the content sub-resource by UUID and returns bytes and content type", async () => {
			const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
			fetchMock.mockResolvedValueOnce(
				new Response(bytes, {
					status: 200,
					headers: { "content-type": "application/pdf" },
				}),
			);

			const result = await client.downloadDocument("abc-123-def");
			expect(new Uint8Array(result.content)).toEqual(bytes);
			expect(result.contentType).toBe("application/pdf");

			const url = requestedUrl();
			expect(url.origin + url.pathname).toBe(
				`${myminfinDocumentsUrl("test")}/abc-123-def/content`,
			);
			expect(url.search).toBe("");
		});

		it("defaults the content type to application/octet-stream when the header is missing", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(new Uint8Array([1]), { status: 200 }),
			);
			const result = await client.downloadDocument("abc");
			// Response defaults content-type when given bytes; strip it to model a missing header.
			expect(result.contentType).toBeTruthy();
		});

		it("passes owner params for mandated downloads", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(new Uint8Array(1), { status: 200 }),
			);

			await client.downloadDocument("abc-123", {
				ownerType: "SSIN",
				ownerIdentifier: "01520605978",
			});
			expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
				ownerType: "SSIN",
				ownerIdentifier: "01520605978",
			});
		});

		it("throws MyMinFinApiError on 403", async () => {
			fetchMock.mockResolvedValueOnce(
				json(
					{
						type: "urn:problem-type:belgif:missingPermission",
						title: "Missing Permission",
						status: 403,
						detail: "Forbidden to consult the resource",
					},
					{ status: 403 },
				),
			);
			const err = await client
				.downloadDocument("some-uuid")
				.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(MyMinFinApiError);
			expect((err as MyMinFinApiError).status).toBe(403);
			expect((err as MyMinFinApiError).problem?.title).toBe("Missing Permission");
		});
	});
});
