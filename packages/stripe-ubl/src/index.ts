// ── Top-level builders ─────────────────────────────────────────────────

export {
	type BuildScradaCreditInvoiceParams,
	type BuildScradaInvoiceParams,
	buildScradaCreditInvoiceFromStripeCreditNote,
	buildScradaInvoiceFromStripeInvoice,
} from "./build";

// ── Supplier / customer party builders ─────────────────────────────────

export { buildCustomerPartyFromStripeInvoice } from "./customer";
export { buildSupplierParty, type ScradaSupplier } from "./supplier";

// ── Re-usable helpers (handy for callers building partial payloads) ────

export { normalizeAddress } from "./address";
export { buildPdfAttachment, sanitizeScradaPayloadForAudit } from "./attachment";
export {
	type CustomerTaxIdentifiers,
	extractCustomerTaxIdentifiers,
	listPeppolReceiverIdentifierCandidates,
	normalizeCompanyNumberForCountry,
	resolveTaxNumberType,
} from "./identifiers";
export { buildCreditNoteLines, buildInvoiceLines } from "./lines";
export { centsToDecimal, roundCurrency } from "./numeric";
export {
	getCreditNoteLineTaxAmounts,
	getInvoiceLineDiscountAmountCents,
	getInvoiceLineTaxAmounts,
} from "./tax-amounts";
export {
	EXEMPT_TAXABILITY_REASONS,
	resolveVatTypeFromTaxAmounts,
	type TaxAmountInfo,
	vatTypeFromCategoryOrRate,
} from "./vat";
export { type BuildVatTotalsResult, buildVatTotals } from "./vat-totals";
