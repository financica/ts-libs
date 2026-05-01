export const DEFAULT_SCRADA_API_BASE_URL = "https://api.scrada.be/v1";

/** Language sent in the Scrada `Language` request header (server may localize errors). */
export const SCRADA_LANGUAGE_HEADER = "EN";

// ── Peppol identifier scheme defaults ────────────────────────────────

export const DEFAULT_PEPPOL_SENDER_IDENTIFIER_SCHEME = "iso6523-actorid-upis";
/** ISO/IEC 6523 0208: Belgian enterprise number (KBO/BCE). */
export const DEFAULT_PEPPOL_COMPANY_IDENTIFIER_SCHEME = "0208";
/** ISO/IEC 6523 9925: Belgian VAT number scheme. */
export const DEFAULT_PEPPOL_VAT_IDENTIFIER_SCHEME = "9925";
export const DEFAULT_PEPPOL_DOCUMENT_TYPE_SCHEME = "busdox-docid-qns";
export const DEFAULT_PEPPOL_DOCUMENT_TYPE_VALUE =
	"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";
export const DEFAULT_PEPPOL_PROCESS_SCHEME = "cenbii-procid-ubl";
export const DEFAULT_PEPPOL_PROCESS_VALUE =
	"urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

// ── Scrada attachment file type codes ────────────────────────────────

/** Scrada `attachment.fileType` value for the primary invoice/credit note PDF. */
export const SCRADA_ATTACHMENT_FILE_TYPE_INVOICE = 1;
