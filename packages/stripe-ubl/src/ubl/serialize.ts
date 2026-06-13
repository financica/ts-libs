import { el, serializeDocument, type XmlElement } from "../xml";
import {
	COUNTRY_CODE_LIST_ID,
	CREDIT_NOTE_TYPE_CODE,
	INVOICE_TYPE_CODE,
	NS_CAC,
	NS_CBC,
	NS_CREDIT_NOTE,
	NS_INVOICE,
	UBL_CUSTOMIZATION_ID,
	UBL_PROFILE_ID,
	VAT_TAX_SCHEME_ID,
} from "./constants";
import type {
	UblAddress,
	UblAttachment,
	UblDocument,
	UblLine,
	UblParty,
	UblTaxCategory,
	UblTaxSubtotal,
} from "./types";

/** Format a monetary value as a 2-decimal string (UBL amounts are fixed-scale). */
const amount = (value: number): string => value.toFixed(2);

/** Format a VAT percentage. Trims to at most 2 decimals without forcing them. */
const percent = (value: number): string => {
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? rounded.toFixed(2) : String(rounded);
};

const money = (name: string, value: number, currency: string): XmlElement =>
	el(name, { currencyID: currency }, amount(value));

const vatTaxScheme = (): XmlElement =>
	el("cac:TaxScheme", null, [el("cbc:ID", null, VAT_TAX_SCHEME_ID)]);

/**
 * Render a tax category, shared between `cac:ClassifiedTaxCategory` (on lines)
 * and `cac:TaxCategory` (in the VAT breakdown). EN 16931 requires an exemption
 * reason for the non-charging categories (E/AE/O/K/G).
 */
const taxCategory = (name: string, category: UblTaxCategory): XmlElement =>
	el(name, null, [
		el("cbc:ID", null, category.id),
		el("cbc:Percent", null, percent(category.percent)),
		category.exemptionReason
			? el("cbc:TaxExemptionReason", null, category.exemptionReason)
			: null,
		vatTaxScheme(),
	]);

const postalAddress = (address: UblAddress): XmlElement =>
	el("cac:PostalAddress", null, [
		address.street ? el("cbc:StreetName", null, address.street) : null,
		address.additionalStreet
			? el("cbc:AdditionalStreetName", null, address.additionalStreet)
			: null,
		address.city ? el("cbc:CityName", null, address.city) : null,
		address.postalZone ? el("cbc:PostalZone", null, address.postalZone) : null,
		address.countrySubentity
			? el("cbc:CountrySubentity", null, address.countrySubentity)
			: null,
		address.countryCode
			? el("cac:Country", null, [
					el(
						"cbc:IdentificationCode",
						{ listID: COUNTRY_CODE_LIST_ID },
						address.countryCode,
					),
				])
			: null,
	]);

const party = (source: UblParty): XmlElement =>
	el("cac:Party", null, [
		source.endpoint
			? el(
					"cbc:EndpointID",
					{ schemeID: source.endpoint.scheme },
					source.endpoint.value,
				)
			: null,
		el("cac:PartyName", null, [el("cbc:Name", null, source.name)]),
		postalAddress(source.address),
		source.vatNumber
			? el("cac:PartyTaxScheme", null, [
					el("cbc:CompanyID", null, source.vatNumber),
					vatTaxScheme(),
				])
			: null,
		el("cac:PartyLegalEntity", null, [
			el("cbc:RegistrationName", null, source.legalName ?? source.name),
			source.companyId
				? el(
						"cbc:CompanyID",
						source.companyId.scheme
							? { schemeID: source.companyId.scheme }
							: null,
						source.companyId.value,
					)
				: null,
		]),
	]);

const taxSubtotal = (subtotal: UblTaxSubtotal, currency: string): XmlElement =>
	el("cac:TaxSubtotal", null, [
		money("cbc:TaxableAmount", subtotal.taxableAmount, currency),
		money("cbc:TaxAmount", subtotal.taxAmount, currency),
		taxCategory("cac:TaxCategory", subtotal.category),
	]);

const line = (
	source: UblLine,
	currency: string,
	documentType: UblDocument["documentType"],
): XmlElement => {
	const lineElementName =
		documentType === "creditNote" ? "cac:CreditNoteLine" : "cac:InvoiceLine";
	const quantityElementName =
		documentType === "creditNote" ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity";

	return el(lineElementName, null, [
		el("cbc:ID", null, source.id),
		el(quantityElementName, { unitCode: source.unitCode }, String(source.quantity)),
		money("cbc:LineExtensionAmount", source.lineExtensionAmount, currency),
		el("cac:Item", null, [
			el("cbc:Name", null, source.name),
			taxCategory("cac:ClassifiedTaxCategory", source.taxCategory),
		]),
		el("cac:Price", null, [money("cbc:PriceAmount", source.priceAmount, currency)]),
	]);
};

const attachmentReference = (attachment: UblAttachment): XmlElement =>
	el("cac:AdditionalDocumentReference", null, [
		el("cbc:ID", null, attachment.id),
		el("cac:Attachment", null, [
			el(
				"cbc:EmbeddedDocumentBinaryObject",
				{ mimeCode: attachment.mimeCode, filename: attachment.filename },
				attachment.base64,
			),
		]),
	]);

const billingReference = (precedingInvoiceId: string): XmlElement =>
	el("cac:BillingReference", null, [
		el("cac:InvoiceDocumentReference", null, [
			el("cbc:ID", null, precedingInvoiceId),
		]),
	]);

/** Serialize a {@link UblDocument} into a Peppol BIS Billing 3.0 XML string. */
export const serializeUblDocument = (doc: UblDocument): string => {
	const isCreditNote = doc.documentType === "creditNote";
	const rootName = isCreditNote ? "CreditNote" : "Invoice";
	const rootNamespace = isCreditNote ? NS_CREDIT_NOTE : NS_INVOICE;
	const typeCodeElement = isCreditNote
		? el("cbc:CreditNoteTypeCode", null, CREDIT_NOTE_TYPE_CODE)
		: el("cbc:InvoiceTypeCode", null, INVOICE_TYPE_CODE);

	const children: (XmlElement | null | false)[] = [
		el("cbc:CustomizationID", null, UBL_CUSTOMIZATION_ID),
		el("cbc:ProfileID", null, UBL_PROFILE_ID),
		el("cbc:ID", null, doc.id),
		el("cbc:IssueDate", null, doc.issueDate),
		// CreditNote has no DueDate element in the UBL sequence.
		!isCreditNote && doc.dueDate ? el("cbc:DueDate", null, doc.dueDate) : null,
		typeCodeElement,
		doc.note ? el("cbc:Note", null, doc.note) : null,
		el("cbc:DocumentCurrencyCode", null, doc.currency),
		doc.buyerReference ? el("cbc:BuyerReference", null, doc.buyerReference) : null,
		doc.precedingInvoiceId ? billingReference(doc.precedingInvoiceId) : null,
		...doc.attachments.map(attachmentReference),
		el("cac:AccountingSupplierParty", null, [party(doc.supplier)]),
		el("cac:AccountingCustomerParty", null, [party(doc.customer)]),
		el("cac:TaxTotal", null, [
			money("cbc:TaxAmount", doc.taxTotal.taxAmount, doc.currency),
			...doc.taxTotal.subtotals.map((subtotal) =>
				taxSubtotal(subtotal, doc.currency),
			),
		]),
		el("cac:LegalMonetaryTotal", null, [
			money(
				"cbc:LineExtensionAmount",
				doc.monetaryTotal.lineExtensionAmount,
				doc.currency,
			),
			money(
				"cbc:TaxExclusiveAmount",
				doc.monetaryTotal.taxExclusiveAmount,
				doc.currency,
			),
			money(
				"cbc:TaxInclusiveAmount",
				doc.monetaryTotal.taxInclusiveAmount,
				doc.currency,
			),
			money("cbc:PayableAmount", doc.monetaryTotal.payableAmount, doc.currency),
		]),
		...doc.lines.map((source) => line(source, doc.currency, doc.documentType)),
	];

	const root = el(
		rootName,
		{
			xmlns: rootNamespace,
			"xmlns:cac": NS_CAC,
			"xmlns:cbc": NS_CBC,
		},
		children.filter((child): child is XmlElement => Boolean(child)),
	);

	return serializeDocument(root);
};
