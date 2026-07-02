/**
 * Peppol BIS Billing 3.0 document type identifiers and a classifier for the
 * raw busdox document type ids advertised by an SMP.
 *
 * Free of Node built-ins, so it is safe to import in a browser bundle (e.g. to
 * label the document types returned by {@link lookupPeppolParticipant}).
 */

/** Canonical Peppol BIS Billing 3.0 invoice document type identifier. */
export const PEPPOL_BIS_INVOICE_DOCUMENT_TYPE =
	"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";

/** Canonical Peppol BIS Billing 3.0 credit note document type identifier. */
export const PEPPOL_BIS_CREDIT_NOTE_DOCUMENT_TYPE =
	"urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";

/** Peppol BIS Billing 3.0 process (profile) identifier. */
export const PEPPOL_BIS_BILLING_PROCESS =
	"urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

/** Peppol BIS Self-Billing 3.0 invoice document type identifier. */
export const PEPPOL_BIS_SELFBILLING_INVOICE_DOCUMENT_TYPE =
	"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0::2.1";

/** Peppol BIS Self-Billing 3.0 credit note document type identifier. */
export const PEPPOL_BIS_SELFBILLING_CREDIT_NOTE_DOCUMENT_TYPE =
	"urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0::2.1";

/** Peppol BIS Self-Billing 3.0 process (profile) identifier. */
export const PEPPOL_BIS_SELFBILLING_PROCESS =
	"urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0";

/** Peppol Invoice Response (business-level accept/reject) document type identifier. */
export const PEPPOL_BIS_INVOICE_RESPONSE_DOCUMENT_TYPE =
	"urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:fdc:peppol.eu:poacc:trns:invoice_response:3::2.1";

/** Peppol Invoice Response process (profile) identifier. */
export const PEPPOL_BIS_INVOICE_RESPONSE_PROCESS =
	"urn:fdc:peppol.eu:poacc:bis:invoice_response:3";

/**
 * Coarse families of Peppol BIS document types, enough to tell a user what a
 * participant can receive. `other` is the catch-all for anything we don't label.
 */
export type PeppolDocumentTypeKind =
	| "invoice"
	| "credit-note"
	| "self-billing-invoice"
	| "self-billing-credit-note"
	| "invoice-response"
	| "message-level-response"
	| "order"
	| "order-response"
	| "despatch-advice"
	| "catalogue"
	| "reminder"
	| "other";

/**
 * Classify a raw busdox document type identifier (the decoded value behind an
 * SMP `ServiceMetadataReference` href) into a {@link PeppolDocumentTypeKind}.
 *
 * The identifier encodes the root UBL element and a customization id, e.g.
 * `…:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1`.
 * We match on the root element first, then refine with the customization (self
 * billing, invoice response vs. message level response).
 */
export const classifyPeppolDocumentType = (rawId: string): PeppolDocumentTypeKind => {
	const haystack = rawId.toLowerCase();
	const isSelfBilling =
		haystack.includes("selfbilling") || haystack.includes("self-billing");

	if (haystack.includes("::invoice##") || haystack.includes(":invoice-2::invoice")) {
		return isSelfBilling ? "self-billing-invoice" : "invoice";
	}
	if (haystack.includes(":creditnote-2::creditnote")) {
		return isSelfBilling ? "self-billing-credit-note" : "credit-note";
	}
	if (haystack.includes(":applicationresponse-2::applicationresponse")) {
		if (
			haystack.includes("invoice_response") ||
			haystack.includes("invoiceresponse")
		) {
			return "invoice-response";
		}
		return "message-level-response";
	}
	if (haystack.includes(":orderresponse")) return "order-response";
	if (haystack.includes(":order-2::order")) return "order";
	if (haystack.includes(":despatchadvice-2::despatchadvice")) return "despatch-advice";
	if (haystack.includes(":catalogue-2::catalogue")) return "catalogue";
	if (haystack.includes(":reminder-2::reminder")) return "reminder";
	return "other";
};
