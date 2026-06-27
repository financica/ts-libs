/**
 * Types for the shared eDavki envelope (EDP-Common-1.xsd).
 *
 * Every eDavki document is wrapped in an `Envelope` whose `Header` carries the
 * taxpayer this filing is for. The header lives in the EDP-Common namespace and
 * is identical across document types (DDV-O, ledgers, income-tax forms, ...).
 */

/** EDP-Common namespace, shared by every eDavki document's header/signatures. */
export const NS_EDP = "http://edavki.durs.si/Documents/Schemas/EDP-Common-1.xsd";

/** `taxpayerTypeType`: natural person / legal person / sole trader. */
export type EdpTaxpayerType = "FO" | "PO" | "SP";

/**
 * The taxpayer a document is filed for (`taxPayerType`). Provide exactly one of
 * `taxNumber` (8 digits) or `vatNumber` (e.g. `SI12345678`). All other fields
 * are optional; FURS resolves the rest from the tax register on submission.
 */
export interface EdpTaxpayer {
	/** 8-digit Slovenian tax number (davčna številka). */
	taxNumber?: string;
	/** VAT identification number, e.g. `SI12345678`. */
	vatNumber?: string;
	/** FO (natural), PO (legal), SP (sole trader). */
	taxpayerType?: EdpTaxpayerType;
	name?: string;
	address1?: string;
	address2?: string;
	city?: string;
	postNumber?: string;
	postName?: string;
	/** Registration number (matična številka). */
	registrationNumber?: string;
	/** ISO 3166-1 alpha-2 country code. */
	countryID?: string;
	countryName?: string;
}
