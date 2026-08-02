// ── Enum codes (mirror v1.* enums in the Scrada OpenAPI spec) ──────────

/**
 * Mirrors v1.CompanyVatStatus.
 *
 *   1 — Subject to VAT (charges and remits VAT — the normal case)
 *   2 — Not subject to VAT (no VAT registration at all)
 *   3 — Small business / franchise exemption (has a VAT number but is exempt
 *       from collecting VAT, e.g. Belgian Article 56bis kleine onderneming)
 *
 * Scrada uses this on the supplier party to decide whether the supplier may
 * charge VAT on the outbound document. When unset, Scrada appears to default
 * to a non-VAT-collecting status, and any non-zero VAT line is rejected with
 * "VAT difference left for 0% VAT".
 */
export type CompanyVatStatus = 1 | 2 | 3;

/**
 * Mirrors v1.CompanyInvoiceLineVatType (subset commonly used).
 *
 *   1 — Standard rate
 *   2 — Zero rate
 *   3 — Exempt from tax
 *  50 — Reverse charge
 *  52 — 0% Clause 44 (Article 44)
 *
 * The full enum supports 1–10, 20–22, 50–54, 70–72 (export, ICD, OSS, etc.).
 * Modeled as `number` rather than a literal union so the rarer codes don't
 * require library updates to stay valid.
 */
export type CompanyInvoiceLineVatType = number;

/** Mirrors v1.CompanyInvoiceTaxNumberType. 1 = BE, 2 = NL, 3 = FR. */
export type CompanyInvoiceTaxNumberType = 1 | 2 | 3;

// ── Address ─────────────────────────────────────────────────────────────

export interface ScradaAddress {
	street: string | null;
	streetNumber: string | null;
	streetBox: string | null;
	city: string | null;
	zipCode: string | null;
	countrySubentity: string | null;
	countryCode: string | null;
}

// ── Invoice party (supplier or customer) ────────────────────────────────

export interface PeppolOnlyInvoiceParty {
	peppolID?: string | null;
	code?: string | null;
	languageCode?: string | null;
	name: string;
	address: ScradaAddress;
	phone?: string | null;
	email?: string | null;
	invoiceEmail?: string | null;
	contact?: string | null;
	vatStatus?: CompanyVatStatus;
	taxNumberType?: CompanyInvoiceTaxNumberType;
	taxNumber?: string | null;
	legalPersonRegister?: string | null;
	vatNumber?: string | null;
	glnNumber?: string | null;
}

// ── Invoice line ────────────────────────────────────────────────────────

export interface PeppolOnlyInvoiceLine {
	lineNumber: string;
	itemCodeSeller?: string | null;
	itemCodeBuyer?: string | null;
	itemName: string;
	itemOriginCountryCode?: string | null;
	quantity: number;
	/** Scrada's CompanyInvoiceLineUomType code (1 = piece). */
	unitType: number;
	itemExclVat?: number | null;
	itemInclVat?: number | null;
	vatType: CompanyInvoiceLineVatType;
	vatPercentage: number;
	totalDiscountExclVat?: number | null;
	totalDiscountInclVat?: number | null;
	totalExclVat?: number | null;
	totalInclVat?: number | null;
	invoicePeriodStartDate?: string | null;
	invoicePeriodEndDate?: string | null;
}

// ── VAT total (per VAT category/rate group) ─────────────────────────────

export interface SalesInvoiceVatTotal {
	vatType: CompanyInvoiceLineVatType;
	vatPercentage: number;
	totalExclVat: number;
	totalVat: number;
	totalInclVat: number;
	note?: string | null;
}

// ── Attachment ──────────────────────────────────────────────────────────

export interface ScradaInvoiceAttachment {
	filename: string;
	fileType: number;
	mimeType: string;
	base64Data: string;
	externalReference?: string;
}

// ── Top-level Peppol-only invoice payload ───────────────────────────────

/**
 * Body for POST /v1/company/{companyID}/peppol/outbound/salesInvoice
 * (and the self-billing equivalent).
 */
export interface PeppolOnlyInvoice {
	number: string;
	externalReference?: string | null;
	creditInvoice?: boolean | null;
	isInclVat?: boolean | null;
	invoiceReference?: string | null;
	invoiceDate: string;
	invoiceExpiryDate?: string | null;
	supplier: PeppolOnlyInvoiceParty;
	customer: PeppolOnlyInvoiceParty;
	totalExclVat: number;
	totalInclVat: number;
	totalVat: number;
	currency?: string | null;
	payableRoundingAmount?: number | null;
	note?: string | null;
	lines: PeppolOnlyInvoiceLine[];
	vatTotals: SalesInvoiceVatTotal[];
	paymentTerms?: string | null;
	attachments?: ScradaInvoiceAttachment[] | null;
}

// ── Inbound document responses ──────────────────────────────────────────

export interface ScradaInboundDocumentSummary {
	id: string;
	internalNumber?: number;
	peppolSenderScheme?: string;
	peppolSenderID?: string;
	peppolReceiverScheme?: string;
	peppolReceiverID?: string;
	peppolC1CountryCode?: string;
	peppolC2Timestamp?: string;
	peppolC2SeatID?: string;
	peppolC2MessageID?: string;
	peppolC3IncomingUniqueID?: string;
	peppolC3MessageID?: string;
	peppolC3Timestamp?: string;
	peppolConversationID?: string;
	peppolSbdhInstanceID?: string;
	peppolProcessScheme?: string;
	peppolProcessValue?: string;
	peppolDocumentTypeScheme?: string;
	peppolDocumentTypeValue?: string;
}

export interface ScradaInboundUnconfirmedResponse {
	results?: ScradaInboundDocumentSummary[];
	__count?: number;
}

export interface ScradaInboundDocumentResponse {
	body: string;
	contentType: string | null;
	headers: Record<string, string>;
}

// ── Outbound document info ──────────────────────────────────────────────

export interface ScradaOutboundDocumentInfo {
	id: string;
	createdOn?: string;
	externalReference?: string;
	peppolSenderID?: string | null;
	peppolReceiverID?: string | null;
	peppolC1CountryCode?: string | null;
	peppolC2Timestamp?: string | null;
	peppolC2SeatID?: string | null;
	peppolC2MessageID?: string | null;
	peppolC3MessageID?: string | null;
	peppolC3Timestamp?: string | null;
	peppolC3SeatID?: string | null;
	peppolConversationID?: string | null;
	peppolSbdhInstanceID?: string | null;
	peppolDocumentTypeScheme?: string | null;
	peppolDocumentTypeValue?: string | null;
	peppolProcessScheme?: string | null;
	peppolProcessValue?: string | null;
	salesInvoiceID?: string | null;
	status: string;
	attempt?: number;
	errorMessage?: string;
}

// ── Lookup ──────────────────────────────────────────────────────────────

export interface ScradaPeppolLookupResponse {
	registered?: boolean;
	supportInvoice?: boolean;
	supportCreditInvoice?: boolean;
	supportSelfBillingInvoice?: boolean;
	supportSelfBillingCreditInvoice?: boolean;
	participantIdentifier?: {
		scheme?: string;
		id?: string;
	} | null;
	businessEntity?: {
		name?: string;
		languageCode?: string;
		countryCode?: string;
	} | null;
	documentTypes?: Array<{
		scheme?: string;
		value?: string;
		processIdentifier?: {
			scheme?: string;
			value?: string;
		} | null;
	}> | null;
}

/**
 * Peppol routing for `sendOutboundDocument`. The raw-UBL outbound endpoint does
 * not parse the document for routing, so the sender, receiver, document type
 * and process must be supplied as `x-scrada-peppol-*` request headers. All
 * fields are required by Scrada; `externalReference` is optional (portal- and
 * webhook-only, not used for Peppol).
 *
 * @see POST /company/{companyID}/peppol/outbound/document
 */
export interface PeppolOutboundDocumentRouting {
	/** Sender participant scheme — always `iso6523-actorid-upis`. */
	senderScheme: string;
	/** Sender participant id, e.g. `0208:0800279001`. */
	senderId: string;
	/** Receiver participant scheme — always `iso6523-actorid-upis`. */
	receiverScheme: string;
	/** Receiver participant id, e.g. `9925:BE0206582284`. */
	receiverId: string;
	/** ISO 3166-1 alpha-2 country where the sender is legally present (C1), e.g. `BE`. */
	c1CountryCode: string;
	/** Document type scheme, e.g. `busdox-docid-qns`. */
	documentTypeScheme: string;
	/** Document type value (the BIS Billing 3.0 Invoice or CreditNote doc-type id). */
	documentTypeValue: string;
	/** Process scheme, e.g. `cenbii-procid-ubl`. */
	processScheme: string;
	/** Process value, e.g. `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`. */
	processValue: string;
	/** Optional caller reference surfaced in the Scrada portal and webhooks. */
	externalReference?: string;
}
