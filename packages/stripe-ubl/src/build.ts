import {
	buildSupplierParty,
	buildTaxTotals,
	centsToDecimal,
	reconcileLinesToExclTotal,
	coerceLinesForSupplierVatStatus,
	serializeUblInvoice,
	type UblAttachment,
	type UblInvoice,
	type UblEndpoint,
	type UblLine,
	type UblSupplier,
} from "@financica/ubl/build";
import type Stripe from "stripe";
import { buildCreditNoteLines, buildInvoiceLines } from "./lines";
import { buildCustomerPartyFromStripeInvoice } from "./party";
import {
	resolveCreditNoteSettledCents,
	resolveInvoiceSettledCents,
	resolvePrepaidAmount,
} from "./settlement";
import { isoDateFromUnixSeconds, resolveInvoicePeriod } from "./period";
import { normalizeString, stripeInvoiceNote, toNumber } from "./utils";

const validateCurrency = (currency: string): string => {
	const upper = currency.toUpperCase();
	if (!upper || !/^[A-Z]{3}$/.test(upper)) {
		throw new Error(`Invalid currency code: ${String(currency)}`);
	}
	return upper;
};

const authoritativeExclVat = (
	totalExcludingTax: number | null | undefined,
): number | null =>
	totalExcludingTax != null ? centsToDecimal(totalExcludingTax) : null;

/**
 * Build the VAT breakdown and monetary totals, folding in BT-113 when the
 * document is partly or fully settled.
 *
 * The prepaid figure is fed back through `buildTaxTotals` rather than having
 * `payableAmount` adjusted here, so BR-CO-16
 * (BT-115 = BT-112 − BT-113 + BT-114) stays owned by one place. That needs
 * BT-112 up front to resolve the fully-settled case, hence the two passes; both
 * are pure.
 */
const buildTotalsWithSettlement = (
	lines: UblLine[],
	settledCents: number,
	grossCents: number,
) => {
	const totals = buildTaxTotals(lines);
	const prepaidAmount = resolvePrepaidAmount({
		settledCents,
		grossCents,
		taxInclusiveAmount: totals.monetaryTotal.taxInclusiveAmount ?? 0,
	});
	return prepaidAmount === undefined
		? totals
		: buildTaxTotals(lines, { prepaidAmount });
};

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
 * Build a Peppol BIS Billing 3.0 invoice {@link UblInvoice} from a
 * `Stripe.Invoice`.
 *
 * Line nets are reconciled against Stripe's authoritative
 * `invoice.total_excluding_tax`, and the VAT breakdown is derived from the
 * reconciled lines (see {@link buildTaxTotals}).
 */
export const buildUblInvoiceDocument = (params: BuildUblInvoiceParams): UblInvoice => {
	const { invoice, supplier, attachment } = params;

	// Use finalized_at (when the invoice was issued) rather than created (when
	// the draft was first set up).
	const invoiceDateTimestamp =
		invoice.status_transitions?.finalized_at ?? invoice.created ?? null;
	const issueDate =
		isoDateFromUnixSeconds(invoiceDateTimestamp) ??
		new Date().toISOString().slice(0, 10);

	const buyer = buildCustomerPartyFromStripeInvoice(invoice, params.customerEndpoint);

	let lines = coerceLinesForSupplierVatStatus(
		buildInvoiceLines(invoice),
		supplier.vatStatus,
		supplier.countryCode,
	);
	const authExcl = authoritativeExclVat(invoice.total_excluding_tax);
	if (authExcl != null) lines = reconcileLinesToExclTotal(lines, authExcl);
	const { taxTotal, monetaryTotal } = buildTotalsWithSettlement(
		lines,
		resolveInvoiceSettledCents(invoice),
		toNumber(invoice.total),
	);

	return {
		documentType: "Invoice",
		id: invoice.number ?? invoice.id,
		issueDate,
		// BT-9. Peppol BR-CO-25 requires a payment due date (or payment terms)
		// whenever a positive amount is payable. Stripe `charge_automatically`
		// invoices carry no `due_date`, so fall back to the issue date (due on
		// receipt) to keep such an invoice schematron-valid. A fully-settled
		// invoice reports a payable amount of 0, so BR-CO-25 does not apply and
		// no due date is invented — it would put a date on the wire for an
		// invoice that is not due.
		dueDate:
			isoDateFromUnixSeconds(invoice.due_date) ??
			((monetaryTotal.payableAmount ?? 0) > 0 ? issueDate : undefined),
		note: stripeInvoiceNote(invoice) ?? undefined,
		currency: validateCurrency(invoice.currency),
		buyerReference: normalizeString(params.buyerReference) ?? undefined,
		// BT-73/BT-74. A subscription invoice that does not say what it bills
		// for forces the receiver to infer it from the issue date, which is
		// exactly what goes wrong across a year end.
		invoicePeriod: resolveInvoicePeriod(invoice),
		seller: buildSupplierParty(supplier),
		buyer,
		lines,
		taxTotal,
		monetaryTotal,
		attachments: attachment ? [attachment] : [],
	};
};

/** Build a BIS Billing 3.0 invoice as a UBL XML string from a `Stripe.Invoice`. */
export const buildUblInvoiceFromStripeInvoice = (
	params: BuildUblInvoiceParams,
): string => serializeUblInvoice(buildUblInvoiceDocument(params));

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

// BT-21+BT-22 in one cbc:Note: `#ACD#<text>` per the EN 16931 UBL binding.
const creditNoteReasonNote = (
	creditNote: Pick<Stripe.CreditNote, "reason">,
): string | null => {
	const reason = normalizeString(creditNote.reason);
	return reason ? `#ACD#${reason.replace(/_/g, " ")}` : null;
};

/**
 * Build a Peppol BIS Billing 3.0 credit note {@link UblInvoice} from a
 * `Stripe.CreditNote` and its parent `Stripe.Invoice`.
 *
 * The customer is resolved from the original invoice (Stripe credit notes don't
 * carry an independent customer address), and the original invoice number is
 * referenced via `cac:BillingReference` (BT-25).
 */
export const buildUblCreditNoteDocument = (
	params: BuildUblCreditNoteParams,
): UblInvoice => {
	const { creditNote, invoice, supplier, attachment } = params;

	const issueDate =
		isoDateFromUnixSeconds(creditNote.effective_at) ??
		new Date(creditNote.created * 1000).toISOString().slice(0, 10);

	const buyer = buildCustomerPartyFromStripeInvoice(invoice, params.customerEndpoint);

	let lines = coerceLinesForSupplierVatStatus(
		buildCreditNoteLines(
			creditNote,
			normalizeString(invoice.description) ?? "Credit note",
		),
		supplier.vatStatus,
		supplier.countryCode,
	);
	const authExcl = authoritativeExclVat(creditNote.total_excluding_tax);
	if (authExcl != null) lines = reconcileLinesToExclTotal(lines, authExcl);
	const { taxTotal, monetaryTotal } = buildTotalsWithSettlement(
		lines,
		resolveCreditNoteSettledCents(creditNote),
		toNumber(creditNote.total),
	);

	return {
		documentType: "CreditNote",
		id: creditNote.number ?? creditNote.id,
		issueDate,
		// The memo is the sender's own words. Without one, a Stripe credit
		// reason travels as a BT-21 coded note (UNTDID 4451 `ACD` = Reason),
		// the EN 16931 way of marking a note as the credit's reason.
		note:
			normalizeString(creditNote.memo) ??
			creditNoteReasonNote(creditNote) ??
			normalizeString(invoice.description) ??
			"Credit note",
		currency: validateCurrency(creditNote.currency),
		buyerReference: normalizeString(params.buyerReference) ?? undefined,
		billingReference: { invoiceId: invoice.number ?? invoice.id },
		seller: buildSupplierParty(supplier),
		buyer,
		lines,
		taxTotal,
		monetaryTotal,
		attachments: attachment ? [attachment] : [],
	};
};

/** Build a BIS Billing 3.0 credit note as a UBL XML string. */
export const buildUblCreditNoteFromStripeCreditNote = (
	params: BuildUblCreditNoteParams,
): string => serializeUblInvoice(buildUblCreditNoteDocument(params));
