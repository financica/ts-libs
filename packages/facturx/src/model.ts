/**
 * The Factur-X / ZUGFeRD invoice data model.
 *
 * One shape is shared by the parser and the generator: `parseFacturXXml`
 * returns a `FacturXInvoice` with whatever the source document carried, and
 * `buildFacturXXml` serializes a `FacturXInvoice` back to CII XML. Field
 * names follow EN 16931 business terms (BT-n references in comments) rather
 * than the raw CII element names.
 *
 * Amounts are plain JS numbers; dates are ISO strings ("YYYY-MM-DD").
 */

/** Calendar date as an ISO "YYYY-MM-DD" string. */
export type IsoDate = string;

/** BG-1 — invoice note. */
export interface Note {
	content: string;
	/** BT-21 — UNTDID 4451 subject qualifier. */
	subjectCode?: string;
}

/** BG-5 / BG-8 / BG-15 — postal address. */
export interface PostalAddress {
	line1?: string;
	line2?: string;
	line3?: string;
	postcode?: string;
	city?: string;
	/** BT-39/BT-54 — country subdivision (region/state). */
	countrySubdivision?: string;
	/** ISO 3166-1 alpha-2 country code. */
	country?: string;
}

/** An identifier optionally qualified by an ISO 6523 scheme code. */
export interface SchemedId {
	id: string;
	schemeId?: string;
}

/** BT-30/BT-47 — legal registration of a party. */
export interface LegalOrganization {
	id?: SchemedId;
	/** BT-28/BT-45 — trading name when it differs from the legal name. */
	tradingName?: string;
}

/** BG-6 / BG-9 — contact person. */
export interface TradeContact {
	name?: string;
	department?: string;
	phone?: string;
	email?: string;
}

/** BG-4 (seller), BG-7 (buyer), BG-10 (payee), BG-13 (deliver-to). */
export interface TradeParty {
	name?: string;
	/** BT-29/BT-46 — plain party identifiers. */
	ids?: string[];
	/** BT-29-1/BT-46-1 — scheme-qualified identifiers (GLN, DUNS, ...). */
	globalIds?: SchemedId[];
	legalOrganization?: LegalOrganization;
	/** BT-33 — additional legal information (seller only). */
	description?: string;
	address?: PostalAddress;
	/** BT-34/BT-49 — electronic address (URIUniversalCommunication). */
	electronicAddress?: SchemedId;
	/** BT-31/BT-48 — VAT identifier (SpecifiedTaxRegistration schemeID "VA"). */
	vatId?: string;
	/** BT-32 — local tax registration (schemeID "FC"). */
	taxId?: string;
	contact?: TradeContact;
}

/** BG-17 — payee bank account. */
export interface BankAccount {
	iban?: string;
	accountName?: string;
	/** BT-84-0 — proprietary (non-IBAN) account number. */
	proprietaryId?: string;
	/** BT-86 — payment service provider BIC. */
	bic?: string;
}

/** BG-16 — payment instructions. */
export interface PaymentMeans {
	/** BT-81 — UNTDID 4461 payment means code. */
	typeCode: string;
	/** BT-82 — payment means text. */
	information?: string;
	/** BG-18 — payment card. */
	card?: { id: string; holderName?: string };
	/** BT-91 — debited account IBAN (direct debit). */
	payerIban?: string;
	payeeAccount?: BankAccount;
}

/** BT-20 / BT-9 — payment terms. */
export interface PaymentTerms {
	description?: string;
	/** BT-9 — payment due date. */
	dueDate?: IsoDate;
	/** BT-89 — SEPA mandate reference (direct debit). */
	directDebitMandateId?: string;
}

/** VAT treatment applied to a line or an allowance/charge. */
export interface Tax {
	/** BT-151/BT-95/BT-102 — UNTDID 5305 category code. */
	categoryCode: string;
	/** Category rate in percent (e.g. 21 for 21%). */
	rateApplicablePercent?: number;
	/** BT-151-0 — tax type; "VAT" in EN 16931. */
	typeCode?: string;
}

/** BG-27/BG-28 (line level) — allowance or charge. */
export interface AllowanceCharge {
	actualAmount: number;
	basisAmount?: number;
	/** Percentage used to compute the amount from the basis. */
	calculationPercent?: number;
	reason?: string;
	/** UNTDID 5189 (allowances) / 7161 (charges). */
	reasonCode?: string;
}

/** BG-20/BG-21 (document level) — allowance or charge with its VAT category. */
export interface DocumentAllowanceCharge extends AllowanceCharge {
	tax: Tax;
}

/** BT-146/BT-148 — item price. */
export interface Price {
	amount: number;
	/** BT-149 — number of item units the price applies to (default 1). */
	basisQuantity?: number;
	basisQuantityUnit?: string;
}

/** BG-31 — item information. */
export interface Product {
	name: string;
	description?: string;
	/** BT-155 — seller's item identifier. */
	sellerAssignedId?: string;
	/** BT-156 — buyer's item identifier. */
	buyerAssignedId?: string;
	/** BT-157 — standard item identifier (e.g. GTIN, schemeId "0160"). */
	globalId?: SchemedId;
	/** BG-32 — item attributes. */
	attributes?: { name: string; value: string }[];
	/** BT-159 — item country of origin. */
	originCountry?: string;
}

export interface BillingPeriod {
	start?: IsoDate;
	end?: IsoDate;
}

/** BG-25 — invoice line. */
export interface InvoiceLine {
	/** BT-126 — line identifier. */
	id: string;
	/** BT-127 — line note. */
	note?: string;
	product: Product;
	/** BT-148 — gross unit price with optional price discounts. */
	grossPrice?: Price & { allowances?: AllowanceCharge[] };
	/**
	 * BT-146 — net unit price. When omitted on generation it is derived
	 * from `grossPrice` minus its allowances.
	 */
	netPrice?: Price;
	/** BT-129 — billed quantity. */
	quantity: number;
	/** BT-130 — UN/ECE Rec 20/21 unit code. */
	unitCode: string;
	/** BT-132 — referenced purchase order line. */
	buyerOrderLineReference?: string;
	tax: Tax;
	billingPeriod?: BillingPeriod;
	allowances?: AllowanceCharge[];
	charges?: AllowanceCharge[];
	/** BT-133 — buyer accounting reference. */
	buyerAccountingReference?: string;
	/**
	 * BT-131 — line net amount. Computed by `computeTotals` on generation;
	 * populated from the document on parse.
	 */
	netTotal?: number;
}

/** BG-23 — one row of the VAT breakdown. */
export interface TaxBreakdownEntry {
	/** BT-117 — category tax amount. */
	calculatedAmount: number;
	/** BT-118-0 — "VAT". */
	typeCode?: string;
	/** BT-120 — exemption reason text. */
	exemptionReason?: string;
	/** BT-121 — exemption reason code (VATEX). */
	exemptionReasonCode?: string;
	/** BT-116 — taxable base for this category. */
	basisAmount: number;
	/** BT-118 — UNTDID 5305 category code. */
	categoryCode: string;
	/** BT-119 — category rate in percent. */
	rateApplicablePercent?: number;
	/** BT-7 — value added tax point date. */
	taxPointDate?: IsoDate;
	/** BT-8 — UNTDID 2005 tax point date code (5, 29, 72). */
	dueDateTypeCode?: string;
}

/** BG-22 — document totals. */
export interface MonetarySummation {
	/** BT-106 — sum of line net amounts. */
	lineTotal?: number;
	/** BT-108 — sum of document-level charges. */
	chargeTotal?: number;
	/** BT-107 — sum of document-level allowances. */
	allowanceTotal?: number;
	/** BT-109 — total without VAT. */
	taxBasisTotal?: number;
	/** BT-110 — total VAT amount (in the invoice currency). */
	taxTotal?: number;
	/** BT-111 — total VAT in the accounting currency, when it differs. */
	taxTotalInTaxCurrency?: number;
	/** BT-114 — rounding of the amount due. */
	roundingAmount?: number;
	/** BT-112 — total with VAT. */
	grandTotal?: number;
	/** BT-113 — amount already paid. */
	prepaidAmount?: number;
	/** BT-115 — amount due for payment. */
	duePayable?: number;
}

/** BG-3 — reference to a preceding invoice (credit notes, corrections). */
export interface DocumentReference {
	id: string;
	issueDate?: IsoDate;
}

/** BG-24 — additional supporting document. */
export interface AdditionalReference {
	id: string;
	/** UNTDID 1001 — 916 supporting, 50 tender, 130 invoiced object. */
	typeCode?: string;
	name?: string;
	uri?: string;
	/** Embedded binary (BT-125); base64 payload with its MIME type. */
	attachment?: { base64: string; mimeType: string; filename?: string };
}

/** A complete Factur-X / ZUGFeRD / CII invoice document. */
export interface FacturXInvoice {
	/**
	 * Guideline identifier (BT-24) — one of the `PROFILE_URNS` values or any
	 * other CIUS URN found in the source document.
	 */
	profile?: string;
	/** BT-23 — business process type (e.g. "A1"). */
	businessProcessType?: string;
	/** BT-1 — invoice number. */
	id: string;
	/** BT-3 — UNTDID 1001 document type code. */
	typeCode: string;
	/** BT-2 — issue date. */
	issueDate: IsoDate;
	/** BT-5 — invoice currency (ISO 4217). */
	currency: string;
	/** BT-6 — VAT accounting currency, when it differs. */
	taxCurrency?: string;
	notes?: Note[];

	seller: TradeParty;
	buyer: TradeParty;
	/** BG-10 — payee, when different from the seller. */
	payee?: TradeParty;
	/** BG-11 — seller's tax representative. */
	sellerTaxRepresentative?: TradeParty;

	/** BT-10 — buyer reference (routing, e.g. Leitweg-ID / service code). */
	buyerReference?: string;
	/** BT-13 — purchase order reference. */
	purchaseOrderReference?: string;
	/** BT-14 — sales order reference. */
	salesOrderReference?: string;
	/** BT-12 — contract reference. */
	contractReference?: string;
	/** BT-16 — despatch advice reference. */
	despatchAdviceReference?: string;
	/** BT-15 — receiving advice reference. */
	receivingAdviceReference?: string;
	/** BT-11 — project reference. */
	projectReference?: { id: string; name?: string };
	additionalReferences?: AdditionalReference[];
	/** BG-3 — preceding invoice references. */
	precedingInvoices?: DocumentReference[];

	/** BG-13 — delivery party. */
	deliverTo?: TradeParty;
	/** BT-72 — actual delivery date. */
	deliveryDate?: IsoDate;
	/** BG-14 — invoicing period. */
	billingPeriod?: BillingPeriod;

	/** BT-90 — SEPA creditor identifier. */
	creditorReference?: string;
	/** BT-83 — payment remittance reference. */
	paymentReference?: string;
	paymentMeans?: PaymentMeans[];
	paymentTerms?: PaymentTerms;
	/** BT-19 — buyer accounting reference. */
	buyerAccountingReference?: string;

	lines?: InvoiceLine[];
	allowances?: DocumentAllowanceCharge[];
	charges?: DocumentAllowanceCharge[];
	taxBreakdown?: TaxBreakdownEntry[];
	totals?: MonetarySummation;
}
