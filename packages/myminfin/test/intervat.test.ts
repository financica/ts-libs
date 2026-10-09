import { describe, expect, it, vi, beforeEach } from "vitest";
import { IntervatClient } from "../src/intervat";
import { zipSingleFile } from "../src/zip";
import { MyMinFinApiError } from "../src/types";

describe("IntervatClient", () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		mockFetch.mockReset();
	});

	const client = new IntervatClient({
		accessToken: "test-token-xyz",
		environment: "test",
		fetch: mockFetch,
	});

	describe("submitVatReturn", () => {
		const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:VATConsignment VATDeclarationsNbr="1"
  xmlns="http://www.minfin.fgov.be/InputCommon"
  xmlns:ns2="http://www.minfin.fgov.be/VATConsignment">
  <ns2:VATDeclaration SequenceNumber="1">
    <ns2:Declarant>
      <VATNumber>0000000097</VATNumber>
    </ns2:Declarant>
  </ns2:VATDeclaration>
</ns2:VATConsignment>`;

		it("sends the XML zipped to the declaration URL", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ uuid: "result-uuid-123" }),
			});

			await client.submitVatReturn("0806153934", sampleXml);

			expect(mockFetch).toHaveBeenCalledWith(
				"https://wsapi-a.minfin.be/Intervat/api/OAU/v1/declaration/tva/0806153934",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer test-token-xyz",
						"Content-Type": "application/zip",
					}),
					body: Buffer.from(zipSingleFile("declaration.xml", sampleXml)),
				}),
			);
		});

		it("returns submission result with UUID", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ uuid: "proof-uuid-abc" }),
			});

			const result = await client.submitVatReturn("0806153934", sampleXml);
			expect(result.uuid).toBe("proof-uuid-abc");
		});

		it("throws on business validation error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: () =>
					Promise.resolve({
						businessrules: [
							{
								vatNumber: "0806153934",
								sequenceNumber: 1,
								type: "ERROR",
								errorIdentifier: "E_TVA_DECLARANT_REGIME_NOT_ALLOWED",
								descriptions: {
									en: "Tax regime does not allow submission",
								},
							},
						],
						type: "about:blank",
						title: "Business validation error detected",
						status: 400,
						detail: "One or multiple business rules occurs",
						instance: "error:uuid:EC57A32618844DC49AEF90329E5085BD",
					}),
			});

			try {
				await client.submitVatReturn("0806153934", sampleXml);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(MyMinFinApiError);
				const err = e as MyMinFinApiError;
				expect(err.status).toBe(400);
				expect(err.problem).toBeDefined();
				const problem = err.problem as {
					businessrules: Array<{ errorIdentifier: string }>;
				};
				expect(problem.businessrules).toHaveLength(1);
				expect(problem.businessrules[0]!.errorIdentifier).toBe(
					"E_TVA_DECLARANT_REGIME_NOT_ALLOWED",
				);
			}
		});
	});

	describe("submitDeclaration", () => {
		it("posts a client listing to its own declaration type", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ uuid: "lc-uuid" }),
			});

			await client.submitDeclaration("lc", "0806153934", "<xml/>");

			expect(String(mockFetch.mock.calls[0]![0])).toBe(
				"https://wsapi-a.minfin.be/Intervat/api/OAU/v1/declaration/lc/0806153934",
			);
		});

		it("sends a ready-made archive untouched", async () => {
			const archive = zipSingleFile("return.xml", "<xml/>");

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ uuid: "zip-uuid" }),
			});

			await client.submitDeclarationArchive("tva", "0806153934", archive);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						"Content-Type": "application/zip",
					}),
					body: Buffer.from(archive),
				}),
			);
		});
	});

	describe("production environment", () => {
		it("uses production URLs", async () => {
			const prodClient = new IntervatClient({
				accessToken: "prod-token",
				environment: "production",
				fetch: mockFetch,
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ uuid: "prod-uuid" }),
			});

			await prodClient.submitVatReturn("0806153934", "<xml/>");

			const url = String(mockFetch.mock.calls[0]![0]);
			expect(
				url.startsWith(
					"https://wsapi.minfin.fgov.be/Intervat/api/OAU/v1/declaration/tva/",
				),
			).toBe(true);
		});
	});
});
