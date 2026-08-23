/**
 * The ephemeral-key protocol.
 *
 * The public Stripe API needs a secret key, which the holder of a public
 * invoice URL never has. The hosted invoice page works around this for itself:
 * `invoicedata.stripe.com` hands the page a short-lived `ephemeral_key`
 * (`ek_…`) that authorizes read-only access to that one invoice through
 * `/v1/invoices/{id}/hosted`. This module speaks that same protocol.
 *
 * None of it is documented or covered by Stripe's API versioning promises. It
 * is reverse-engineered from the hosted page's own network traffic and can
 * change without notice — every function here fails soft and returns a typed
 * error rather than throwing.
 */

import {
	coerceCreditNote,
	coerceCreditNoteLinesPage,
	coerceHostedInvoice,
	coerceLinesPage,
} from "./coerce.js";
import { findDeep, findDeepString, findStripeInvoiceId, isRecord } from "./internal.js";
import type {
	StripeCreditNote,
	StripeCreditNoteLine,
	StripeCreditNoteWithLines,
	StripeHostedInvoice,
	StripeHostedResult,
	StripeLineItem,
} from "./types.js";
import { hostedInvoiceDataUrl, type StripeInvoiceUrlParts } from "./urls.js";

/**
 * The API version the hosted endpoints speak. Pinned because Stripe rejects an
 * ephemeral key outright when a request does not name an explicit version, and
 * because the response shape this package reads is that version's.
 */
export const STRIPE_HOSTED_API_VERSION = "2020-03-02";

/** Hard cap on line-item pages so a runaway `has_more` cannot loop forever. */
const MAX_LINE_PAGES = 20;

/** Base of the public Stripe API the ephemeral key authorizes reads against. */
const STRIPE_API_BASE = "https://api.stripe.com";

/** Page size requested from Stripe list endpoints (its maximum). */
const PAGE_LIMIT = "100";

/** Optional hooks. Everything is best-effort and silent by default. */
export type StripeHostedOptions = {
	/**
	 * Injected `fetch`, for tests or for a caller that needs its own timeout,
	 * proxy or retry policy. Defaults to the global.
	 */
	fetch?: typeof globalThis.fetch;
	/** Called when something is skipped or degraded. Defaults to a no-op. */
	onWarning?: (message: string, context?: Record<string, unknown>) => void;
};

type Resolved = Required<Pick<StripeHostedOptions, "fetch" | "onWarning">>;

/** Fill in the defaults for {@link StripeHostedOptions}: global `fetch`, no-op warnings. */
export const resolveStripeHostedOptions = (
	options: StripeHostedOptions = {},
): Resolved => ({
	fetch: options.fetch ?? globalThis.fetch,
	onWarning: options.onWarning ?? (() => {}),
});

const resolve = resolveStripeHostedOptions;

/**
 * Walk a Stripe `starting_after` cursor list, appending to `lines` in place.
 *
 * Stops at the first non-OK response, unreadable page, network error or the
 * {@link MAX_LINE_PAGES} cap. Returns whether more pages remained when it
 * stopped because of the cap, so the caller can decide whether to warn.
 */
const paginateLines = async <T extends { id?: unknown }>(
	params: {
		lines: T[];
		hasMore: boolean;
		linesUrl: string;
		coercePage: (raw: unknown) => { data: T[]; has_more: boolean } | null;
		/** Warning messages; `notObject` is omitted when that case should stay silent. */
		warnings: { httpFailed: string; notObject?: string; error: string };
		/** Extra warning context, given the zero-based page index. */
		context: (page: number) => Record<string, unknown>;
	},
	{ fetch, onWarning }: Resolved,
	headers: Record<string, string>,
): Promise<{ truncated: boolean; pages: number }> => {
	const { lines, linesUrl, coercePage, warnings, context } = params;
	let hasMore = params.hasMore;
	let page = 0;
	// Each page asks for what follows the last id of the page before it, so
	// the walk is sequential by construction.
	/* oxlint-disable no-await-in-loop */
	while (hasMore && page < MAX_LINE_PAGES) {
		const lastId = lines[lines.length - 1]?.id;
		if (typeof lastId !== "string") break;

		const pageUrl = new URL(linesUrl);
		pageUrl.searchParams.set("starting_after", lastId);
		pageUrl.searchParams.set("limit", PAGE_LIMIT);
		try {
			const res = await fetch(pageUrl.toString(), { headers });
			if (!res.ok) {
				onWarning(warnings.httpFailed, {
					status: res.status,
					...context(page),
				});
				break;
			}
			const parsed = coercePage(await res.json());
			if (!parsed) {
				if (warnings.notObject) onWarning(warnings.notObject, context(page));
				break;
			}
			lines.push(...parsed.data);
			hasMore = parsed.has_more && parsed.data.length > 0;
		} catch (cause) {
			onWarning(warnings.error, { cause, ...context(page) });
			break;
		}
		page += 1;
	}
	/* oxlint-enable no-await-in-loop */
	return { truncated: hasMore && page >= MAX_LINE_PAGES, pages: page };
};

/**
 * Headers that authorize the ephemeral-key read path.
 *
 * `Stripe-Version` is mandatory. The `Origin`/`Referer` pair matches what the
 * hosted page sends; the endpoints reject requests without them.
 */
export const ephemeralHeaders = (ephemeralKey: string): Record<string, string> => ({
	Authorization: `Bearer ${ephemeralKey}`,
	"Content-Type": "application/x-www-form-urlencoded",
	"Stripe-Version": STRIPE_HOSTED_API_VERSION,
	Origin: "https://invoice.stripe.com",
	Referer: "https://invoice.stripe.com/",
});

/** What the hosted page payload yields: the credentials to read the invoice. */
export type StripeHostedPageCredentials = {
	/** Short-lived read-only key, `ek_…`. */
	ephemeralKey: string;
	/** The invoice this page describes, `in_…`. */
	invoiceId: string;
	/** The raw payload, which carries supplier/customer fields nothing else has. */
	hostedData: unknown;
};

/**
 * Fetch the hosted invoice page payload and extract the ephemeral key and
 * invoice id from it.
 *
 * Both are located by deep search rather than a fixed path: the payload has no
 * published schema and Stripe has moved these fields between nesting levels.
 */
export const fetchStripeHostedPage = async (
	parts: StripeInvoiceUrlParts,
	options: StripeHostedOptions = {},
): Promise<StripeHostedResult<StripeHostedPageCredentials>> => {
	const { fetch } = resolve(options);
	const url = hostedInvoiceDataUrl(parts);

	let hostedData: unknown;
	try {
		const res = await fetch(url, { headers: { Accept: "application/json" } });
		if (!res.ok) {
			return {
				ok: false,
				error: { kind: "http_error", status: res.status, url },
			};
		}
		hostedData = await res.json();
	} catch (cause) {
		return { ok: false, error: { kind: "network_error", cause } };
	}

	const ephemeralKey = findDeep(hostedData, "ephemeral_key");
	if (typeof ephemeralKey !== "string" || !ephemeralKey.startsWith("ek_")) {
		return {
			ok: false,
			error: {
				kind: "invalid_response",
				detail: "no ephemeral_key in hosted page payload",
			},
		};
	}

	const invoiceId = findStripeInvoiceId(hostedData);
	if (!invoiceId) {
		return {
			ok: false,
			error: {
				kind: "invalid_response",
				detail: "no Stripe invoice id in hosted page payload",
			},
		};
	}

	return { ok: true, ephemeralKey, invoiceId, hostedData };
};

/**
 * Fetch an invoice and all of its line items with an ephemeral key.
 *
 * The hosted endpoint embeds only the first page of lines, so the
 * `starting_after` cursor is followed for the rest. Pagination failure is not
 * fatal — it returns the lines gathered so far and warns, because a truncated
 * line list is more useful than no invoice.
 */
export const fetchStripeHostedInvoice = async (
	{
		invoiceId,
		ephemeralKey,
	}: {
		invoiceId: string;
		ephemeralKey: string;
	},
	options: StripeHostedOptions = {},
): Promise<
	StripeHostedResult<{ invoice: StripeHostedInvoice; lines: StripeLineItem[] }>
> => {
	const { fetch, onWarning } = resolve(options);
	const headers = ephemeralHeaders(ephemeralKey);
	const url = `${STRIPE_API_BASE}/v1/invoices/${invoiceId}/hosted?expand[0]=total_tax_amounts.tax_rate`;

	let raw: unknown;
	try {
		const res = await fetch(url, { headers });
		if (!res.ok) {
			return {
				ok: false,
				error: { kind: "http_error", status: res.status, url },
			};
		}
		raw = await res.json();
	} catch (cause) {
		return { ok: false, error: { kind: "network_error", cause } };
	}

	const invoice = coerceHostedInvoice(raw);
	if (!invoice) {
		return {
			ok: false,
			error: {
				kind: "invalid_response",
				detail: "invoice body is not an object",
			},
		};
	}

	const lines: StripeLineItem[] = [...(invoice.lines?.data ?? [])];
	const { truncated, pages } = await paginateLines(
		{
			lines,
			hasMore: invoice.lines?.has_more === true && lines.length > 0,
			linesUrl: `${STRIPE_API_BASE}/v1/invoices/${invoiceId}/lines`,
			coercePage: coerceLinesPage,
			warnings: {
				httpFailed: "failed to paginate invoice lines",
				notObject: "invoice lines page is not an object",
				error: "error paginating invoice lines",
			},
			context: (page) => ({ page }),
		},
		{ fetch, onWarning },
		headers,
	);
	if (truncated) {
		onWarning("invoice line pagination hit its page cap; lines are truncated", {
			invoiceId,
			pages,
		});
	}

	return { ok: true, invoice, lines };
};

/**
 * List the issued credit notes for an invoice, each with its lines.
 *
 * A credit note is a document in its own right — its own number, date, lines
 * and PDF — and cannot be read off the invoice payload: after a post-payment
 * refund the hosted invoice still reports its original total and still says
 * "paid". This endpoint is the only place the real document lives.
 *
 * Voided credit notes are excluded (`status=issued`): they were retracted and
 * never credited anything.
 *
 * Failure is never fatal. An invoice read that cannot reach this endpoint is
 * still a correct invoice read, so this returns an empty list and warns.
 */
export const fetchStripeCreditNotes = async (
	{
		invoiceId,
		ephemeralKey,
	}: {
		invoiceId: string;
		ephemeralKey: string;
	},
	options: StripeHostedOptions = {},
): Promise<StripeCreditNoteWithLines[]> => {
	const { fetch, onWarning } = resolve(options);
	const headers = ephemeralHeaders(ephemeralKey);

	const url = new URL(`${STRIPE_API_BASE}/v1/invoices/${invoiceId}/credit_notes`);
	url.searchParams.set("limit", PAGE_LIMIT);
	url.searchParams.set("status", "issued");
	url.searchParams.set("expand[0]", "data.tax_amounts.tax_rate");

	let raw: unknown;
	try {
		const res = await fetch(url.toString(), { headers });
		if (!res.ok) {
			onWarning("failed to list credit notes", { status: res.status, invoiceId });
			return [];
		}
		raw = await res.json();
	} catch (cause) {
		onWarning("error listing credit notes", { cause, invoiceId });
		return [];
	}

	const entries = isRecord(raw) && Array.isArray(raw["data"]) ? raw["data"] : [];

	const creditNotes = entries.map((entry) => coerceCreditNote(entry));
	for (const creditNote of creditNotes) {
		// A dropped credit note is a missing accounting document, not a cosmetic
		// gap, so it is reported rather than silently skipped.
		if (!creditNote) onWarning("skipping unreadable credit note", { invoiceId });
	}
	// One line fetch per credit note, and they do not depend on each other.
	return Promise.all(
		creditNotes
			.filter((note) => note !== null)
			.map(async (creditNote) => ({
				creditNote,
				lines: await fetchCreditNoteLines(creditNote, headers, {
					fetch,
					onWarning,
				}),
			})),
	);
};

/** Follow `starting_after` when a credit note has more lines than the list embeds. */
const fetchCreditNoteLines = async (
	creditNote: StripeCreditNote,
	headers: Record<string, string>,
	{ fetch, onWarning }: Resolved,
): Promise<StripeCreditNoteLine[]> => {
	const lines: StripeCreditNoteLine[] = [...(creditNote.lines?.data ?? [])];
	// No cap warning here: a truncated credit note is not reported today.
	await paginateLines(
		{
			lines,
			hasMore: creditNote.lines?.has_more === true && lines.length > 0,
			linesUrl: `${STRIPE_API_BASE}/v1/credit_notes/${creditNote.id}/lines`,
			coercePage: coerceCreditNoteLinesPage,
			warnings: {
				httpFailed: "failed to paginate credit-note lines",
				error: "error paginating credit-note lines",
			},
			context: () => ({ creditNoteId: creditNote.id }),
		},
		{ fetch, onWarning },
		headers,
	);

	return lines;
};

/**
 * Download a Stripe PDF, following the indirection its file URLs use.
 *
 * Stripe's invoice and receipt file URLs sometimes redirect straight to the
 * PDF and sometimes return a JSON body carrying the real file URL (`url`,
 * `file_url` or `pdf_url`) that has to be followed. Both non-OK responses and
 * OK-but-not-a-PDF responses are inspected for that inner URL and queued.
 *
 * Returns the first PDF bytes found, or null once the queue is exhausted.
 */
export const fetchStripePdf = async (
	startUrl: string,
	options: StripeHostedOptions = {},
): Promise<Uint8Array | null> => {
	const { fetch, onWarning } = resolve(options);
	const queue: string[] = [startUrl];
	const seen = new Set<string>();

	// The queue is drained and grown at the same time — a response can name the
	// URL the PDF actually lives at — and the walk stops at the first PDF, so
	// the rounds cannot be issued up front.
	/* oxlint-disable no-await-in-loop */
	while (queue.length > 0) {
		const url = queue.shift();
		if (!url || seen.has(url)) continue;
		seen.add(url);

		try {
			const res = await fetch(url, { redirect: "follow" });
			const contentType = res.headers.get("content-type") ?? "";

			if (!res.ok) {
				if (contentType.includes("json"))
					queueInnerUrl(await safeJson(res), queue);
				continue;
			}
			if (contentType.includes("pdf") || contentType.includes("octet-stream")) {
				return new Uint8Array(await res.arrayBuffer());
			}
			// Not a PDF: it may be JSON naming where the PDF actually lives.
			if (contentType.includes("json")) queueInnerUrl(await safeJson(res), queue);
		} catch (cause) {
			onWarning("failed to download PDF", { cause, url });
		}
	}
	/* oxlint-enable no-await-in-loop */
	return null;
};

const safeJson = async (res: Response): Promise<unknown> => {
	try {
		return await res.json();
	} catch {
		return null;
	}
};

const queueInnerUrl = (body: unknown, queue: string[]): void => {
	const inner = findDeepString(body, "url", "file_url", "pdf_url");
	if (inner) queue.push(inner);
};
