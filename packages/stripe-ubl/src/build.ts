import type {
	PeppolOnlyInvoice,
	ScradaInvoiceAttachment,
} from "@financica/scrada-client";
import type Stripe from "stripe";
import { buildCustomerPartyFromStripeInvoice } from "./customer";
import { buildCreditNoteLines, buildInvoiceLines } from "./lines";
import { centsToDecimal } from "./numeric";
import { buildSupplierParty, type ScradaSupplier } from "./supplier";
import { normalizeString } from "./utils";
import { buildVatTotals } from "./vat-totals";

export interface BuildScradaInvoiceParams {
	/** Fully-retrieved Stripe invoice. See README for the recommended `expand`. */
	invoice: Stripe.Invoice;
	/** Caller-resolved supplier data. */
	supplier: ScradaSupplier;
	/** Optional PDF (or other) attachment to embed in the Peppol document. */
	attachment?: ScradaInvoiceAttachment;
	/**
	 * Prefix used when the caller does not provide an explicit
	 * `externalReference` in `options.externalReference`. Defaults to
	 * `"stripe:"`, so the reference becomes e.g. `"stripe:in_123"`.
	 */
	externalReferencePrefix?: string;
	/** Override the externalReference instead of deriving it from the prefix. */
	externalReference?: string;
}

const validateCurrency = (currency: string): string => {
	const upper = currency?.toUpperCase();
	if (!upper || !/^[A-Z]{3}$/.test(upper)) {
		throw new Error(`Invalid currency code: ${String(currency)}`);
	}
	return upper;
};

const isoDateFromUnixSeconds = (seconds: number | null | undefined): string | null =>
	seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;

/**
 * Build a Scrada Peppol-only sales invoice payload from a `Stripe.Invoice`.
 *
 * The generated payload is the body for
 * `POST /v1/company/{companyID}/peppol/outbound/salesInvoice`.
 *
 * Document totals (`totalExclVat` / `totalVat` / `totalInclVat`) are
 * reconciled against Stripe's authoritative `invoice.total` and
 * `invoice.total_excluding_tax`, so any sub-cent rounding differences
 * between summed lines and the invoice header end up in the largest
 * VAT-rate group rather than producing a malformed document.
 */
export const buildScradaInvoiceFromStripeInvoice = (
	params: BuildScradaInvoiceParams,
): PeppolOnlyInvoice => {
	const { invoice, supplier, attachment } = params;
	const externalReferencePrefix = params.externalReferencePrefix ?? "stripe:";
	const externalReference =
		params.externalReference ?? `${externalReferencePrefix}${invoice.id}`;

	// Use finalized_at (when the invoice was issued) rather than created (when
	// the draft was first set up).
	const invoiceDateTimestamp =
		invoice.status_transitions?.finalized_at ?? invoice.created ?? null;
	const invoiceDate =
		isoDateFromUnixSeconds(invoiceDateTimestamp) ??
		new Date().toISOString().slice(0, 10);

	const invoiceExpiryDate = isoDateFromUnixSeconds(invoice.due_date);
	const { customer } = buildCustomerPartyFromStripeInvoice(invoice);

	const authoritativeTotalExclVat =
		invoice.total_excluding_tax != null
			? centsToDecimal(invoice.total_excluding_tax)
			: null;
	const authoritativeTotalVat =
		invoice.total_excluding_tax != null
			? centsToDecimal(invoice.total - invoice.total_excluding_tax)
			: null;

	const lines = buildInvoiceLines(invoice);
	const totals = buildVatTotals(
		lines,
		authoritativeTotalExclVat,
		authoritativeTotalVat,
	);

	return {
		number: invoice.number ?? invoice.id,
		externalReference,
		creditInvoice: false,
		invoiceDate,
		invoiceExpiryDate,
		supplier: buildSupplierParty(supplier),
		customer,
		totalExclVat: totals.totalExclVat,
		totalInclVat: totals.totalInclVat,
		totalVat: totals.totalVat,
		currency: validateCurrency(invoice.currency),
		note: normalizeString(invoice.description),
		lines,
		vatTotals: totals.vatTotals,
		...(attachment ? { attachments: [attachment] } : {}),
	};
};

export interface BuildScradaCreditInvoiceParams {
	/** Fully-retrieved Stripe credit note. */
	creditNote: Stripe.CreditNote;
	/** The original invoice — used to resolve customer party data. */
	invoice: Stripe.Invoice;
	supplier: ScradaSupplier;
	attachment?: ScradaInvoiceAttachment;
	externalReferencePrefix?: string;
	externalReference?: string;
}

/**
 * Build a Scrada Peppol-only credit invoice payload from a
 * `Stripe.CreditNote` and its parent `Stripe.Invoice`.
 *
 * The customer is resolved from the original invoice (Stripe credit notes
 * don't carry an independent customer address). Sets `creditInvoice: true`
 * so the receiver treats it as a credit document.
 */
export const buildScradaCreditInvoiceFromStripeCreditNote = (
	params: BuildScradaCreditInvoiceParams,
): PeppolOnlyInvoice => {
	const { creditNote, invoice, supplier, attachment } = params;
	const externalReferencePrefix = params.externalReferencePrefix ?? "stripe:";
	const externalReference =
		params.externalReference ?? `${externalReferencePrefix}${creditNote.id}`;

	const invoiceDate = creditNote.effective_at
		? new Date(creditNote.effective_at * 1000).toISOString().slice(0, 10)
		: new Date(creditNote.created * 1000).toISOString().slice(0, 10);

	const { customer } = buildCustomerPartyFromStripeInvoice(invoice);

	const authoritativeTotalExclVat =
		creditNote.total_excluding_tax != null
			? centsToDecimal(creditNote.total_excluding_tax)
			: null;
	const authoritativeTotalVat =
		creditNote.total_excluding_tax != null
			? centsToDecimal(creditNote.total - creditNote.total_excluding_tax)
			: null;

	const lines = buildCreditNoteLines(
		creditNote,
		normalizeString(invoice.description) ?? "Credit note",
	);
	const totals = buildVatTotals(
		lines,
		authoritativeTotalExclVat,
		authoritativeTotalVat,
	);

	return {
		number: creditNote.number ?? creditNote.id,
		externalReference,
		creditInvoice: true,
		invoiceDate,
		invoiceExpiryDate: null,
		supplier: buildSupplierParty(supplier),
		customer,
		totalExclVat: totals.totalExclVat,
		totalInclVat: totals.totalInclVat,
		totalVat: totals.totalVat,
		currency: validateCurrency(creditNote.currency),
		note:
			normalizeString(creditNote.memo) ??
			normalizeString(invoice.description) ??
			"Credit note",
		lines,
		vatTotals: totals.vatTotals,
		...(attachment ? { attachments: [attachment] } : {}),
	};
};
