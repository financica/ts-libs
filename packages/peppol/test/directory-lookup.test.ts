import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPeppolDirectory } from "../src/directory-lookup";

const PARTICIPANT = "iso6523-actorid-upis::9925:BE0123456789";

const stubFetch = (response: Response) => {
	const fetchMock = vi.fn(async (_input: string | URL | Request) => response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("lookupPeppolDirectory", () => {
	it("queries the directory search endpoint for the canonical participant id", async () => {
		const fetchMock = stubFetch(jsonResponse({ matches: [] }));
		await lookupPeppolDirectory(PARTICIPANT);
		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.origin).toBe("https://directory.peppol.eu");
		expect(url.searchParams.get("participant")).toBe(PARTICIPANT);
	});

	// The directory's `name` shape changed across versions: legacy string vs.
	// `[{ name, language }]` list. Both must yield the same entry.
	it.each([
		["legacy string name", "  Acme NV  "],
		["multilingual name list", [{ name: "Acme NV", language: "nl" }]],
		[
			"name list with an empty leading entry",
			[
				{ name: "", language: "fr" },
				{ name: "Acme NV", language: "nl" },
			],
		],
	])("extracts the entity name from a %s", async (_label, name) => {
		stubFetch(
			jsonResponse({
				matches: [{ entities: [{ name, countryCode: "BE" }] }],
			}),
		);
		await expect(lookupPeppolDirectory(PARTICIPANT)).resolves.toEqual({
			name: "Acme NV",
			countryCode: "BE",
		});
	});

	it("returns null fields when the entity carries no usable name/country", async () => {
		stubFetch(
			jsonResponse({ matches: [{ entities: [{ name: [], countryCode: "" }] }] }),
		);
		await expect(lookupPeppolDirectory(PARTICIPANT)).resolves.toEqual({
			name: null,
			countryCode: null,
		});
	});

	it.each([
		["no matches", jsonResponse({ matches: [] })],
		["a match without entities", jsonResponse({ matches: [{ entities: [] }] })],
		["a non-OK status", jsonResponse({ matches: [] }, 503)],
		["a non-JSON body", new Response("<html>oops</html>", { status: 200 })],
	])("returns null on %s", async (_label, response) => {
		stubFetch(response);
		await expect(lookupPeppolDirectory(PARTICIPANT)).resolves.toBeNull();
	});

	it("returns null when the request itself fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed");
			}),
		);
		await expect(lookupPeppolDirectory(PARTICIPANT)).resolves.toBeNull();
	});
});
