// --- UBL parsed types ---

export interface UblAddress {
	street: string;
	additionalStreet?: string | undefined;
	city: string;
	postalZone: string;
	countrySubentity?: string | undefined;
	countryCode: string;
}

export interface UblContact {
	name?: string | undefined;
	phone?: string | undefined;
	email?: string | undefined;
}

export interface UblPartyIdentification {
	id: string;
	schemeId?: string | undefined;
}

export interface UblParty {
	name: string;
	registrationName?: string | undefined;
	companyLegalForm?: string | undefined;
	vatId?: string | undefined;
	taxSchemeId?: string | undefined;
	companyId?: string | undefined;
	companyIdSchemeId?: string | undefined;
	endpointId?: string | undefined;
	endpointSchemeId?: string | undefined;
	partyIdentifications?: UblPartyIdentification[] | undefined;
	address?: UblAddress | undefined;
	contact?: UblContact | undefined;
}

export interface UblItemProperty {
	name: string;
	value: string;
}

export interface UblLine {
	id: string;
	description: string;
	quantity: number;
	unitCode: string;
	unitPrice: number;
	lineExtensionAmount: number;
	taxPercent?: number | undefined;
	taxAmount?: number | undefined;
	taxCategoryId?: string | undefined;
	taxSchemeId?: string | undefined;
	taxSubtotals?: UblTaxSubtotal[] | undefined;
	allowanceCharges?: UblAllowanceCharge[] | undefined;
	discountAmount?: number | undefined;
	chargeAmount?: number | undefined;
	itemName?: string | undefined;
	sellersItemId?: string | undefined;
	buyersItemId?: string | undefined;
	additionalItemProperties?: UblItemProperty[] | undefined;
	/** EN 16931 BT-134/BT-135: the line's own service period. */
	invoicePeriod?: UblInvoicePeriod | undefined;
}

export interface UblAllowanceCharge {
	chargeIndicator: boolean;
	amount: number;
	baseAmount?: number | undefined;
	multiplierFactorNumeric?: number | undefined;
	reason?: string | undefined;
	reasonCode?: string | undefined;
	taxPercent?: number | undefined;
	taxCategoryId?: string | undefined;
	taxSchemeId?: string | undefined;
}

export interface UblTaxSubtotal {
	taxableAmount: number;
	taxAmount: number;
	taxPercent: number;
	taxCategoryId?: string | undefined;
	taxSchemeId?: string | undefined;
	taxExemptionReason?: string | undefined;
}

export interface UblMonetaryTotal {
	lineExtensionAmount: number;
	taxExclusiveAmount: number;
	taxInclusiveAmount: number;
	allowanceTotalAmount?: number | undefined;
	chargeTotalAmount?: number | undefined;
	prepaidAmount?: number | undefined;
	payableRoundingAmount?: number | undefined;
	payableAmount: number;
}

export interface UblPaymentMeans {
	code: string;
	codeName?: string | undefined;
	paymentId?: string | undefined;
	iban?: string | undefined;
	bic?: string | undefined;
	accountName?: string | undefined;
	mandateId?: string | undefined;
}

export interface UblInvoicePeriod {
	startDate?: string | undefined;
	endDate?: string | undefined;
	descriptionCode?: string | undefined;
}

export interface UblAttachment {
	id: string;
	filename?: string | undefined;
	mimeCode?: string | undefined;
	description?: string | undefined;
	base64Content?: string;
	externalUri?: string | undefined;
}

export interface UblDocumentReference {
	id: string;
	description?: string | undefined;
}

export interface UblDelivery {
	actualDeliveryDate?: string | undefined;
	address?: UblAddress | undefined;
}

export interface UblBillingReference {
	invoiceId?: string | undefined;
	invoiceIssueDate?: string | undefined;
}

export interface UblInvoice {
	documentType: "Invoice" | "CreditNote";
	customizationId?: string | undefined;
	profileId?: string | undefined;
	id: string;
	invoiceTypeCode?: string | undefined;
	issueDate: string;
	dueDate?: string | undefined;
	taxPointDate?: string | undefined;
	currency: string;
	buyerReference?: string | undefined;
	orderReference?: string | undefined;
	salesOrderId?: string | undefined;
	contractReference?: string | undefined;
	projectReference?: string | undefined;
	billingReference?: UblBillingReference | undefined;
	seller: UblParty;
	buyer: UblParty;
	delivery?: UblDelivery | undefined;
	lines: UblLine[];
	taxSubtotals: UblTaxSubtotal[];
	monetaryTotal: UblMonetaryTotal;
	paymentMeans?: UblPaymentMeans | undefined;
	paymentMeansList?: UblPaymentMeans[] | undefined;
	invoicePeriod?: UblInvoicePeriod | undefined;
	note?: string | undefined;
	paymentTermsNote?: string | undefined;
	attachments?: UblAttachment[] | undefined;
	documentReferences?: UblDocumentReference[] | undefined;
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
