/** Peppol BIS Billing 3.0 / EN 16931 identifiers and fixed code values. */

/** EN 16931 + Peppol BIS Billing 3.0 customization (BT-24). */
export const UBL_CUSTOMIZATION_ID =
	"urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";

/** Peppol BIS Billing 3.0 process (BT-23). */
export const UBL_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

/** UNTDID 1001 — commercial invoice. */
export const INVOICE_TYPE_CODE = "380";
/** UNTDID 1001 — credit note. */
export const CREDIT_NOTE_TYPE_CODE = "381";

/** UN/ECE Recommendation 20 — "one / piece" (the default line unit). */
export const DEFAULT_UNIT_CODE = "C62";

/** UNCL5153 — the VAT tax scheme identifier. */
export const VAT_TAX_SCHEME_ID = "VAT";

/** ISO 3166-1 alpha-2 list identifier for `cbc:IdentificationCode`. */
export const COUNTRY_CODE_LIST_ID = "ISO3166-1:Alpha2";

export const NS_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
export const NS_CREDIT_NOTE =
	"urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
export const NS_CAC =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
export const NS_CBC =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
