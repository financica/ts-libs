import { describe, expect, it, vi, beforeEach } from "vitest";
import { MyMinFinClient } from "../src/client";
import { MyMinFinApiError } from "../src/types";

describe("MyMinFinClient", () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	const client = new MyMinFinClient({
		accessToken: "test-token-abc",
		environment: "test",
	});

	describe("searchDocuments", () => {
		it("sends correct request with since param", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve([]),
			});

			await client.searchDocuments({ since: "2024-10-03" });

			expect(mockFetch).toHaveBeenCalledWith(
				"https://wsapi-a.minfin.be/FineAPI/Generic/OAU/v2/documents?since=2024-10-03",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-token-abc",
					}),
				}),
			);
		});

		it("includes ownerType and ownerIdentifier when provided", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve([]),
			});

			await client.searchDocuments({
				since: "2024-10-03",
				ownerType: "CBE",
				ownerIdentifier: "0662348959",
			});

			const url = String(mockFetch.mock.calls[0]![0]);
			expect(url).toContain("ownerType=CBE");
			expect(url).toContain("ownerIdentifier=0662348959");
		});

		it("returns empty documents for 204 response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 204,
			});

			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents).toEqual([]);
		});

		it("returns documents from JSON array response", async () => {
			const docs = [
				{ uuid: "abc-123", type: "test", title: "Doc 1" },
				{ uuid: "def-456", type: "test", title: "Doc 2" },
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve(docs),
			});

			const result = await client.searchDocuments({ since: "2024-10-03" });
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0]!.uuid).toBe("abc-123");
		});

		it("throws MyMinFinApiError on 400", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: () =>
					Promise.resolve({
						type: "urn:problem-type:spff:fineapi:badRequest",
						title: "Bad Request",
						status: 400,
						detail: "Search filtering invalid",
						instance: "urn:uuid:d3c2941e-2f8c-4381-93dd-d4bbddb305da",
					}),
			});

			await expect(
				client.searchDocuments({ since: "2022-01-01" }),
			).rejects.toThrow(MyMinFinApiError);
		});

		it("includes problem detail in error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: () =>
					Promise.resolve({
						type: "urn:problem-type:belgif:missingPermission",
						title: "Missing Permission",
						status: 403,
						detail: "Not allowed",
					}),
			});

			try {
				await client.searchDocuments({ since: "2024-10-03" });
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(MyMinFinApiError);
				const err = e as MyMinFinApiError;
				expect(err.status).toBe(403);
				expect(err.problem?.title).toBe("Missing Permission");
			}
		});
	});

	describe("downloadDocument", () => {
		it("fetches document content by UUID", async () => {
			const content = new ArrayBuffer(100);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				arrayBuffer: () => Promise.resolve(content),
				headers: new Headers({ "content-type": "application/pdf" }),
			});

			const result = await client.downloadDocument("abc-123-def");
			expect(result.content).toBe(content);
			expect(result.contentType).toBe("application/pdf");

			const url = String(mockFetch.mock.calls[0]![0]);
			expect(url).toContain("/documents/abc-123-def/content");
		});

		it("includes owner params when provided", async () => {
			const content = new ArrayBuffer(10);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				arrayBuffer: () => Promise.resolve(content),
				headers: new Headers({
					"content-type": "application/octet-stream",
				}),
			});

			await client.downloadDocument("abc-123", {
				ownerType: "SSIN",
				ownerIdentifier: "01520605978",
			});

			const url = String(mockFetch.mock.calls[0]![0]);
			expect(url).toContain("ownerType=SSIN");
			expect(url).toContain("ownerIdentifier=01520605978");
		});

		it("throws on 403 forbidden", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: () =>
					Promise.resolve({
						type: "urn:problem-type:belgif:missingPermission",
						title: "Missing Permission",
						status: 403,
						detail: "Forbidden to consult the resource",
					}),
			});

			await expect(
				client.downloadDocument("some-uuid"),
			).rejects.toThrow(MyMinFinApiError);
		});
	});

	describe("production environment", () => {
		it("uses production URLs", async () => {
			const prodClient = new MyMinFinClient({
				accessToken: "prod-token",
				environment: "production",
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve([]),
			});

			await prodClient.searchDocuments({ since: "2024-10-03" });

			const url = String(mockFetch.mock.calls[0]![0]);
			expect(
				url.startsWith(
					"https://wsapi.minfin.fgov.be/FineAPI/Generic/OAU/v2/documents",
				),
			).toBe(true);
		});
	});
});
