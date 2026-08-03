/**
 * Recognizing and decomposing the public Stripe URLs a customer is given.
 *
 * Every function here is pure and dependency-free, so a UI can use them to
 * detect a pasted URL without pulling in the fetching layer.
 */

/** Hosted invoice pages: `https://invoice.stripe.com/i/acct_…/live_…`. */
export const STRIPE_HOSTED_INVOICE_URL_RE =
	/^https:\/\/invoice\.stripe\.com\/i\/(acct_[A-Za-z0-9]+)\/((live|test)_[A-Za-z0-9]+)/;

/** Pay/PDF URLs, which carry the same account and token as the hosted page. */
export const STRIPE_PAY_URL_RE =
	/^https:\/\/pay\.stripe\.com\/invoice\/(acct_[A-Za-z0-9]+)\/((live|test)_[A-Za-z0-9]+)/;

/**
 * Receipt URLs for invoice payments and refunds.
 *
 * The same receipt is served from `pay.stripe.com` and `dashboard.stripe.com`,
 * and every form also has a `/pdf` variant (the "Download receipt" link in the
 * emailed receipt). All of them carry the same token.
 */
export const STRIPE_RECEIPT_URL_RE =
	/^https:\/\/(?:pay|dashboard)\.stripe\.com\/receipts\/invoices\/([A-Za-z0-9_-]+)(\/pdf)?/;

/** A hosted invoice URL decomposed into the pair that addresses it. */
export type StripeInvoiceUrlParts = {
	/** The connected account that issued the invoice, e.g. `acct_1ABC…`. */
	accountId: string;
	/** The per-invoice access token, e.g. `live_abc…` or `test_abc…`. */
	liveToken: string;
};

/** A receipt URL decomposed into its token and the canonical URLs to fetch. */
export type StripeReceiptUrlParts = {
	accountId: string;
	receiptToken: string;
	/** Canonical HTML page: `/pdf` and any tracking query are dropped. */
	pageUrl: string;
	/** That page plus `/pdf`. */
	pdfUrl: string;
};

/**
 * Parse a Stripe hosted invoice URL into its components. Also accepts
 * `pay.stripe.com` PDF URLs, which share the same token.
 *
 * Returns `null` when the URL is not a Stripe hosted invoice URL.
 */
export const parseStripeInvoiceUrl = (url: string): StripeInvoiceUrlParts | null => {
	const match = STRIPE_HOSTED_INVOICE_URL_RE.exec(url) ?? STRIPE_PAY_URL_RE.exec(url);
	if (!match?.[1] || !match[2]) return null;
	return { accountId: match[1], liveToken: match[2] };
};

/**
 * Parse a Stripe receipt URL for an invoice payment or refund.
 *
 * The token is a base64url-encoded protobuf that embeds the Stripe account id,
 * which is dug out rather than requested: nothing else in the URL identifies
 * the account. Returns `null` when the URL does not match or the account id
 * cannot be extracted.
 */
export const parseStripeReceiptUrl = (url: string): StripeReceiptUrlParts | null => {
	const match = STRIPE_RECEIPT_URL_RE.exec(url);
	if (!match?.[1]) return null;

	const receiptToken = match[1];
	// Decode base64url → binary string, then find the embedded acct_ prefix.
	const base64 = receiptToken.replace(/-/g, "+").replace(/_/g, "/");
	try {
		const decoded = decodeBase64(base64);
		const acctMatch = /acct_[A-Za-z0-9]+/.exec(decoded);
		if (!acctMatch) return null;
		const pageUrl = `https://pay.stripe.com/receipts/invoices/${receiptToken}`;
		return {
			accountId: acctMatch[0],
			receiptToken,
			pageUrl,
			pdfUrl: `${pageUrl}/pdf`,
		};
	} catch {
		return null;
	}
};

/**
 * Whether this package can import the given URL. Cheap enough to run against
 * every URL in a pasted block of text.
 */
export const isStripeInvoiceUrl = (url: string): boolean =>
	parseStripeInvoiceUrl(url) !== null || parseStripeReceiptUrl(url) !== null;

/**
 * base64 → binary string, on both Node and the browser. `atob` is available in
 * every target runtime (Node ≥16), but `Buffer` is preferred where it exists
 * because it rejects malformed input the same way for every input length.
 */
const decodeBase64 = (value: string): string => {
	if (typeof atob === "function") return atob(value);
	// eslint-disable-next-line no-undef -- Node-only fallback, guarded above.
	return Buffer.from(value, "base64").toString("binary");
};

/**
 * The URL that serves the hosted invoice page's JSON payload.
 *
 * This is the undocumented endpoint the hosted page itself calls; it carries
 * the ephemeral key that authorizes reading the invoice.
 */
export const hostedInvoiceDataUrl = ({
	accountId,
	liveToken,
}: StripeInvoiceUrlParts): string =>
	`https://invoicedata.stripe.com/hosted_invoice_page/${accountId}/${liveToken}`;

/** The URL that redirects to the invoice's payment-receipt PDF. */
export const hostedInvoiceReceiptFileUrl = ({
	accountId,
	liveToken,
}: StripeInvoiceUrlParts): string =>
	`https://invoicedata.stripe.com/invoice_receipt_file_url/${accountId}/${liveToken}`;

/** The canonical customer-facing URL for a hosted invoice. */
export const hostedInvoicePageUrl = ({
	accountId,
	liveToken,
}: StripeInvoiceUrlParts): string =>
	`https://invoice.stripe.com/i/${accountId}/${liveToken}`;
