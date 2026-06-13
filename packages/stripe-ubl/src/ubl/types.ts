/**
 * A vendor-neutral model of a Peppol BIS Billing 3.0 document.
 *
 * This is the intermediate representation `stripe-ubl` produces from a Stripe
 * invoice or credit note; {@link ../ubl/serialize.ts} turns it into UBL XML.
 * It is deliberately a thin, construction-oriented mirror of the UBL fields we
 * populate — not a full UBL object graph.
 */

export interface UblAddress {
	/** `cbc:StreetName` (BT-35). */
	street: string | null;
	/** `cbc:AdditionalStreetName` (BT-36). */
	additionalStreet: string | null;
	/** `cbc:CityName` (BT-37). */
	city: string | null;
	/** `cbc:PostalZone` (BT-38). */
	postalZone: string | null;
	/** `cbc:CountrySubentity` (BT-39). */
	countrySubentity: string | null;
	/** `cac:Country/cbc:IdentificationCode` (BT-40) — ISO 3166-1 alpha-2. */
	countryCode: string | null;
}

/** Peppol participant identifier, e.g. scheme `0208`, value `0800279001`. */
export interface UblEndpoint {
	scheme: string;
	value: string;
}

/** Legal registration identifier, e.g. a Belgian enterprise number. */
export interface UblCompanyId {
	value: string;
	/** ICD scheme (e.g. `0208` for the Belgian CBE), when known. */
	scheme?: string | null;
}

export interface UblParty {
	/** `cbc:EndpointID` (BT-49/BT-34) — the Peppol routing identifier. */
	endpoint: UblEndpoint | null;
	/** `cac:PartyName/cbc:Name` (BT-27/BT-44). */
	name: string;
	address: UblAddress;
	/** `cac:PartyTaxScheme/cbc:CompanyID` with `VAT` scheme (BT-31/BT-48). */
	vatNumber: string | null;
	/** `cac:PartyLegalEntity/cbc:RegistrationName` (BT-27/BT-44). Defaults to `name`. */
	legalName: string | null;
	/** `cac:PartyLegalEntity/cbc:CompanyID` (BT-30/BT-47). */
	companyId: UblCompanyId | null;
}

/**
 * VAT breakdown category. `id` is a UNCL5305 code:
 *   - `S`  Standard rate
 *   - `Z`  Zero-rated goods
 *   - `E`  Exempt from VAT
 *   - `AE` VAT reverse charge
 *   - `O`  Services outside scope of tax
 *   - `K`  Intra-community supply
 *   - `G`  Export outside the EU
 */
export interface UblTaxCategory {
	id: string;
	percent: number;
	/** Required by EN 16931 (BR-E-10/BR-AE-10/…) for non-`S`/`Z` categories. */
	exemptionReason?: string | null;
}

export interface UblLine {
	/** `cbc:ID` (BT-126) — line identifier. */
	id: string;
	/** `cac:Item/cbc:Name` (BT-153). */
	name: string;
	/** `cbc:InvoicedQuantity` / `cbc:CreditedQuantity` (BT-129). */
	quantity: number;
	/** UN/ECE Rec 20 unit code (BT-130). */
	unitCode: string;
	/** `cbc:LineExtensionAmount` (BT-131) — net of VAT, after line discounts. */
	lineExtensionAmount: number;
	/** `cac:Price/cbc:PriceAmount` (BT-146) — net unit price. */
	priceAmount: number;
	taxCategory: UblTaxCategory;
}

export interface UblTaxSubtotal {
	/** `cbc:TaxableAmount` (BT-116). */
	taxableAmount: number;
	/** `cbc:TaxAmount` (BT-117). */
	taxAmount: number;
	category: UblTaxCategory;
}

export interface UblTaxTotal {
	/** `cbc:TaxAmount` (BT-110) — sum of subtotal tax amounts. */
	taxAmount: number;
	subtotals: UblTaxSubtotal[];
}

export interface UblMonetaryTotal {
	/** BT-106 — sum of line net amounts. */
	lineExtensionAmount: number;
	/** BT-109 — total without VAT. */
	taxExclusiveAmount: number;
	/** BT-112 — total with VAT. */
	taxInclusiveAmount: number;
	/** BT-115 — amount due for payment. */
	payableAmount: number;
}

/** An embedded supporting document (BG-24), e.g. the rendered PDF. */
export interface UblAttachment {
	/** `cac:AdditionalDocumentReference/cbc:ID` (BT-122). */
	id: string;
	/** `cbc:EmbeddedDocumentBinaryObject/@filename`. */
	filename: string;
	/** MIME type, e.g. `application/pdf`. */
	mimeCode: string;
	/** Base64-encoded document bytes. */
	base64: string;
}

export interface UblDocument {
	documentType: "invoice" | "creditNote";
	/** Invoice / credit note number (BT-1). */
	id: string;
	/** Issue date (BT-2), `YYYY-MM-DD`. */
	issueDate: string;
	/** Payment due date (BT-9). Invoices only. */
	dueDate: string | null;
	/** Free-text note (BT-22). */
	note: string | null;
	/** Document currency (BT-5). */
	currency: string;
	/** Buyer reference (BT-10). */
	buyerReference: string | null;
	/** For credit notes: the referenced original invoice number (BT-25). */
	precedingInvoiceId: string | null;
	supplier: UblParty;
	customer: UblParty;
	lines: UblLine[];
	taxTotal: UblTaxTotal;
	monetaryTotal: UblMonetaryTotal;
	attachments: UblAttachment[];
}
