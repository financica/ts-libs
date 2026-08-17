import { describe, expect, it } from "vitest";
import {
	isStripeInvoiceUrl,
	parseStripeInvoiceUrl,
	parseStripeReceiptUrl,
	unwrapTrackedStripeUrl,
} from "../src/urls.js";

describe("parseStripeInvoiceUrl", () => {
	it("parses a live Stripe invoice URL", () => {
		const result = parseStripeInvoiceUrl(
			"https://invoice.stripe.com/i/acct_1IktXpIA795jFTKS/live_YWNjdF8xSWt0WHBJQTc5NWpGVEtT",
		);
		expect(result).toEqual({
			accountId: "acct_1IktXpIA795jFTKS",
			liveToken: "live_YWNjdF8xSWt0WHBJQTc5NWpGVEtT",
		});
	});

	it("parses a test Stripe invoice URL", () => {
		const result = parseStripeInvoiceUrl(
			"https://invoice.stripe.com/i/acct_ABC123/test_XYZ789abc",
		);
		expect(result).toEqual({
			accountId: "acct_ABC123",
			liveToken: "test_XYZ789abc",
		});
	});

	it("strips query parameters", () => {
		const result = parseStripeInvoiceUrl(
			"https://invoice.stripe.com/i/acct_1IktXpIA795jFTKS/live_token123?s=pd",
		);
		expect(result).toEqual({
			accountId: "acct_1IktXpIA795jFTKS",
			liveToken: "live_token123",
		});
	});

	it("returns null for non-Stripe URLs", () => {
		expect(parseStripeInvoiceUrl("https://example.com/invoice")).toBeNull();
		expect(parseStripeInvoiceUrl("https://stripe.com/invoices")).toBeNull();
		expect(parseStripeInvoiceUrl("not a url")).toBeNull();
	});

	it("returns null for malformed Stripe URLs", () => {
		expect(parseStripeInvoiceUrl("https://invoice.stripe.com/i/")).toBeNull();
		expect(
			parseStripeInvoiceUrl("https://invoice.stripe.com/i/acct_123"),
		).toBeNull();
	});

	it("parses a pay.stripe.com PDF URL", () => {
		const result = parseStripeInvoiceUrl(
			"https://pay.stripe.com/invoice/acct_1MExQ9BjIQrRQnux/live_YWNjdF8xTUV4UTlCaklRclJRbnV4LF9TbXNFejJlVWJPeEFVRnFDWTVsbGJzM2NDVnFGczZWLDE2NTM1OTcwMQ0200z8nXi2Qr/pdf?s=ap",
		);
		expect(result).toEqual({
			accountId: "acct_1MExQ9BjIQrRQnux",
			liveToken:
				"live_YWNjdF8xTUV4UTlCaklRclJRbnV4LF9TbXNFejJlVWJPeEFVRnFDWTVsbGJzM2NDVnFGczZWLDE2NTM1OTcwMQ0200z8nXi2Qr",
		});
	});

	it("parses a pay.stripe.com URL without trailing path", () => {
		const result = parseStripeInvoiceUrl(
			"https://pay.stripe.com/invoice/acct_ABC123/test_token456",
		);
		expect(result).toEqual({
			accountId: "acct_ABC123",
			liveToken: "test_token456",
		});
	});
});

describe("parseStripeReceiptUrl", () => {
	// The base64url token embeds "acct_1A65pgIvcqWR3dFD" in its protobuf payload.
	const token =
		"CAcQARoXChVhY2N0XzFBNjVwZ0l2Y3FXUjNkRkQojbD-zgYyBnpiOFm0SjosFpx5MYYo3XRafJf6GOLjr21saf128V-XzR6FK155AodqkdC-y2hzBVy5mtI";

	it.each([
		[`https://pay.stripe.com/receipts/invoices/${token}?s=ap`],
		// The dashboard host serves the same receipt, and the "Download receipt"
		// link in the emailed receipt points at the /pdf variant of it.
		[`https://dashboard.stripe.com/receipts/invoices/${token}`],
		[`https://dashboard.stripe.com/receipts/invoices/${token}/pdf`],
		[`https://dashboard.stripe.com/receipts/invoices/${token}/pdf?s=em`],
	])("parses %s down to the account, token and canonical page URL", (url) => {
		expect(parseStripeReceiptUrl(url)).toEqual({
			accountId: "acct_1A65pgIvcqWR3dFD",
			receiptToken: token,
			pageUrl: `https://pay.stripe.com/receipts/invoices/${token}`,
			pdfUrl: `https://pay.stripe.com/receipts/invoices/${token}/pdf`,
		});
	});

	it("returns null for non-receipt Stripe URLs", () => {
		expect(
			parseStripeReceiptUrl(
				"https://pay.stripe.com/invoice/acct_ABC123/live_token",
			),
		).toBeNull();
		expect(
			parseStripeReceiptUrl("https://invoice.stripe.com/i/acct_ABC/live_xyz"),
		).toBeNull();
	});

	it("returns null for URLs without an embedded account ID", () => {
		// "aGVsbG8" is base64 for "hello" — no acct_ prefix inside
		expect(
			parseStripeReceiptUrl("https://pay.stripe.com/receipts/invoices/aGVsbG8"),
		).toBeNull();
	});

	it("returns null for non-Stripe URLs", () => {
		expect(parseStripeReceiptUrl("https://example.com/receipts")).toBeNull();
		expect(parseStripeReceiptUrl("not a url")).toBeNull();
	});
});

describe("isStripeInvoiceUrl", () => {
	it("accepts every form the package can import", () => {
		for (const url of [
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
			"https://pay.stripe.com/invoice/acct_1ABC/live_XYZ",
			"https://pay.stripe.com/receipts/invoices/" +
				Buffer.from("acct_1ABCdef").toString("base64url"),
		]) {
			expect(isStripeInvoiceUrl(url)).toBe(true);
		}
	});

	it("rejects unrelated URLs", () => {
		expect(isStripeInvoiceUrl("https://example.com/invoice/123")).toBe(false);
		expect(isStripeInvoiceUrl("")).toBe(false);
	});
});

/**
 * base64url of a blob containing `acct_1TEST00000000000`, so it satisfies
 * `parseStripeReceiptUrl`'s embedded-account extraction. Synthetic on purpose:
 * a real receipt token grants read access to a real customer's receipt, and
 * expires, which makes it a bad fixture twice over.
 */
const DEMO_RECEIPT_TOKEN = "CgphY2N0XzFURVNUMDAwMDAwMDAwMDAoZGVtby1yZWNlaXB0LXRva2Vu";

/**
 * Wrap a target URL the way SendGrid wraps Stripe's billing emails.
 *
 * The `58` subdomain and the `CL0` marker are both per-sender and not a
 * contract, so `host` is a parameter and nothing here is matched on — see the
 * host-independence test below.
 */
const wrap = (encodedTarget: string, host = "58.email.stripe.com"): string =>
	`https://${host}/CL0/${encodedTarget}/1/0100000000-aaaa/ZZZZ=452`;

describe("unwrapTrackedStripeUrl", () => {
	it("recovers the target from a SendGrid click-tracking wrapper", () => {
		// Stripe's own billing emails go out click-tracked, so this is the
		// shape users actually paste out of "Download invoice".
		expect(
			unwrapTrackedStripeUrl(
				wrap("https%3A%2F%2Finvoice.stripe.com%2Fi%2Facct_1ABC%2Flive_XYZ"),
			),
		).toBe("https://invoice.stripe.com/i/acct_1ABC/live_XYZ");
	});

	it("handles a half-encoded scheme separator", () => {
		// Observed in the wild alongside the fully-encoded form.
		expect(
			unwrapTrackedStripeUrl(
				wrap(
					"https:%2F%2Fdashboard.stripe.com%2Freceipts%2Finvoices%2Fabc%3Fs=em",
				),
			),
		).toBe("https://dashboard.stripe.com/receipts/invoices/abc?s=em");
	});

	it("decodes a bare percent-encoded URL with no wrapper", () => {
		expect(
			unwrapTrackedStripeUrl(
				"https%3A%2F%2Finvoice.stripe.com%2Fi%2Facct_1ABC%2Flive_XYZ",
			),
		).toBe("https://invoice.stripe.com/i/acct_1ABC/live_XYZ");
	});

	it("returns a clean URL byte-identical", () => {
		// Not every Stripe sender wraps; unwrapping must be a no-op passthrough.
		for (const url of [
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
			"https://pay.stripe.com/receipts/invoices/abc/pdf",
			"https://example.com/a/b?c=d#e",
		]) {
			expect(unwrapTrackedStripeUrl(url)).toBe(url);
		}
	});

	it("is idempotent", () => {
		const wrapped = wrap(
			"https%3A%2F%2Finvoice.stripe.com%2Fi%2Facct_1ABC%2Flive_XYZ",
		);
		const once = unwrapTrackedStripeUrl(wrapped);
		expect(unwrapTrackedStripeUrl(once)).toBe(once);
	});

	it("does not depend on the wrapper host or the marker segment", () => {
		// The numeric subdomain varies per sender, and `CL0` is a SendGrid
		// marker rather than a contract. Neither is matched on: any URL whose
		// path carries an encoded target unwraps the same way.
		const encoded = "https%3A%2F%2Finvoice.stripe.com%2Fi%2Facct_1ABC%2Flive_XYZ";
		for (const host of [
			"58.email.stripe.com",
			"12.email.stripe.com",
			"u1234567.ct.sendgrid.net",
			"links.example-esp.io",
		]) {
			expect(unwrapTrackedStripeUrl(wrap(encoded, host))).toBe(
				"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
			);
		}

		// Nor on the marker segment, nor on the tracking tail being present.
		expect(unwrapTrackedStripeUrl(`https://x.example/ZZ9/${encoded}`)).toBe(
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
		);
		expect(unwrapTrackedStripeUrl(`https://x.example/${encoded}`)).toBe(
			"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
		);
	});

	it("returns malformed input unchanged rather than throwing", () => {
		// Nothing here decodes cleanly, so nothing here may change: the caller
		// gets back exactly what it passed in, and the anchored parsers reject it.
		for (const value of ["", "not a url", "https://%E0%A4%A", "%%%", "/CL0/%2F"]) {
			expect(unwrapTrackedStripeUrl(value)).toBe(value);
		}
	});
});

describe("click-tracked URLs reach the parsers", () => {
	it("parses a wrapped hosted-invoice URL", () => {
		expect(
			parseStripeInvoiceUrl(
				wrap("https%3A%2F%2Finvoice.stripe.com%2Fi%2Facct_1ABC%2Flive_XYZ"),
			),
		).toEqual({ accountId: "acct_1ABC", liveToken: "live_XYZ" });
	});

	it("parses a wrapped receipt URL and drops the tracking residue", () => {
		const result = parseStripeReceiptUrl(
			wrap(
				`https%3A%2F%2Fdashboard.stripe.com%2Freceipts%2Finvoices%2F${DEMO_RECEIPT_TOKEN}%2Fpdf%3Fs%3Dem`,
			),
		);

		expect(result).toEqual({
			accountId: "acct_1TEST00000000000",
			receiptToken: DEMO_RECEIPT_TOKEN,
			// Canonical, with no `/pdf` suffix and no `?s=em`.
			pageUrl: `https://pay.stripe.com/receipts/invoices/${DEMO_RECEIPT_TOKEN}`,
			pdfUrl: `https://pay.stripe.com/receipts/invoices/${DEMO_RECEIPT_TOKEN}/pdf`,
		});
	});

	it("detects a wrapped URL as importable", () => {
		expect(
			isStripeInvoiceUrl(
				wrap(
					"https%3A%2F%2Fpay.stripe.com%2Finvoice%2Facct_1ABC%2Flive_XYZ%2Fpdf",
				),
			),
		).toBe(true);
	});

	it("still rejects a wrapper pointing at a non-Stripe host", () => {
		// Unwrapping is not trusting: the wrapper is attacker-controllable, and
		// the anchored stripe.com matchers are what stop anything being fetched.
		const hostile = wrap("https%3A%2F%2Fevil.example.com%2Fx");

		expect(unwrapTrackedStripeUrl(hostile)).toBe("https://evil.example.com/x");
		expect(parseStripeInvoiceUrl(hostile)).toBeNull();
		expect(parseStripeReceiptUrl(hostile)).toBeNull();
		expect(isStripeInvoiceUrl(hostile)).toBe(false);
	});
});
