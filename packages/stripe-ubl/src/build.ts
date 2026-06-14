import {
	buildSupplierParty,
	buildTaxTotals,
	centsToDecimal,
	reconcileLinesToExclTotal,
	type SupplierVatStatus,
	serializeUblDocument,
	type UblAttachment,
	type UblDocument,
	type UblEndpoint,
	type UblLine,
	type UblSupplier,
} from "@financica/ubl/build";
import type Stripe from "stripe";
import { buildCreditNoteLines, buildInvoiceLines } from "./lines";
import { buildCustomerPartyFromStripeInvoice } from "./party";
import { normalizeString } from "./utils";

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
 * When the supplier does not charge VAT (status 2/3), coerce every line to a
 * non-charging exempt category with an appropriate reason so the document
 * reports no VAT, regardless of what the upstream line tax data implied.
 */
const coerceForVatStatus = (
	lines: UblLine[],
	vatStatus: SupplierVatStatus,
): UblLine[] => {
	if (vatStatus === 1) return lines;
	const exemptionReason =
		vatStatus === 3
			? "Exempt — small business scheme (Article 56bis)"
			: "Seller not subject to VAT";
	return lines.map((line) => ({
		...line,
		taxCategory: { id: "E", percent: 0, exemptionReason },
	}));
};

const authoritativeExclVat = (
	totalExcludingTax: number | null | undefined,
): number | null =>
	totalExcludingTax != null ? centsToDecimal(totalExcludingTax) : null;

export interface BuildUblInvoiceParams {
	/** Fully-retrieved Stripe invoice. See the README for the recommended `expand`. */
	invoice: Stripe.Invoice;
	/** Caller-resolved supplier data. */
	supplier: UblSupplier;
	/** Optional embedded attachment (e.g. the rendered PDF). */
	attachment?: UblAttachment;
	/** Optional buyer reference (BT-10). */
	buyerReference?: string | null;
	/**
	 * Override the customer Peppol `EndpointID` (BT-49). Set this to the
	 * identifier a caller resolved as registered on the network (e.g. after a
	 * participant lookup), so the routed document matches what was confirmed
	 * reachable. When omitted, the endpoint is derived from the invoice.
	 */
	customerEndpoint?: UblEndpoint | null;
}

/**
 * Build a Peppol BIS Billing 3.0 invoice {@link UblDocument} from a
 * `Stripe.Invoice`.
 *
 * Line nets are reconciled against Stripe's authoritative
 * `invoice.total_excluding_tax`, and the VAT breakdown is derived from the
 * reconciled lines (see {@link buildTaxTotals}).
 */
export const buildUblInvoiceDocument = (params: BuildUblInvoiceParams): UblDocument => {
	const { invoice, supplier, attachment } = params;

	// Use finalized_at (when the invoice was issued) rather than created (when
	// the draft was first set up).
	const invoiceDateTimestamp =
		invoice.status_transitions?.finalized_at ?? invoice.created ?? null;
	const issueDate =
		isoDateFromUnixSeconds(invoiceDateTimestamp) ??
		new Date().toISOString().slice(0, 10);

	const { customer } = buildCustomerPartyFromStripeInvoice(
		invoice,
		params.customerEndpoint,
	);

	let lines = coerceForVatStatus(buildInvoiceLines(invoice), supplier.vatStatus);
	const authExcl = authoritativeExclVat(invoice.total_excluding_tax);
	if (authExcl != null) lines = reconcileLinesToExclTotal(lines, authExcl);
	const { taxTotal, monetaryTotal } = buildTaxTotals(lines);

	return {
		documentType: "invoice",
		id: invoice.number ?? invoice.id,
		issueDate,
		dueDate: isoDateFromUnixSeconds(invoice.due_date),
		note: normalizeString(invoice.description),
		currency: validateCurrency(invoice.currency),
		buyerReference: normalizeString(params.buyerReference),
		precedingInvoiceId: null,
		supplier: buildSupplierParty(supplier),
		customer,
		lines,
		taxTotal,
		monetaryTotal,
		attachments: attachment ? [attachment] : [],
	};
};

/** Build a BIS Billing 3.0 invoice as a UBL XML string from a `Stripe.Invoice`. */
export const buildUblInvoiceFromStripeInvoice = (
	params: BuildUblInvoiceParams,
): string => serializeUblDocument(buildUblInvoiceDocument(params));

export interface BuildUblCreditNoteParams {
	/** Fully-retrieved Stripe credit note. */
	creditNote: Stripe.CreditNote;
	/** The original invoice — used to resolve the customer party and BT-25 reference. */
	invoice: Stripe.Invoice;
	supplier: UblSupplier;
	attachment?: UblAttachment;
	buyerReference?: string | null;
	/** See {@link BuildUblInvoiceParams.customerEndpoint}. */
	customerEndpoint?: UblEndpoint | null;
}

/**
 * Build a Peppol BIS Billing 3.0 credit note {@link UblDocument} from a
 * `Stripe.CreditNote` and its parent `Stripe.Invoice`.
 *
 * The customer is resolved from the original invoice (Stripe credit notes don't
 * carry an independent customer address), and the original invoice number is
 * referenced via `cac:BillingReference` (BT-25).
 */
export const buildUblCreditNoteDocument = (
	params: BuildUblCreditNoteParams,
): UblDocument => {
	const { creditNote, invoice, supplier, attachment } = params;

	const issueDate = creditNote.effective_at
		? new Date(creditNote.effective_at * 1000).toISOString().slice(0, 10)
		: new Date(creditNote.created * 1000).toISOString().slice(0, 10);

	const { customer } = buildCustomerPartyFromStripeInvoice(
		invoice,
		params.customerEndpoint,
	);

	let lines = coerceForVatStatus(
		buildCreditNoteLines(
			creditNote,
			normalizeString(invoice.description) ?? "Credit note",
		),
		supplier.vatStatus,
	);
	const authExcl = authoritativeExclVat(creditNote.total_excluding_tax);
	if (authExcl != null) lines = reconcileLinesToExclTotal(lines, authExcl);
	const { taxTotal, monetaryTotal } = buildTaxTotals(lines);

	return {
		documentType: "creditNote",
		id: creditNote.number ?? creditNote.id,
		issueDate,
		dueDate: null,
		note:
			normalizeString(creditNote.memo) ??
			normalizeString(invoice.description) ??
			"Credit note",
		currency: validateCurrency(creditNote.currency),
		buyerReference: normalizeString(params.buyerReference),
		precedingInvoiceId: invoice.number ?? invoice.id ?? null,
		supplier: buildSupplierParty(supplier),
		customer,
		lines,
		taxTotal,
		monetaryTotal,
		attachments: attachment ? [attachment] : [],
	};
};

/** Build a BIS Billing 3.0 credit note as a UBL XML string. */
export const buildUblCreditNoteFromStripeCreditNote = (
	params: BuildUblCreditNoteParams,
): string => serializeUblDocument(buildUblCreditNoteDocument(params));
