// Generic Peppol BIS Billing 3.0 UBL build core: a document model, a
// serializer, and the party/tax/identifier/attachment builders shared by every
// "X → UBL" adapter (e.g. @financica/stripe-ubl, and app-specific row builders).
// Exposed under the `@financica/ubl/build` subpath so its build-side types do
// not collide with the parse-side types exported from the package root.

// ── UBL document model + serializer ────────────────────────────────────
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

// ── Party builder ──────────────────────────────────────────────────────
export { buildSupplierParty, type SupplierVatStatus, type UblSupplier } from "./party";

// ── Re-usable helpers ──────────────────────────────────────────────────
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
export { centsToDecimal, roundCurrency } from "./numeric";
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

// ── Low-level XML primitives ───────────────────────────────────────────
export { el, serializeDocument, type XmlAttrs, type XmlElement } from "./xml";
