import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BelcotaxClient, BelcotaxFeedbackError } from "../src/belcotax";
import { MyMinFinApiError, MyMinFinError } from "../src/types";

const BASE = "https://wsapi-a.minfin.be/belcotax-test/bulks/v1";

const fixtureJson = (name: string): unknown =>
	JSON.parse(
		readFileSync(new URL(`./fixtures/belcotax/${name}`, import.meta.url), "utf8"),
	) as unknown;

/** A stub Response: JSON body, status, optional content type. */
const jsonResponse = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const headersOf = (init: RequestInit): Record<string, string> =>
	(init.headers ?? {}) as Record<string, string>;

describe("BelcotaxClient", () => {
	const mockFetch = vi.fn<typeof fetch>();

	beforeEach(() => {
		mockFetch.mockReset();
	});

	const client = new BelcotaxClient({
		accessToken: "test-token-xyz",
		environment: "test",
		baseUrl: BASE,
		fetch: mockFetch,
	});

	const lastCall = (): { url: string; init: RequestInit } => {
		const call = mockFetch.mock.calls.at(-1);
		if (!call) throw new Error("fetch was not called");
		return { url: String(call[0]), init: call[1] ?? {} };
	};

	describe("submitBulk", () => {
		const jsonl = '{"$s":"urn:f:x:1","k":"F-1"}\n';

		it("posts the bulk as the multipart `content` file", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "123", count: 1 }));

			await client.submitBulk(jsonl);

			const { url, init } = lastCall();
			expect(url).toBe(`${BASE}/bulks/submit`);
			expect(init.method).toBe("POST");
			expect(init.body).toBeInstanceOf(FormData);
			const file = (init.body as FormData).get("content");
			expect(file).toBeInstanceOf(File);
			expect(await (file as File).text()).toBe(jsonl);
			expect((file as File).name).toBe("bulk.jsonl");
		});

		it("accepts the bulk as bytes", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "1", count: 1 }));

			await client.submitBulk(new TextEncoder().encode(jsonl), {
				fileName: "fiches-2026.jsonl",
			});

			const file = (lastCall().init.body as FormData).get("content") as File;
			expect(await file.text()).toBe(jsonl);
			expect(file.name).toBe("fiches-2026.jsonl");
		});

		it("sends the bearer token and a correlation id, and leaves the multipart boundary to fetch", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "1", count: 1 }));

			await client.submitBulk(jsonl);

			const headers = headersOf(lastCall().init);
			expect(headers["Authorization"]).toBe("Bearer test-token-xyz");
			expect(headers["Minfin-Ws-Correlation"]).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
			expect(headers).not.toHaveProperty("Content-Type");
		});

		it("returns the submission id and line count", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(200, { id: "bulk-42", count: 351 }),
			);

			await expect(client.submitBulk(jsonl)).resolves.toEqual({
				id: "bulk-42",
				count: 351,
			});
		});

		it("maps SPF's format-error feedback to a BelcotaxFeedbackError", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(
					400,
					fixtureJson("feedback-example_with_format_errors_fr.json"),
				),
			);

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(BelcotaxFeedbackError);
			expect(error).toBeInstanceOf(MyMinFinApiError);
			expect(error).toMatchObject({
				status: 400,
				message:
					"Des erreurs ont été rencontrées lors de la validation de lenvoi",
				issues: [
					{
						type: "urn:problem-type:belcotax:issue:invalidFormat:invalidFormat",
						title: "InvalidFormat",
						detail: "Format invalide : 100.0",
						line: 4,
						inputs: [{ in: "body", name: "/$/2076" }],
					},
				],
			});
		});

		it("keeps every input of a multi-field business issue and its fiche key", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(
					400,
					fixtureJson("feedback-example_with_business_errors_fr.json"),
				),
			);

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(BelcotaxFeedbackError);
			expect((error as BelcotaxFeedbackError).issues).toEqual([
				{
					type: "urn:problem-type:belcotax:issue:uNDEFINED:is2099Filled10",
					title: "is2099Filled10",
					detail: 'Au moins un champ 2.099 ("nature") est obligatoire si la zone 2076 est remplie.',
					key: "bc060677-b166-4db8-9fc2-41e7611d0e1e",
					line: 4,
					inputs: [
						{ in: "body", name: "/$/2076" },
						{ in: "body", name: "/$/2099" },
					],
				},
			]);
		});

		it("throws a plain MyMinFinApiError for a 400 that is not bulk feedback", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(400, {
					type: "urn:problem-type:belgif:badRequest",
					title: "Bad Request",
					status: 400,
					detail: "The input message is incorrect",
				}),
			);

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(MyMinFinApiError);
			expect(error).not.toBeInstanceOf(BelcotaxFeedbackError);
			expect(error).toMatchObject({
				status: 400,
				message: "The input message is incorrect",
			});
		});

		it("throws a MyMinFinApiError carrying the problem for other statuses", async () => {
			mockFetch.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						type: "urn:problem-type:belgif:missingScope",
						title: "Missing Scope",
						status: 403,
						detail: "Provided access token doesn't have the required scope",
					}),
					{
						status: 403,
						headers: { "content-type": "application/problem+json" },
					},
				),
			);

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(MyMinFinApiError);
			expect(error).toMatchObject({
				status: 403,
				message: "Provided access token doesn't have the required scope",
				problem: { type: "urn:problem-type:belgif:missingScope" },
			});
		});

		it("falls back to the status line when the error body is not JSON", async () => {
			mockFetch.mockResolvedValueOnce(
				new Response("<html>Bad Gateway</html>", {
					status: 502,
					statusText: "Bad Gateway",
				}),
			);

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(MyMinFinApiError);
			expect(error).toMatchObject({
				status: 502,
				message: "HTTP 502 Bad Gateway",
			});
		});

		it("refuses a 200 whose body is not a submission result", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 123 }));

			await expect(client.submitBulk(jsonl)).rejects.toThrow(MyMinFinError);
		});

		it("wraps a network failure in a MyMinFinError", async () => {
			mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

			const error = await client.submitBulk(jsonl).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(MyMinFinError);
			expect(error).not.toBeInstanceOf(MyMinFinApiError);
			expect((error as MyMinFinError).cause).toBeInstanceOf(TypeError);
		});
	});

	describe("getLastValidation", () => {
		it("reads the validation of a bulk, links included", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(200, {
					id: "v-1",
					requestDateTime: "2027-02-10T10:00:00Z",
					status: "rejected",
					links: [
						{
							rel: "feedback",
							href: `${BASE}/bulks/b%2F1/validations/last/feedback`,
						},
					],
				}),
			);

			const validation = await client.getLastValidation("b/1");

			expect(lastCall().url).toBe(`${BASE}/bulks/b%2F1/validations/last`);
			expect(headersOf(lastCall().init)["Authorization"]).toBe(
				"Bearer test-token-xyz",
			);
			expect(validation).toEqual({
				id: "v-1",
				requestDateTime: "2027-02-10T10:00:00Z",
				status: "rejected",
				links: [
					{
						rel: "feedback",
						href: `${BASE}/bulks/b%2F1/validations/last/feedback`,
					},
				],
			});
		});

		it.each(["accepted", "rejected", "inProgress"] as const)(
			"accepts the status %s",
			async (status) => {
				mockFetch.mockResolvedValueOnce(
					jsonResponse(200, {
						id: "v",
						requestDateTime: "2027-02-10T10:00:00Z",
						status,
					}),
				);
				await expect(client.getLastValidation("b")).resolves.toMatchObject({
					status,
					links: [],
				});
			},
		);

		it("refuses a status outside the spec rather than guess what it means", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(200, {
					id: "v",
					requestDateTime: "2027-02-10T10:00:00Z",
					status: "partiallyAccepted",
				}),
			);

			await expect(client.getLastValidation("b")).rejects.toThrow(
				/partiallyAccepted/,
			);
		});

		it("surfaces a 404 for an unknown bulk", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(404, {
					type: "urn:problem-type:belgif:resourceNotFound",
					title: "Resource not found",
					status: 404,
					detail: "No bulk b",
				}),
			);

			await expect(client.getLastValidation("b")).rejects.toMatchObject({
				status: 404,
				message: "No bulk b",
			});
		});
	});

	describe("getLastValidationFeedback", () => {
		it("returns the feedback document and its issues", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(
					200,
					fixtureJson("feedback-example_with_business_errors_fr.json"),
				),
			);

			const feedback = await client.getLastValidationFeedback("b-1");

			expect(lastCall().url).toBe(`${BASE}/bulks/b-1/validations/last/feedback`);
			expect(feedback).toMatchObject({
				type: "urn:problem-type:belcotax:feedback",
				title: "Bulk feedback",
				status: 400,
				issues: [
					{
						title: "is2099Filled10",
						key: "bc060677-b166-4db8-9fc2-41e7611d0e1e",
						line: 4,
					},
				],
			});
		});

		it("reads a feedback with no issues as an empty list", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse(200, {
					type: "urn:problem-type:belcotax:feedback",
					title: "Bulk feedback",
					status: 200,
				}),
			);

			await expect(client.getLastValidationFeedback("b")).resolves.toMatchObject({
				issues: [],
			});
		});
	});

	describe("checkHealth", () => {
		it("calls /health without a token", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(200, { status: "UP" }));

			await expect(client.checkHealth()).resolves.toEqual({ status: "UP" });

			expect(lastCall().url).toBe(`${BASE}/health`);
			expect(headersOf(lastCall().init)).not.toHaveProperty("Authorization");
		});

		it("reports DOWN from a 503 instead of throwing", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse(503, { status: "DOWN" }));

			await expect(client.checkHealth()).resolves.toEqual({ status: "DOWN" });
		});

		it("throws on any other failure", async () => {
			mockFetch.mockResolvedValueOnce(
				new Response("nope", { status: 500, statusText: "Server Error" }),
			);

			await expect(client.checkHealth()).rejects.toMatchObject({ status: 500 });
		});
	});
});
