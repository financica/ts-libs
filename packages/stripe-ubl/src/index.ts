// ── Top-level builders (Stripe → UBL) ──────────────────────────────────

export {
	type BuildUblCreditNoteParams,
	type BuildUblInvoiceParams,
	buildUblCreditNoteDocument,
	buildUblCreditNoteFromStripeCreditNote,
	buildUblInvoiceDocument,
	buildUblInvoiceFromStripeInvoice,
} from "./build";

// ── UBL model + serializer ─────────────────────────────────────────────

export * from "./ubl/constants";
export { serializeUblDocument } from "./ubl/serialize";
export type {
	UblAddress,
	UblAttachment,
	UblCompanyId,
	UblDocument,
	UblEndpoint,
	UblLine,
	UblMonetaryTotal,
	UblParty,
	UblTaxCategory,
	UblTaxSubtotal,
	UblTaxTotal,
} from "./ubl/types";

// ── Party builders ─────────────────────────────────────────────────────

export {
	buildCustomerPartyFromStripeInvoice,
	buildSupplierParty,
	type SupplierVatStatus,
	type UblSupplier,
} from "./party";

// ── Re-usable helpers (handy for callers building partial documents) ───

export { normalizeAddress } from "./address";
export { buildPdfAttachment, sanitizeUblDocumentForAudit } from "./attachment";
export {
	buildCompanyId,
	type CustomerTaxIdentifiers,
	extractCustomerTaxIdentifiers,
	listPeppolReceiverIdentifierCandidates,
	normalizeCompanyNumberForCountry,
	parsePeppolEndpoint,
	resolveCompanyIdScheme,
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
	resolveTaxCategoryFromTaxAmounts,
	type TaxAmountInfo,
	taxCategoryFromReasonOrRate,
} from "./tax-category";
export {
	type BuildTaxTotalsResult,
	buildTaxTotals,
	reconcileLinesToExclTotal,
} from "./tax-totals";

// ── Low-level XML primitives (for advanced/custom serialization) ───────

export { el, serializeDocument, type XmlAttrs, type XmlElement } from "./xml";
