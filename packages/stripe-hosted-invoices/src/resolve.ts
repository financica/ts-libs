/**
 * The high-level entry point: a public Stripe URL in, the documents behind it
 * out.
 *
 * This is the whole protocol in one call — URL classification, the receipt-page
 * detour, the hosted-page credential fetch, the invoice read, and the credit
 * notes. Callers who need to drive the steps themselves can use the pieces in
 * `./client` and `./urls` directly.
 */

import {
	fetchStripeCreditNotes,
	fetchStripeHostedInvoice,
	fetchStripeHostedPage,
	resolveStripeHostedOptions,
	type StripeHostedOptions,
} from "./client.js";
import { parseStripeReceiptPage, type StripeReceiptPage } from "./receipt-page.js";
import type {
	StripeCreditNoteWithLines,
	StripeHostedError,
	StripeHostedInvoice,
	StripeHostedResult,
	StripeLineItem,
} from "./types.js";
import {
	hostedInvoicePageUrl,
	hostedInvoiceReceiptFileUrl,
	parseStripeInvoiceUrl,
	parseStripeReceiptUrl,
	STRIPE_HOSTED_INVOICE_URL_RE,
	type StripeInvoiceUrlParts,
} from "./urls.js";

/** The receipt a URL pointed at, when it was a receipt URL rather than an invoice one. */
export type ResolvedStripeReceipt = StripeReceiptPage & {
	receiptToken: string;
	/** The HTML page this was parsed from. */
	pageUrl: string;
	/** The same receipt as a PDF. */
	pdfUrl: string;
};

/** Everything the hosted protocol can say about a URL. */
export type ResolvedStripeInvoice = {
	accountId: string;
	invoiceId: string;
	invoice: StripeHostedInvoice;
	/** Fully paginated; the invoice's own `lines.data` holds only the first page. */
	lines: StripeLineItem[];
	/**
	 * Credit notes issued against the invoice, each with its lines. Empty when
	 * there are none *or* when the endpoint could not be reached — this read is
	 * best-effort, since a missing credit note must not fail an invoice import.
	 */
	creditNotes: StripeCreditNoteWithLines[];
	/** Set only when the URL was a receipt URL. */
	receipt: ResolvedStripeReceipt | null;
	/** The raw hosted-page payload: supplier country, support email, branding. */
	hostedData: unknown;
	/** The canonical hosted invoice page. */
	hostedInvoiceUrl: string;
	/** Where the invoice's payment-receipt PDF can be fetched. */
	receiptFileUrl: string;
};

/**
 * `pay.stripe.com` form of a hosted invoice link, as embedded in receipt pages.
 * Not anchored: it is searched for inside markup, not matched against a URL.
 */
const EMBEDDED_PAY_URL_RE =
	/https:\/\/pay\.stripe\.com\/invoice\/acct_[A-Za-z0-9]+\/(live|test)_[A-Za-z0-9]+/;

/** Same, for the `invoice.stripe.com` form. */
const EMBEDDED_HOSTED_URL_RE = new RegExp(
	STRIPE_HOSTED_INVOICE_URL_RE.source.replace(/^\^/, ""),
);

/**
 * Read every document reachable from a public Stripe URL.
 *
 * Accepts a hosted invoice URL (`invoice.stripe.com/i/…`), its `pay.stripe.com`
 * equivalent, or a payment/refund receipt URL. A receipt URL is resolved by
 * fetching the receipt page and following the hosted invoice link embedded in
 * it, so the result always centres on the invoice — with the parsed receipt
 * attached, which is the only place a refund's amount and date are recorded.
 *
 * Errors are returned, not thrown.
 */
export const resolveStripeInvoiceUrl = async (
	url: string,
	options: StripeHostedOptions = {},
): Promise<StripeHostedResult<ResolvedStripeInvoice>> => {
	let parts: StripeInvoiceUrlParts | null = parseStripeInvoiceUrl(url);
	let receipt: ResolvedStripeReceipt | null = null;

	if (!parts) {
		const resolved = await resolveFromReceipt(url, options);
		if (!resolved.ok) return resolved;
		parts = resolved.parts;
		receipt = resolved.receipt;
	}

	const page = await fetchStripeHostedPage(parts, options);
	if (!page.ok) return page;

	const hosted = await fetchStripeHostedInvoice(
		{ invoiceId: page.invoiceId, ephemeralKey: page.ephemeralKey },
		options,
	);
	if (!hosted.ok) return hosted;

	// Best-effort by contract: a failure here yields an empty list, never an error.
	const creditNotes = await fetchStripeCreditNotes(
		{ invoiceId: page.invoiceId, ephemeralKey: page.ephemeralKey },
		options,
	);

	return {
		ok: true,
		accountId: parts.accountId,
		invoiceId: page.invoiceId,
		invoice: hosted.invoice,
		lines: hosted.lines,
		creditNotes,
		receipt,
		hostedData: page.hostedData,
		hostedInvoiceUrl: hostedInvoicePageUrl(parts),
		receiptFileUrl: hostedInvoiceReceiptFileUrl(parts),
	};
};

/**
 * Turn a receipt URL into the invoice it documents.
 *
 * The receipt page embeds a link to the hosted invoice; finding it is how a
 * receipt re-enters the normal flow. JSON-escaped forward slashes are
 * normalized first, because the link usually appears inside a script payload
 * rather than an `href`.
 */
const resolveFromReceipt = async (
	url: string,
	options: StripeHostedOptions,
): Promise<
	| { ok: true; parts: StripeInvoiceUrlParts; receipt: ResolvedStripeReceipt }
	| { ok: false; error: StripeHostedError }
> => {
	const receiptParts = parseStripeReceiptUrl(url);
	if (!receiptParts) return { ok: false, error: { kind: "invalid_url" } };

	const { fetch: fetchImpl } = resolveStripeHostedOptions(options);
	let html: string;
	try {
		const res = await fetchImpl(receiptParts.pageUrl, { redirect: "follow" });
		if (!res.ok) {
			return {
				ok: false,
				error: {
					kind: "http_error",
					status: res.status,
					url: receiptParts.pageUrl,
				},
			};
		}
		html = await res.text();
	} catch (cause) {
		return { ok: false, error: { kind: "network_error", cause } };
	}

	const normalized = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
	const parts =
		parseStripeInvoiceUrl(EMBEDDED_HOSTED_URL_RE.exec(normalized)?.[0] ?? "") ??
		parseStripeInvoiceUrl(EMBEDDED_PAY_URL_RE.exec(normalized)?.[0] ?? "");

	if (!parts) {
		return {
			ok: false,
			error: {
				kind: "invalid_response",
				detail: "no hosted invoice link in receipt page; the receipt may not be linked to an invoice",
			},
		};
	}

	return {
		ok: true,
		parts,
		receipt: {
			...parseStripeReceiptPage(html),
			receiptToken: receiptParts.receiptToken,
			pageUrl: receiptParts.pageUrl,
			pdfUrl: receiptParts.pdfUrl,
		},
	};
};
