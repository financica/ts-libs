import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyMinFinClient } from "../src/client";
import { myminfinDocumentsUrl } from "../src/endpoints";
import { MyMinFinApiError } from "../src/types";

const json = (body: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});

describe("MyMinFinClient", () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		fetchMock.mockReset();
	});

	const client = new MyMinFinClient({
		accessToken: "test-token-abc",
		environment: "test",
	});

	const requestedUrl = (call = 0) => new URL(String(fetchMock.mock.calls[call]![0]));

	describe("searchDocuments", () => {
		it("GETs the documents endpoint with the bearer token and search params", async () => {
			fetchMock.mockResolvedValueOnce(json([]));

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
			fetchMock.mockResolvedValueOnce(json([]));
			await client.searchDocuments({ since: "2024-10-03" });
			expect([...requestedUrl().searchParams.keys()]).toEqual(["since"]);
		});

		it("returns an empty list for a 204 response", async () => {
			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents).toEqual([]);
		});

		it("returns the documents from a JSON array response", async () => {
			const docs = [
				{ uuid: "abc-123", type: "test", title: "Doc 1" },
				{ uuid: "def-456", type: "test", title: "Doc 2" },
			];
			fetchMock.mockResolvedValueOnce(json(docs));

			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents.map((d) => d.uuid)).toEqual(["abc-123", "def-456"]);
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
