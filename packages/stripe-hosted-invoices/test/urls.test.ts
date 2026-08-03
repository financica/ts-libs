import { describe, expect, it } from "vitest";
import {
	isStripeInvoiceUrl,
	parseStripeInvoiceUrl,
	parseStripeReceiptUrl,
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
