// --- UBL parsed types ---

export interface UblAddress {
	street: string;
	additionalStreet?: string;
	city: string;
	postalZone: string;
	countrySubentity?: string;
	countryCode: string;
}

export interface UblContact {
	name?: string;
	phone?: string;
	email?: string;
}

export interface UblParty {
	name: string;
	registrationName?: string;
	companyLegalForm?: string;
	vatId?: string;
	taxSchemeId?: string;
	companyId?: string;
	endpointId?: string;
	endpointSchemeId?: string;
	address?: UblAddress;
	contact?: UblContact;
}

export interface UblLine {
	id: string;
	description: string;
	quantity: number;
	unitCode: string;
	unitPrice: number;
	lineExtensionAmount: number;
	taxPercent?: number;
	taxAmount?: number;
	taxCategoryId?: string;
	taxSchemeId?: string;
	taxSubtotals?: UblTaxSubtotal[];
	allowanceCharges?: UblAllowanceCharge[];
	discountAmount?: number;
	chargeAmount?: number;
	itemName?: string;
	sellersItemId?: string;
	buyersItemId?: string;
}

export interface UblAllowanceCharge {
	chargeIndicator: boolean;
	amount: number;
	baseAmount?: number;
	multiplierFactorNumeric?: number;
	reason?: string;
	reasonCode?: string;
	taxPercent?: number;
	taxCategoryId?: string;
	taxSchemeId?: string;
}

export interface UblTaxSubtotal {
	taxableAmount: number;
	taxAmount: number;
	taxPercent: number;
	taxCategoryId?: string;
	taxSchemeId?: string;
	taxExemptionReason?: string;
}

export interface UblMonetaryTotal {
	lineExtensionAmount: number;
	taxExclusiveAmount: number;
	taxInclusiveAmount: number;
	allowanceTotalAmount?: number;
	chargeTotalAmount?: number;
	prepaidAmount?: number;
	payableRoundingAmount?: number;
	payableAmount: number;
}

export interface UblPaymentMeans {
	code: string;
	codeName?: string;
	paymentId?: string;
	iban?: string;
	bic?: string;
	accountName?: string;
}

export interface UblInvoicePeriod {
	startDate?: string;
	endDate?: string;
	descriptionCode?: string;
}

export interface UblAttachment {
	id: string;
	filename?: string;
	mimeCode?: string;
	description?: string;
	base64Content: string;
}

export interface UblDelivery {
	actualDeliveryDate?: string;
	address?: UblAddress;
}

export interface UblInvoice {
	documentType: "Invoice" | "CreditNote";
	customizationId?: string;
	profileId?: string;
	id: string;
	invoiceTypeCode?: string;
	issueDate: string;
	dueDate?: string;
	taxPointDate?: string;
	currency: string;
	buyerReference?: string;
	orderReference?: string;
	salesOrderId?: string;
	contractReference?: string;
	projectReference?: string;
	seller: UblParty;
	buyer: UblParty;
	delivery?: UblDelivery;
	lines: UblLine[];
	taxSubtotals: UblTaxSubtotal[];
	monetaryTotal: UblMonetaryTotal;
	paymentMeans?: UblPaymentMeans;
	paymentMeansList?: UblPaymentMeans[];
	invoicePeriod?: UblInvoicePeriod;
	note?: string;
	paymentTermsNote?: string;
	attachments?: UblAttachment[];
	allowanceCharges?: UblAllowanceCharge[];
}

// --- Normalized DTO types ---

export interface InvoiceExtractionDTO {
	provider: string;
	document_id: string;
	invoice: {
		invoice_number: string | null;
		invoice_date: string | null;
		due_date: string | null;
		currency: string | null;
		subtotal: number | null;
		tax_total: number | null;
		total: number | null;
		amount_due: number | null;
		amount_paid: number | null;
		discount_total: number | null;
		shipping_total: number | null;
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
		extra: Record<string, unknown>;
	}>;
	confidence: {
		overall: number | null;
		fields: Record<string, number>;
	};
}
