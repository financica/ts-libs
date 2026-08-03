/**
 * Read a Stripe invoice, credit note or receipt from its public hosted URL,
 * with no API key.
 *
 * Start with {@link resolveStripeInvoiceUrl}, which runs the whole protocol.
 * The individual steps are exported for callers who need to drive it
 * themselves, and the URL matchers are dependency-free so a browser can use
 * them to detect a pasted link.
 *
 * @packageDocumentation
 */

export {
	ephemeralHeaders,
	fetchStripeCreditNotes,
	fetchStripeHostedInvoice,
	fetchStripeHostedPage,
	fetchStripePdf,
	STRIPE_HOSTED_API_VERSION,
	type StripeHostedOptions,
	type StripeHostedPageCredentials,
} from "./client.js";
export {
	fromStripeMinorUnits,
	isStripeZeroDecimalCurrency,
	stripeMinorUnitDivisor,
	toStripeMinorUnits,
} from "./minor-units.js";
export {
	parseReceiptAmount,
	parseStripeReceiptPage,
	type StripeReceiptCreditLine,
	type StripeReceiptPage,
} from "./receipt-page.js";
export {
	resolveStripeInvoiceUrl,
	type ResolvedStripeInvoice,
	type ResolvedStripeReceipt,
} from "./resolve.js";
export { detectStripeTaxInclusive } from "./tax.js";
export type {
	StripeAddress,
	StripeCreditNote,
	StripeCreditNoteLine,
	StripeCreditNoteRefund,
	StripeCreditNoteWithLines,
	StripeDiscountAmount,
	StripeHostedError,
	StripeHostedInvoice,
	StripeHostedResult,
	StripeLineItem,
	StripeRef,
	StripeTaxAmount,
} from "./types.js";
export {
	hostedInvoiceDataUrl,
	hostedInvoicePageUrl,
	hostedInvoiceReceiptFileUrl,
	isStripeInvoiceUrl,
	parseStripeInvoiceUrl,
	parseStripeReceiptUrl,
	STRIPE_HOSTED_INVOICE_URL_RE,
	STRIPE_PAY_URL_RE,
	STRIPE_RECEIPT_URL_RE,
	type StripeInvoiceUrlParts,
	type StripeReceiptUrlParts,
	unwrapTrackedStripeUrl,
} from "./urls.js";

/**
 * Utilities the hosted payloads make necessary. Exported because consumers
 * mapping these documents onto their own model need the same tolerance:
 * `findDeepString` locates fields Stripe moves between nesting levels, and
 * `unixToIsoDate` converts the timestamps every date field uses.
 */
export {
	findDeep,
	findDeepString,
	findStripeInvoiceId,
	unixToIsoDate,
} from "./internal.js";
