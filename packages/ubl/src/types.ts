// --- UBL document model ---
//
// One model, used by the parser, the serializer and the build helpers. It is a
// vendor-neutral mirror of the UBL 2.1 / Peppol BIS Billing 3.0 fields this
// package reads and writes, not a full UBL object graph.
//
// The parser reads everything the document states: a field the document omits
// is an absent key (never `""`/`0`/`"S"` to fill a gap). Only the fields
// EN 16931 makes mandatory for *parsing* (document id, issue date, currency,
// line id) are required on the type; a document that lacks one is rejected
// with `UblParseError`. Containers the consumer iterates (`lines`,
// `taxTotal.subtotals`) and the `seller`/`buyer`/`taxTotal`/`monetaryTotal`
// objects are always present.
//
// The serializer is the validator: `serializeUblInvoice` throws `UblBuildError`
// when a field EN 16931 / Peppol BIS makes mandatory on the wire is missing.

export interface UblAddress {
	/** `cbc:StreetName` (BT-35). */
	street?: string | undefined;
	/** `cbc:AdditionalStreetName` (BT-36). */
	additionalStreet?: string | undefined;
	/** `cbc:CityName` (BT-37). */
	city?: string | undefined;
	/** `cbc:PostalZone` (BT-38). */
	postalZone?: string | undefined;
	/** `cbc:CountrySubentity` (BT-39). */
	countrySubentity?: string | undefined;
	/** `cac:Country/cbc:IdentificationCode` (BT-40) — ISO 3166-1 alpha-2. */
	countryCode?: string | undefined;
}

export interface UblContact {
	/** `cac:Contact/cbc:Name` (BT-41/BT-56). */
	name?: string | undefined;
	/** `cac:Contact/cbc:Telephone` (BT-42/BT-57). */
	phone?: string | undefined;
	/** `cac:Contact/cbc:ElectronicMail` (BT-43/BT-58). */
	email?: string | undefined;
}

/**
 * Peppol participant identifier (`cbc:EndpointID` + `@schemeID`), e.g. scheme
 * `0208`, value `0800279001`. A document may state the value without a scheme;
 * the serializer requires both.
 */
export interface UblEndpoint {
	value: string;
	/** EAS scheme (`@schemeID`), e.g. `0208`. */
	scheme?: string | undefined;
}

/**
 * Legal registration identifier (`cac:PartyLegalEntity/cbc:CompanyID` +
 * `@schemeID`), e.g. a Belgian enterprise number.
 */
export interface UblCompanyId {
	value: string;
	/** ISO 6523 ICD scheme (`@schemeID`, e.g. `0208` for the Belgian CBE), when known. */
	scheme?: string | undefined;
}

/** `cac:PartyIdentification/cbc:ID` (BT-29/BT-46) with its `@schemeID`. */
export interface UblPartyIdentification {
	id: string;
	schemeId?: string | undefined;
}

export interface UblParty {
	/** `cac:PartyName/cbc:Name` (BT-28/BT-45). */
	name?: string | undefined;
	/** `cac:PartyLegalEntity/cbc:RegistrationName` (BT-27/BT-44). */
	registrationName?: string | undefined;
	/** `cac:PartyLegalEntity/cbc:CompanyLegalForm` (BT-33). */
	companyLegalForm?: string | undefined;
	/** `cac:PartyTaxScheme/cbc:CompanyID` (BT-31/BT-48) — the VAT identifier. */
	vatId?: string | undefined;
	/** `cac:PartyTaxScheme/cac:TaxScheme/cbc:ID`, normally `VAT`. */
	taxSchemeId?: string | undefined;
	/** `cac:PartyLegalEntity/cbc:CompanyID` (BT-30/BT-47). */
	companyId?: UblCompanyId | undefined;
	/** `cbc:EndpointID` (BT-34/BT-49) — the Peppol routing identifier. */
	endpoint?: UblEndpoint | undefined;
	partyIdentifications?: UblPartyIdentification[] | undefined;
	address?: UblAddress | undefined;
	contact?: UblContact | undefined;
}

/**
 * VAT category (`cac:ClassifiedTaxCategory` on a line, `cac:TaxCategory` in
 * the VAT breakdown and on an allowance/charge). `id` is a UNCL5305 code:
 *   - `S`  Standard rate
 *   - `Z`  Zero-rated goods
 *   - `E`  Exempt from VAT
 *   - `AE` VAT reverse charge
 *   - `O`  Services outside scope of tax
 *   - `K`  Intra-community supply
 *   - `G`  Export outside the EU
 */
export interface UblTaxCategory {
	/** `cbc:ID` (BT-151/BT-118/BT-95/BT-102). */
	id?: string | undefined;
	/** `cbc:Percent` (BT-152/BT-119/BT-96/BT-103); absent for `O` and when the document omits it. */
	percent?: number | undefined;
	/** `cac:TaxScheme/cbc:ID`, normally `VAT`. */
	schemeId?: string | undefined;
	/** `cbc:TaxExemptionReason` (BT-120). Required by EN 16931 for non-charging categories. */
	exemptionReason?: string | undefined;
	/** `cbc:TaxExemptionReasonCode` (BT-121). */
	exemptionReasonCode?: string | undefined;
}

export interface UblItemProperty {
	/** `cac:AdditionalItemProperty/cbc:Name` (BT-160). */
	name: string;
	/** `cac:AdditionalItemProperty/cbc:Value` (BT-161). */
	value?: string | undefined;
}

export interface UblLine {
	/** `cbc:ID` (BT-126) — line identifier. */
	id: string;
	/** `cac:Item/cbc:Description` (BT-154). */
	description?: string | undefined;
	/** `cbc:InvoicedQuantity` / `cbc:CreditedQuantity` (BT-129). */
	quantity?: number | undefined;
	/** UN/ECE Rec 20 unit code (BT-130). */
	unitCode?: string | undefined;
	/**
	 * Net price of one unit: `cac:Price/cbc:PriceAmount` (BT-146) divided by
	 * `cbc:BaseQuantity` (BT-149, default 1).
	 */
	unitPrice?: number | undefined;
	/** `cbc:LineExtensionAmount` (BT-131) — net of VAT, after line discounts. */
	lineExtensionAmount?: number | undefined;
	/**
	 * `cac:Price/cbc:BaseQuantity` (BT-149) — the number of units BT-146
	 * covers. Omitted means 1. Set it when the net doesn't divide evenly into
	 * cents, so `quantity × unitPrice` reproduces the line net exactly
	 * (PEPPOL-EN16931-R120); see `deriveUnitPrice`. The serializer emits
	 * `PriceAmount = unitPrice × baseQuantity`.
	 */
	baseQuantity?: number | undefined;
	/** `cac:Item/cac:ClassifiedTaxCategory` (BT-151/BT-152). */
	taxCategory?: UblTaxCategory | undefined;
	/** Line VAT amount: `cac:TaxTotal/cbc:TaxAmount` when stated, else derived from the rate. */
	taxAmount?: number | undefined;
	/** Line-level `cac:TaxTotal/cac:TaxSubtotal` (not used by BIS Billing, seen in the wild). */
	taxSubtotals?: UblTaxSubtotal[] | undefined;
	allowanceCharges?: UblAllowanceCharge[] | undefined;
	/** Sum of line-level allowances (absolute). */
	discountAmount?: number | undefined;
	/** Sum of line-level charges (absolute). */
	chargeAmount?: number | undefined;
	/** `cac:Item/cbc:Name` (BT-153). */
	itemName?: string | undefined;
	/** `cac:Item/cac:SellersItemIdentification/cbc:ID` (BT-155). */
	sellersItemId?: string | undefined;
	/** `cac:Item/cac:BuyersItemIdentification/cbc:ID` (BT-156). */
	buyersItemId?: string | undefined;
	additionalItemProperties?: UblItemProperty[] | undefined;
	/** `cac:InvoicePeriod` (BT-134/BT-135) — the line's own service period. */
	invoicePeriod?: UblInvoicePeriod | undefined;
}

export interface UblAllowanceCharge {
	/** `cbc:ChargeIndicator` — `true` for a charge, `false` for an allowance. */
	chargeIndicator: boolean;
	/** `cbc:Amount` (BT-92/BT-99). */
	amount?: number | undefined;
	/** `cbc:BaseAmount` (BT-93/BT-100). */
	baseAmount?: number | undefined;
	/** `cbc:MultiplierFactorNumeric` (BT-94/BT-101). */
	multiplierFactorNumeric?: number | undefined;
	/** `cbc:AllowanceChargeReason` (BT-97/BT-104). */
	reason?: string | undefined;
	/** `cbc:AllowanceChargeReasonCode` (BT-98/BT-105). */
	reasonCode?: string | undefined;
	/** `cac:TaxCategory` (BT-95/BT-96, BT-102/BT-103). */
	taxCategory?: UblTaxCategory | undefined;
}

export interface UblTaxSubtotal {
	/** `cbc:TaxableAmount` (BT-116). */
	taxableAmount?: number | undefined;
	/** `cbc:TaxAmount` (BT-117). */
	taxAmount?: number | undefined;
	/** `cac:TaxCategory` (BT-118/BT-119/BT-120/BT-121). */
	category?: UblTaxCategory | undefined;
}

export interface UblTaxTotal {
	/** `cac:TaxTotal/cbc:TaxAmount` (BT-110). Read as stated; never summed from the subtotals. */
	taxAmount?: number | undefined;
	/** `cac:TaxSubtotal` (BG-23) — the VAT breakdown. */
	subtotals: UblTaxSubtotal[];
}

export interface UblMonetaryTotal {
	/** BT-106 — sum of line net amounts. */
	lineExtensionAmount?: number | undefined;
	/** BT-109 — total without VAT. */
	taxExclusiveAmount?: number | undefined;
	/** BT-112 — total with VAT. */
	taxInclusiveAmount?: number | undefined;
	/** BT-107 — sum of document-level allowances. */
	allowanceTotalAmount?: number | undefined;
	/** BT-108 — sum of document-level charges. */
	chargeTotalAmount?: number | undefined;
	/**
	 * BT-113 — sum of amounts paid in advance. **Gross (VAT-inclusive)**, since
	 * BR-CO-16 subtracts it directly from BT-112.
	 */
	prepaidAmount?: number | undefined;
	/** BT-114 — rounding applied to the payable amount. */
	payableRoundingAmount?: number | undefined;
	/**
	 * BT-115 — amount due for payment, i.e. the *outstanding* amount.
	 * BR-CO-16: `BT-115 = BT-112 − BT-113 + BT-114`.
	 */
	payableAmount?: number | undefined;
}

export interface UblPaymentMeans {
	/** `cbc:PaymentMeansCode` (BT-81). */
	code?: string | undefined;
	/** `cbc:PaymentMeansCode/@name` (BT-82). */
	codeName?: string | undefined;
	/** `cbc:PaymentID` (BT-83). */
	paymentId?: string | undefined;
	/** `cac:PayeeFinancialAccount/cbc:ID` (BT-84). */
	iban?: string | undefined;
	/** `cac:FinancialInstitutionBranch/cbc:ID` (BT-86). */
	bic?: string | undefined;
	/** `cac:PayeeFinancialAccount/cbc:Name` (BT-85). */
	accountName?: string | undefined;
	/** `cac:PaymentMandate/cbc:ID` (BT-89). */
	mandateId?: string | undefined;
}

/**
 * A service period: BT-73/BT-74 on the document, BT-134/BT-135 on a line.
 * Either bound may stand alone — UBL allows a half-open period — but a period
 * with neither is omitted entirely.
 */
export interface UblInvoicePeriod {
	/** `cbc:StartDate`, `YYYY-MM-DD`. */
	startDate?: string | undefined;
	/** `cbc:EndDate`, `YYYY-MM-DD`, inclusive. */
	endDate?: string | undefined;
	/** `cbc:DescriptionCode` (BT-8). */
	descriptionCode?: string | undefined;
}

/** A supporting document (BG-24): embedded (`base64Content`) or external (`externalUri`). */
export interface UblAttachment {
	/** `cac:AdditionalDocumentReference/cbc:ID` (BT-122). */
	id?: string | undefined;
	/** `cbc:EmbeddedDocumentBinaryObject/@filename` (BT-125-2). */
	filename?: string | undefined;
	/** MIME type (BT-125-1), e.g. `application/pdf`. */
	mimeCode?: string | undefined;
	/** `cbc:DocumentDescription` (BT-123). */
	description?: string | undefined;
	/** Base64-encoded document bytes (BT-125). */
	base64Content?: string | undefined;
	/** `cac:ExternalReference/cbc:URI` (BT-124). */
	externalUri?: string | undefined;
}

/** A text-only `cac:AdditionalDocumentReference` (no attachment). */
export interface UblDocumentReference {
	id?: string | undefined;
	description?: string | undefined;
}

export interface UblDelivery {
	/** `cbc:ActualDeliveryDate` (BT-72). */
	actualDeliveryDate?: string | undefined;
	/** `cac:DeliveryLocation/cac:Address` (BG-15). */
	address?: UblAddress | undefined;
}

/** `cac:BillingReference/cac:InvoiceDocumentReference` (BT-25/BT-26). */
export interface UblBillingReference {
	invoiceId?: string | undefined;
	invoiceIssueDate?: string | undefined;
}

export interface UblInvoice {
	documentType: "Invoice" | "CreditNote";
	/** `cbc:CustomizationID` (BT-24). The serializer defaults to Peppol BIS Billing 3.0. */
	customizationId?: string | undefined;
	/** `cbc:ProfileID` (BT-23). The serializer defaults to the Peppol billing process. */
	profileId?: string | undefined;
	/** Invoice / credit note number (BT-1). */
	id: string;
	/** `cbc:InvoiceTypeCode` / `cbc:CreditNoteTypeCode` (BT-3). The serializer defaults to 380/381. */
	invoiceTypeCode?: string | undefined;
	/** Issue date (BT-2), `YYYY-MM-DD`. */
	issueDate: string;
	/** Payment due date (BT-9). Invoices only. */
	dueDate?: string | undefined;
	/** `cbc:TaxPointDate` (BT-7). */
	taxPointDate?: string | undefined;
	/** Document currency (BT-5). */
	currency: string;
	/** Buyer reference (BT-10). */
	buyerReference?: string | undefined;
	/** `cac:OrderReference/cbc:ID` (BT-13). */
	orderReference?: string | undefined;
	/** `cac:OrderReference/cbc:SalesOrderID` (BT-14). */
	salesOrderId?: string | undefined;
	/** `cac:ContractDocumentReference/cbc:ID` (BT-12). */
	contractReference?: string | undefined;
	/** `cac:ProjectReference/cbc:ID` (BT-11). */
	projectReference?: string | undefined;
	/** For credit notes: the referenced original invoice (BT-25). */
	billingReference?: UblBillingReference | undefined;
	seller: UblParty;
	buyer: UblParty;
	delivery?: UblDelivery | undefined;
	lines: UblLine[];
	taxTotal: UblTaxTotal;
	monetaryTotal: UblMonetaryTotal;
	/** The first entry of `paymentMeansList`. */
	paymentMeans?: UblPaymentMeans | undefined;
	paymentMeansList?: UblPaymentMeans[] | undefined;
	/** Invoicing period (BT-73/BT-74). */
	invoicePeriod?: UblInvoicePeriod | undefined;
	/** Free-text note (BT-22). */
	note?: string | undefined;
	/** Payment terms note (BT-20, `cac:PaymentTerms/cbc:Note`). */
	paymentTermsNote?: string | undefined;
	attachments?: UblAttachment[] | undefined;
	documentReferences?: UblDocumentReference[] | undefined;
	/** Document-level allowances and charges (BG-20/BG-21). */
	allowanceCharges?: UblAllowanceCharge[] | undefined;
}

// --- Normalized DTO types ---

export interface InvoiceExtractionDTO {
	provider: string;
	document_id: string;
	invoice: {
		invoice_number: string | null;
		invoice_date: string | null;
		due_date: string | null;
		/** EN 16931 BT-73/BT-74: the period the document bills for. */
		period_start: string | null;
		period_end: string | null;
		currency: string | null;
		subtotal: number | null;
		tax_total: number | null;
		total: number | null;
		amount_due: number | null;
		amount_paid: number | null;
		discount_total: number | null;
		shipping_total: number | null;
		/** EN 16931 BT-114, signed. Outside the VAT breakdown (BR-CO-16). */
		rounding_total: number | null;
		payment_terms: string | null;
		po_number: string | null;
		supplier: {
			name: string | null;
			address: string | null;
			tax_id: string | null;
			iban: string | null;
			bic: string | null;
		};
		receiver: {
			name: string | null;
			address: string | null;
			tax_id: string | null;
		};
		extra: Record<string, unknown>;
	};
	line_items: Array<{
		description: string;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		amount: number | null;
		tax_amount: number | null;
		tax_rate: number | null;
		product_code: string | null;
		discount_amount: number | null;
		/** EN 16931 BT-134/BT-135: the line's own service period. */
		period_start: string | null;
		period_end: string | null;
		extra: Record<string, unknown>;
	}>;
	confidence: {
		overall: number | null;
		fields: Record<string, number>;
	};
}
