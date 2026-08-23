import { UblBuildError } from "../../errors";
import type {
	UblAddress,
	UblAttachment,
	UblBillingReference,
	UblInvoice,
	UblInvoicePeriod,
	UblLine,
	UblParty,
	UblTaxCategory,
	UblTaxSubtotal,
} from "../../types";
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

// ── Validation ─────────────────────────────────────────────────────────
//
// The model is permissive (the parser reads whatever a document states); the
// serializer is where EN 16931 / Peppol BIS Billing 3.0 mandatory fields are
// enforced. Each check names the BT and the model path in its message.

const missing = (what: string, path: string): UblBuildError =>
	new UblBuildError(`Missing ${what} (${path})`);

function required<T>(value: T | undefined, what: string, path: string): NonNullable<T> {
	if (value === undefined || value === null || value === "") {
		throw missing(what, path);
	}
	return value as NonNullable<T>;
}

/** Category `O` (outside scope) is the one category BR-O-05 forbids a percent on. */
const requiresPercent = (categoryId: string): boolean => categoryId !== "O";

const validateTaxCategory = (
	category: UblTaxCategory | undefined,
	path: string,
): UblTaxCategory & { id: string } => {
	const present = required(category, "VAT category (BT-151/BT-118)", path);
	const id = required(present.id, "VAT category code (BT-151/BT-118)", `${path}.id`);
	if (requiresPercent(id) && present.percent === undefined) {
		throw missing(`VAT rate (BT-152/BT-119) for category ${id}`, `${path}.percent`);
	}
	return { ...present, id };
};

const validateLine = (line: UblLine, index: number): void => {
	const path = `lines[${index}]`;
	required(line.id, "line identifier (BT-126)", `${path}.id`);
	required(line.quantity, "invoiced quantity (BT-129)", `${path}.quantity`);
	required(line.unitCode, "unit code (BT-130)", `${path}.unitCode`);
	required(line.unitPrice, "net unit price (BT-146)", `${path}.unitPrice`);
	required(
		line.lineExtensionAmount,
		"line net amount (BT-131)",
		`${path}.lineExtensionAmount`,
	);
	validateTaxCategory(line.taxCategory, `${path}.taxCategory`);
};

const isExternalOnly = (attachment: UblAttachment): boolean =>
	attachment.externalUri !== undefined && attachment.base64Content === undefined;

const validateAttachment = (attachment: UblAttachment, index: number): void => {
	if (isExternalOnly(attachment)) return;
	const path = `attachments[${index}]`;
	required(attachment.filename, "attachment filename (BT-125-2)", `${path}.filename`);
	required(
		attachment.mimeCode,
		"attachment MIME code (BT-125-1)",
		`${path}.mimeCode`,
	);
	required(
		attachment.base64Content,
		"attachment content (BT-125)",
		`${path}.base64Content`,
	);
};

const validateInvoice = (doc: UblInvoice): void => {
	required(doc.id, "document identifier (BT-1)", "id");
	required(doc.issueDate, "issue date (BT-2)", "issueDate");
	required(doc.currency, "document currency (BT-5)", "currency");
	required(doc.seller.name, "seller name (BT-27)", "seller.name");
	required(doc.buyer.name, "buyer name (BT-44)", "buyer.name");
	if (doc.seller.endpoint && doc.seller.endpoint.scheme === undefined) {
		throw missing("seller endpoint scheme (BT-34-1)", "seller.endpoint.scheme");
	}
	if (doc.buyer.endpoint && doc.buyer.endpoint.scheme === undefined) {
		throw missing("buyer endpoint scheme (BT-49-1)", "buyer.endpoint.scheme");
	}
	if (doc.lines.length === 0) {
		throw new UblBuildError("A document needs at least one line (BG-25, lines)");
	}
	doc.lines.forEach(validateLine);
	required(doc.taxTotal.taxAmount, "total VAT amount (BT-110)", "taxTotal.taxAmount");
	const total = doc.monetaryTotal;
	required(
		total.lineExtensionAmount,
		"sum of line net amounts (BT-106)",
		"monetaryTotal.lineExtensionAmount",
	);
	required(
		total.taxExclusiveAmount,
		"total without VAT (BT-109)",
		"monetaryTotal.taxExclusiveAmount",
	);
	required(
		total.taxInclusiveAmount,
		"total with VAT (BT-112)",
		"monetaryTotal.taxInclusiveAmount",
	);
	required(total.payableAmount, "amount due (BT-115)", "monetaryTotal.payableAmount");
	(doc.attachments ?? []).forEach(validateAttachment);
};

// ── Formatting ─────────────────────────────────────────────────────────

/** Format a monetary value as a 2-decimal string (UBL amounts are fixed-scale). */
const amount = (value: number): string => value.toFixed(2);

/** Format a VAT percentage. Trims to at most 2 decimals without forcing them. */
const percent = (value: number): string => {
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? rounded.toFixed(2) : String(rounded);
};

const money = (name: string, value: number, currency: string): XmlElement =>
	el(name, { currencyID: currency }, amount(value));

const text = (name: string, value: string | undefined): XmlElement | null =>
	value !== undefined ? el(name, null, value) : null;

const taxScheme = (schemeId: string | undefined): XmlElement =>
	el("cac:TaxScheme", null, [el("cbc:ID", null, schemeId ?? VAT_TAX_SCHEME_ID)]);

/**
 * Render a tax category, shared between `cac:ClassifiedTaxCategory` (on lines)
 * and `cac:TaxCategory` (in the VAT breakdown). EN 16931 requires an exemption
 * reason for the non-charging categories (E/AE/O/K/G).
 */
const taxCategory = (
	name: string,
	category: UblTaxCategory,
	path: string,
): XmlElement => {
	const valid = validateTaxCategory(category, path);
	return el(name, null, [
		el("cbc:ID", null, valid.id),
		valid.percent !== undefined
			? el("cbc:Percent", null, percent(valid.percent))
			: null,
		text("cbc:TaxExemptionReason", valid.exemptionReason),
		taxScheme(valid.schemeId),
	]);
};

const postalAddress = (address: UblAddress): XmlElement =>
	el("cac:PostalAddress", null, [
		text("cbc:StreetName", address.street),
		text("cbc:AdditionalStreetName", address.additionalStreet),
		text("cbc:CityName", address.city),
		text("cbc:PostalZone", address.postalZone),
		text("cbc:CountrySubentity", address.countrySubentity),
		address.countryCode !== undefined
			? el("cac:Country", null, [
					el(
						"cbc:IdentificationCode",
						{ listID: COUNTRY_CODE_LIST_ID },
						address.countryCode,
					),
				])
			: null,
	]);

const party = (source: UblParty, name: string): XmlElement =>
	el("cac:Party", null, [
		source.endpoint
			? el(
					"cbc:EndpointID",
					{ schemeID: source.endpoint.scheme ?? "" },
					source.endpoint.value,
				)
			: null,
		el("cac:PartyName", null, [el("cbc:Name", null, name)]),
		source.address ? postalAddress(source.address) : null,
		source.vatId !== undefined
			? el("cac:PartyTaxScheme", null, [
					el("cbc:CompanyID", null, source.vatId),
					taxScheme(source.taxSchemeId),
				])
			: null,
		el("cac:PartyLegalEntity", null, [
			el("cbc:RegistrationName", null, source.registrationName ?? name),
			source.companyId
				? el(
						"cbc:CompanyID",
						source.companyId.scheme !== undefined
							? { schemeID: source.companyId.scheme }
							: null,
						source.companyId.value,
					)
				: null,
		]),
	]);

const taxSubtotal = (
	subtotal: UblTaxSubtotal,
	currency: string,
	index: number,
): XmlElement => {
	const path = `taxTotal.subtotals[${index}]`;
	return el("cac:TaxSubtotal", null, [
		money(
			"cbc:TaxableAmount",
			required(
				subtotal.taxableAmount,
				"taxable amount (BT-116)",
				`${path}.taxableAmount`,
			),
			currency,
		),
		money(
			"cbc:TaxAmount",
			required(subtotal.taxAmount, "VAT amount (BT-117)", `${path}.taxAmount`),
			currency,
		),
		taxCategory(
			"cac:TaxCategory",
			required(subtotal.category, "VAT category (BT-118)", `${path}.category`),
			`${path}.category`,
		),
	]);
};

/**
 * `cac:LegalMonetaryTotal` children, in UBL sequence order. `cbc:PrepaidAmount`
 * (BT-113) and `cbc:PayableRoundingAmount` (BT-114) precede `cbc:PayableAmount`
 * — emitting them after it produces schema-invalid XML. BT-113/BT-114 are
 * omitted when absent or zero.
 */
const legalMonetaryTotalChildren = (doc: UblInvoice): XmlElement[] => {
	const { currency, monetaryTotal: total } = doc;
	const children: (XmlElement | null)[] = [
		money("cbc:LineExtensionAmount", total.lineExtensionAmount ?? 0, currency),
		money("cbc:TaxExclusiveAmount", total.taxExclusiveAmount ?? 0, currency),
		money("cbc:TaxInclusiveAmount", total.taxInclusiveAmount ?? 0, currency),
		total.prepaidAmount
			? money("cbc:PrepaidAmount", total.prepaidAmount, currency)
			: null,
		total.payableRoundingAmount
			? money("cbc:PayableRoundingAmount", total.payableRoundingAmount, currency)
			: null,
		money("cbc:PayableAmount", total.payableAmount ?? 0, currency),
	];
	return children.filter((child): child is XmlElement => Boolean(child));
};

/**
 * `cac:InvoicePeriod`. Null when neither bound is set — an empty period element
 * fails BR-CO-19, which requires at least one of the two dates.
 */
const invoicePeriod = (period: UblInvoicePeriod | undefined): XmlElement | null => {
	if (!period || (period.startDate === undefined && period.endDate === undefined)) {
		return null;
	}
	return el("cac:InvoicePeriod", null, [
		text("cbc:StartDate", period.startDate),
		text("cbc:EndDate", period.endDate),
	]);
};

const line = (
	source: UblLine,
	currency: string,
	documentType: UblInvoice["documentType"],
): XmlElement => {
	const isCreditNote = documentType === "CreditNote";
	const lineElementName = isCreditNote ? "cac:CreditNoteLine" : "cac:InvoiceLine";
	const quantityElementName = isCreditNote
		? "cbc:CreditedQuantity"
		: "cbc:InvoicedQuantity";
	const unitCode = source.unitCode ?? "";
	// BT-146 covers BT-149 units; the model holds the per-unit price.
	const priceAmount = (source.unitPrice ?? 0) * (source.baseQuantity ?? 1);

	return el(lineElementName, null, [
		el("cbc:ID", null, source.id),
		el(quantityElementName, { unitCode }, String(source.quantity ?? 0)),
		money("cbc:LineExtensionAmount", source.lineExtensionAmount ?? 0, currency),
		invoicePeriod(source.invoicePeriod),
		el("cac:Item", null, [
			text("cbc:Description", source.description),
			// BT-153 is mandatory; BT-154 stands in when the line has no name.
			el("cbc:Name", null, source.itemName ?? source.description ?? source.id),
			taxCategory(
				"cac:ClassifiedTaxCategory",
				source.taxCategory ?? {},
				`lines[${source.id}].taxCategory`,
			),
		]),
		// BT-149's unit code must match the invoiced/credited quantity's
		// (PEPPOL-EN16931-R130).
		el("cac:Price", null, [
			money("cbc:PriceAmount", priceAmount, currency),
			source.baseQuantity !== undefined
				? el("cbc:BaseQuantity", { unitCode }, String(source.baseQuantity))
				: null,
		]),
	]);
};

const attachmentReference = (attachment: UblAttachment): XmlElement =>
	el("cac:AdditionalDocumentReference", null, [
		el(
			"cbc:ID",
			null,
			attachment.id ?? attachment.filename ?? attachment.externalUri ?? "",
		),
		el("cac:Attachment", null, [
			isExternalOnly(attachment)
				? el("cac:ExternalReference", null, [
						el("cbc:URI", null, attachment.externalUri ?? ""),
					])
				: el(
						"cbc:EmbeddedDocumentBinaryObject",
						{
							mimeCode: attachment.mimeCode ?? "",
							filename: attachment.filename ?? "",
						},
						attachment.base64Content ?? "",
					),
		]),
	]);

const billingReference = (reference: UblBillingReference): XmlElement | null => {
	if (reference.invoiceId === undefined) return null;
	return el("cac:BillingReference", null, [
		el("cac:InvoiceDocumentReference", null, [
			el("cbc:ID", null, reference.invoiceId),
		]),
	]);
};

/**
 * Serialize a {@link UblInvoice} into a Peppol BIS Billing 3.0 XML string.
 *
 * Emits the subset of the model a Peppol BIS Billing 3.0 document needs:
 * header (`customizationId`, `profileId` and `invoiceTypeCode` default to the
 * BIS values), note, buyer reference, invoice period, billing reference,
 * attachments, parties, payment terms, VAT breakdown, monetary totals and
 * lines with their price and classified VAT category. Payment means,
 * allowances/charges, delivery and the document references are not emitted.
 *
 * @throws {UblBuildError} when a field EN 16931 / Peppol BIS makes mandatory is
 * missing: document id, issue date, currency, seller and buyer name, an
 * endpoint without a scheme, at least one line, per line the quantity, unit
 * code, unit price, net amount and VAT category (id, plus the rate unless the
 * category is `O`), the total VAT amount, the four monetary totals, and for an
 * embedded attachment its filename, MIME code and content.
 */
export const serializeUblInvoice = (doc: UblInvoice): string => {
	validateInvoice(doc);

	const isCreditNote = doc.documentType === "CreditNote";
	const rootName = isCreditNote ? "CreditNote" : "Invoice";
	const rootNamespace = isCreditNote ? NS_CREDIT_NOTE : NS_INVOICE;
	const typeCodeElement = isCreditNote
		? el(
				"cbc:CreditNoteTypeCode",
				null,
				doc.invoiceTypeCode ?? CREDIT_NOTE_TYPE_CODE,
			)
		: el("cbc:InvoiceTypeCode", null, doc.invoiceTypeCode ?? INVOICE_TYPE_CODE);

	const children: (XmlElement | null | false)[] = [
		el("cbc:CustomizationID", null, doc.customizationId ?? UBL_CUSTOMIZATION_ID),
		el("cbc:ProfileID", null, doc.profileId ?? UBL_PROFILE_ID),
		el("cbc:ID", null, doc.id),
		el("cbc:IssueDate", null, doc.issueDate),
		// CreditNote has no DueDate element in the UBL sequence.
		!isCreditNote ? text("cbc:DueDate", doc.dueDate) : null,
		typeCodeElement,
		text("cbc:Note", doc.note),
		el("cbc:DocumentCurrencyCode", null, doc.currency),
		text("cbc:BuyerReference", doc.buyerReference),
		invoicePeriod(doc.invoicePeriod),
		doc.billingReference ? billingReference(doc.billingReference) : null,
		...(doc.attachments ?? []).map(attachmentReference),
		el("cac:AccountingSupplierParty", null, [
			party(doc.seller, doc.seller.name ?? ""),
		]),
		el("cac:AccountingCustomerParty", null, [
			party(doc.buyer, doc.buyer.name ?? ""),
		]),
		// BT-20. In both the Invoice and CreditNote sequences PaymentTerms sits
		// after the parties (and PaymentMeans, which we do not emit) and before
		// TaxTotal.
		doc.paymentTermsNote !== undefined
			? el("cac:PaymentTerms", null, [el("cbc:Note", null, doc.paymentTermsNote)])
			: null,
		el("cac:TaxTotal", null, [
			money("cbc:TaxAmount", doc.taxTotal.taxAmount ?? 0, doc.currency),
			...doc.taxTotal.subtotals.map((subtotal, index) =>
				taxSubtotal(subtotal, doc.currency, index),
			),
		]),
		el("cac:LegalMonetaryTotal", null, legalMonetaryTotalChildren(doc)),
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

/** Alias of {@link serializeUblInvoice}, kept under the historical name. */
export const serializeUblDocument = serializeUblInvoice;
