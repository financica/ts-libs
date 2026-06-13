// @financica/stripe-ubl — a Stripe → Peppol BIS Billing 3.0 UBL adapter on top
// of the @financica/ubl build core. The generic UBL document model, serializer,
// and party/tax/identifier/attachment builders are re-exported from
// @financica/ubl/build so existing import paths keep working.

// ── UBL build core (re-exported from @financica/ubl/build) ─────────────
export * from "@financica/ubl/build";
// ── Stripe → UBL builders ──────────────────────────────────────────────
export {
	type BuildUblCreditNoteParams,
	type BuildUblInvoiceParams,
	buildUblCreditNoteDocument,
	buildUblCreditNoteFromStripeCreditNote,
	buildUblInvoiceDocument,
	buildUblInvoiceFromStripeInvoice,
} from "./build";
export { buildCreditNoteLines, buildInvoiceLines } from "./lines";
export { buildCustomerPartyFromStripeInvoice } from "./party";
export {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "./tax-amounts";
