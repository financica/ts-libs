/**
 * Code lists used by EN 16931 / Factur-X documents. These are pragmatic
 * subsets of the underlying UNTDID / UN/ECE / ISO code lists covering the
 * codes that appear in real invoices; every field also accepts a plain
 * string so uncommon codes still round-trip.
 */

/** UNTDID 1001 — document type (BT-3). */
export const DOCUMENT_TYPE_CODES = {
	COMMERCIAL_INVOICE: "380",
	CREDIT_NOTE: "381",
	CORRECTED_INVOICE: "384",
	PREPAYMENT_INVOICE: "386",
	SELF_BILLED_INVOICE: "389",
	SELF_BILLED_CREDIT_NOTE: "261",
	DEBIT_NOTE: "383",
	INVOICE_INFORMATION: "751",
} as const;
export type DocumentTypeCode =
	(typeof DOCUMENT_TYPE_CODES)[keyof typeof DOCUMENT_TYPE_CODES];

/** UNTDID 5305 — VAT category (BT-95/BT-102/BT-118/BT-151). */
export const TAX_CATEGORY_CODES = {
	STANDARD_RATE: "S",
	ZERO_RATED_GOODS: "Z",
	EXEMPT_FROM_TAX: "E",
	VAT_REVERSE_CHARGE: "AE",
	INTRA_COMMUNITY_SUPPLY: "K",
	FREE_EXPORT_ITEM: "G",
	OUTSIDE_SCOPE_OF_TAX: "O",
	CANARY_ISLANDS_IGIC: "L",
	CEUTA_MELILLA_IPSI: "M",
} as const;
export type TaxCategoryCode =
	(typeof TAX_CATEGORY_CODES)[keyof typeof TAX_CATEGORY_CODES];

/** VAT categories that carry no rate and require an exemption reason. */
export const ZERO_TAX_CATEGORY_CODES: readonly string[] = [
	TAX_CATEGORY_CODES.EXEMPT_FROM_TAX,
	TAX_CATEGORY_CODES.VAT_REVERSE_CHARGE,
	TAX_CATEGORY_CODES.INTRA_COMMUNITY_SUPPLY,
	TAX_CATEGORY_CODES.FREE_EXPORT_ITEM,
	TAX_CATEGORY_CODES.OUTSIDE_SCOPE_OF_TAX,
];

/** UNTDID 4461 — payment means (BT-81). */
export const PAYMENT_MEANS_CODES = {
	INSTRUMENT_NOT_DEFINED: "1",
	CASH: "10",
	CHEQUE: "20",
	CREDIT_TRANSFER: "30",
	PAYMENT_TO_BANK_ACCOUNT: "42",
	BANK_CARD: "48",
	DIRECT_DEBIT: "49",
	STANDING_AGREEMENT: "57",
	SEPA_CREDIT_TRANSFER: "58",
	SEPA_DIRECT_DEBIT: "59",
	ONLINE_PAYMENT_SERVICE: "68",
	CLEARING_BETWEEN_PARTNERS: "97",
} as const;
export type PaymentMeansCode =
	(typeof PAYMENT_MEANS_CODES)[keyof typeof PAYMENT_MEANS_CODES];

/** UN/ECE Recommendation 20/21 — unit of measure (BT-130). */
export const UNIT_CODES = {
	ONE: "C62",
	PIECE: "H87",
	HOUR: "HUR",
	MINUTE: "MIN",
	DAY: "DAY",
	WEEK: "WEE",
	MONTH: "MON",
	YEAR: "ANN",
	KILOGRAM: "KGM",
	GRAM: "GRM",
	TONNE: "TNE",
	LITRE: "LTR",
	METRE: "MTR",
	KILOMETRE: "KMT",
	SQUARE_METRE: "MTK",
	CUBIC_METRE: "MTQ",
	SET: "SET",
	PACKAGE: "XPK",
	KILOWATT_HOUR: "KWH",
} as const;
export type UnitCode = (typeof UNIT_CODES)[keyof typeof UNIT_CODES];

/**
 * ISO 6523 ICD — identification scheme codes for party/legal-organization
 * identifiers (schemeID on BT-30/BT-47 and global ids).
 */
export const IDENTIFIER_SCHEMES = {
	/** France — SIRENE (SIREN). */
	SIREN: "0002",
	/** France — SIRET. */
	SIRET: "0009",
	/** Dun & Bradstreet DUNS. */
	DUNS: "0060",
	/** GS1 GLN (EAN location code). */
	GLN: "0088",
	/** Netherlands — KVK. */
	KVK: "0106",
	/** Belgium — Crossroads Bank of Enterprises. */
	BE_CBE: "0208",
	/** Germany — Leitweg-ID. */
	DE_LEITWEG: "0204",
	/** Legal Entity Identifier. */
	LEI: "0199",
	/** Luxembourg — matricule. */
	LU_MATRICULE: "0240",
} as const;
export type IdentifierSchemeCode =
	(typeof IDENTIFIER_SCHEMES)[keyof typeof IDENTIFIER_SCHEMES];

/** UNTDID 1153 vocabulary used in note subject codes (BT-21) — free strings. */
export const NOTE_SUBJECT_CODES = {
	GENERAL_INFORMATION: "AAI",
	REGULATORY_INFORMATION: "REG",
	LEGAL_INFORMATION: "ABL",
	TAX_INFORMATION: "TXD",
	CUSTOMS_INFORMATION: "CUS",
	PAYMENT_INFORMATION: "PMT",
} as const;
