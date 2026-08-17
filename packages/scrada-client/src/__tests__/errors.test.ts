import { describe, expect, it } from "vitest";
import {
	ScradaApiError,
	scradaApiErrorFromResponse,
	summarizeScradaErrorDetails,
} from "../errors";

describe("summarizeScradaErrorDetails", () => {
	it("returns null for empty input", () => {
		expect(summarizeScradaErrorDetails(null)).toBeNull();
		expect(summarizeScradaErrorDetails(undefined)).toBeNull();
		expect(summarizeScradaErrorDetails({})).toBeNull();
		expect(summarizeScradaErrorDetails([])).toBeNull();
	});

	it("returns the message field of a flat error object", () => {
		expect(summarizeScradaErrorDetails({ message: "Bad request" })).toBe(
			"Bad request",
		);
	});

	it("walks nested errors and validationErrors arrays", () => {
		const summary = summarizeScradaErrorDetails({
			errors: [
				{ message: "VAT total mismatch" },
				{ detail: "supplier vatStatus missing" },
			],
		});
		expect(summary).toBe("VAT total mismatch | supplier vatStatus missing");
	});

	it("collapses repeated whitespace and trims", () => {
		expect(
			summarizeScradaErrorDetails({ message: "  too   many\n\nspaces  " }),
		).toBe("too many spaces");
	});

	it("includes Scrada-style 'defaultFormat' messages", () => {
		expect(
			summarizeScradaErrorDetails({
				defaultFormat: "50,4 VAT difference left for 0% VAT",
			}),
		).toBe("50,4 VAT difference left for 0% VAT");
	});

	it("caps the number of distinct messages it joins", () => {
		const big = {
			errors: Array.from({ length: 20 }, (_, i) => ({ message: `e${i}` })),
		};
		const summary = summarizeScradaErrorDetails(big);
		expect(summary?.split(" | ").length).toBeLessThanOrEqual(6);
	});

	it("walks string arrays", () => {
		expect(summarizeScradaErrorDetails(["one", "two"])).toBe("one | two");
	});

	it("dedupes identical messages", () => {
		expect(summarizeScradaErrorDetails(["a", "a"])).toBe("a");
		expect(
			summarizeScradaErrorDetails({ message: "a", errors: [{ detail: "a" }] }),
		).toBe("a");
	});

	it("walks nested modelState fields and picks error-ish keys only", () => {
		// ASP.NET-style modelState: field name → array of messages.
		expect(
			summarizeScradaErrorDetails({
				modelState: { "invoice.lines[0].vatType": ["vatType is required"] },
			}),
		).toBe("vatType is required");
		// Unknown string keys are only surfaced when the key looks like an error.
		expect(
			summarizeScradaErrorDetails({ vatError: "bad VAT", note: "ignored" }),
		).toBe("bad VAT");
	});
});

describe("scradaApiErrorFromResponse", () => {
	it("parses a JSON body and surfaces the message", async () => {
		const body = JSON.stringify({
			defaultFormat: "50,4 VAT difference left for 0% VAT",
		});
		const response = new Response(body, {
			status: 500,
			headers: { "content-type": "application/json" },
		});

		const error = await scradaApiErrorFromResponse(response);

		expect(error).toBeInstanceOf(ScradaApiError);
		expect(error.status).toBe(500);
		expect(error.message).toBe("50,4 VAT difference left for 0% VAT");
	});

	it("falls back to the status-based message when the body has no usable strings", async () => {
		const response = new Response("", { status: 502 });
		const error = await scradaApiErrorFromResponse(response);
		expect(error.message).toBe("Scrada request failed with status 502");
	});

	it("preserves a non-JSON text body in details", async () => {
		const response = new Response("upstream timeout", { status: 504 });
		const error = await scradaApiErrorFromResponse(response);
		expect(error.details).toBe("upstream timeout");
		expect(error.message).toBe("upstream timeout");
	});
});
