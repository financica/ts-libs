// Generic Peppol BIS Billing 3.0 UBL build core: a serializer and the
// party/tax/identifier/attachment builders shared by every "X → UBL" adapter
// (e.g. @financica/stripe-ubl, and app-specific row builders). The document
// model is the one the parser produces (`../types`), re-exported here so a
// build-side caller needs only this subpath.

// ── UBL document model + serializer ────────────────────────────────────
export * from "./ubl/constants";
export { UblBuildError } from "../errors";
export { serializeUblDocument, serializeUblInvoice } from "./ubl/serialize";
export type {
	UblAddress,
	UblAttachment,
	UblBillingReference,
	UblCompanyId,
	UblEndpoint,
	UblInvoice,
	UblInvoicePeriod,
	UblLine,
	UblMonetaryTotal,
	UblParty,
	UblTaxCategory,
	UblTaxSubtotal,
	UblTaxTotal,
} from "../types";
import type {
	UblInvoice as _UblInvoice,
	UblInvoicePeriod as _UblInvoicePeriod,
} from "../types";
/** @deprecated The build and parse models are one; use {@link UblInvoice}. */
export type UblDocument = _UblInvoice;
/** @deprecated Use {@link UblInvoicePeriod}. */
export type UblPeriod = _UblInvoicePeriod;

// ── Party builders ─────────────────────────────────────────────────────
export {
	buildCustomerParty,
	buildSupplierParty,
	type SupplierVatStatus,
	type UblCustomer,
	type UblSupplier,
} from "./party";

// ── Re-usable helpers ──────────────────────────────────────────────────
export { type AddressInput, normalizeAddress } from "./address";
export { buildPdfAttachment, sanitizeUblDocumentForAudit } from "./attachment";
export {
	buildCompanyId,
	type CustomerTaxIdentifiers,
	type CustomerTaxIdInput,
	extractCustomerTaxIdentifiers,
	listPeppolReceiverIdentifierCandidates,
	normalizeCompanyNumberForCountry,
	parsePeppolEndpoint,
	resolveCompanyIdScheme,
	resolveVatEndpoint,
} from "./identifiers";
export {
	centsToDecimal,
	deriveUnitPrice,
	roundCurrency,
	type UnitPrice,
} from "./numeric";
export {
	coerceLinesForSupplierVatStatus,
	EXEMPT_TAXABILITY_REASONS,
	resolveTaxCategoryFromTaxAmounts,
	type TaxAmountInfo,
	taxCategoryFromReasonOrRate,
} from "./tax-category";
export {
	type BuildTaxTotalsOptions,
	type BuildTaxTotalsResult,
	buildTaxTotals,
	reconcileLinesToExclTotal,
} from "./tax-totals";

// ── Low-level XML primitives ───────────────────────────────────────────
export { el, serializeDocument, type XmlAttrs, type XmlElement } from "./xml";
