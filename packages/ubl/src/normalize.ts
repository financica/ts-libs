import { parseUblInvoice } from "./parser.js";
import type {
	InvoiceExtractionDTO,
	UblAddress,
	UblAllowanceCharge,
	UblAttachment,
	UblInvoice,
} from "./types.js";

// --- Utility helpers ---

const UTF8_BOM = 0xfeff;

const normalizeText = (value?: string | null): string | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const upper = trimmed.toUpperCase();
	if (upper === "NA" || upper === "N/A") return null;
	return trimmed;
};

const toNumberOrNull = (value: number | null | undefined): number | null =>
	Number.isFinite(value ?? Number.NaN) ? (value as number) : null;

export const normalizeCurrency = (value?: string | null): string | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.toUpperCase();
};

export const parseDate = (value?: string | null): string | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const timestamp = Date.parse(trimmed);
	if (Number.isNaN(timestamp)) return null;
	const iso = new Date(timestamp).toISOString();
	return iso.slice(0, 10);
};

// --- Address helpers ---

const addressToString = (address?: UblAddress): string | null => {
	if (!address) return null;
	const street = [address.street, address.additionalStreet]
		.filter((part) => part && part.trim().length > 0)
		.join(" ");
	const cityLine = [address.postalZone, address.city]
		.filter((part) => part && part.trim().length > 0)
		.join(" ");
	const countryLine = [address.countrySubentity, address.countryCode]
		.filter((part) => part && part.trim().length > 0)
		.join(" ");
	const lines = [street, cityLine, countryLine].filter((line) => line.length > 0);
	return lines.length > 0 ? lines.join("\n") : null;
};

const addressToStructured = (address?: UblAddress) => {
	if (!address) return null;
	const line1 = [address.street, address.additionalStreet]
		.filter((part) => part && part.trim().length > 0)
		.join(" ");
	const result = {
		line1: normalizeText(line1),
		line2: null as string | null,
		city: normalizeText(address.city),
		state: normalizeText(address.countrySubentity),
		postal_code: normalizeText(address.postalZone),
		country: normalizeText(address.countryCode),
	};
	const hasValue = Object.values(result).some((value) => value);
	return hasValue ? result : null;
};

// --- Attachment & charge sanitizers ---

const base64ByteLength = (content: string) => {
	const sanitized = content.replace(/\s+/g, "");
	if (!sanitized) return 0;
	const paddingLength = sanitized.endsWith("==")
		? 2
		: sanitized.endsWith("=")
			? 1
			: 0;
	return Math.floor((sanitized.length * 3) / 4) - paddingLength;
};

const sanitizeAttachments = (attachments?: UblAttachment[]) =>
	(attachments ?? []).map((attachment) => ({
		id: normalizeText(attachment.id),
		filename: normalizeText(attachment.filename),
		mime_code: normalizeText(attachment.mimeCode),
		description: normalizeText(attachment.description),
		size_bytes: base64ByteLength(attachment.base64Content),
	}));

const sanitizeAllowanceCharges = (charges?: UblAllowanceCharge[]) =>
	(charges ?? []).map((charge) => ({
		charge_indicator: charge.chargeIndicator,
		amount: toNumberOrNull(charge.amount),
		base_amount: toNumberOrNull(charge.baseAmount),
		multiplier_factor_numeric: toNumberOrNull(charge.multiplierFactorNumeric),
		reason: normalizeText(charge.reason),
		reason_code: normalizeText(charge.reasonCode),
		tax_percent: toNumberOrNull(charge.taxPercent),
		tax_category_id: normalizeText(charge.taxCategoryId),
		tax_scheme_id: normalizeText(charge.taxSchemeId),
	}));

const sanitizeRawUbl = (ubl: UblInvoice) => ({
	...ubl,
	attachments: sanitizeAttachments(ubl.attachments),
});

// --- Summation helpers ---

const sumTaxTotal = (ubl: UblInvoice) => {
	const subtotalSum = ubl.taxSubtotals.reduce(
		(sum, subtotal) => sum + subtotal.taxAmount,
		0,
	);
	if (ubl.taxSubtotals.length > 0 && Number.isFinite(subtotalSum)) {
		return subtotalSum;
	}
	return ubl.monetaryTotal.taxInclusiveAmount - ubl.monetaryTotal.taxExclusiveAmount;
};

const sumAllowanceChargesByType = (
	charges: UblAllowanceCharge[] | undefined,
	chargeIndicator: boolean,
) =>
	(charges ?? []).reduce((sum, charge) => {
		if (charge.chargeIndicator !== chargeIndicator) return sum;
		return sum + Math.abs(charge.amount);
	}, 0);

// --- Public API ---

/**
 * Decode raw XML bytes, stripping an optional UTF-8 BOM.
 */
export const decodeXmlBytes = (bytes: Uint8Array): string => {
	const text = new TextDecoder("utf-8").decode(bytes);
	return text.charCodeAt(0) === UTF8_BOM ? text.slice(1) : text;
};

/**
 * Parse a UBL XML string and normalize it into a flat DTO suitable for
 * database storage or API responses.
 */
export const normalizeUblResponse = (
	xml: string,
	documentId: string,
): {
	extracted: InvoiceExtractionDTO;
	rawPayload: Record<string, unknown>;
} => {
	const ubl = parseUblInvoice(xml);
	if (!ubl) {
		throw new Error("Failed to parse UBL invoice XML");
	}

	const subtotal =
		toNumberOrNull(ubl.monetaryTotal.taxExclusiveAmount) ??
		toNumberOrNull(ubl.monetaryTotal.lineExtensionAmount);
	const total =
		toNumberOrNull(ubl.monetaryTotal.taxInclusiveAmount) ??
		toNumberOrNull(ubl.monetaryTotal.payableAmount);
	const amountDue = toNumberOrNull(ubl.monetaryTotal.payableAmount);
	const prepaidAmount = toNumberOrNull(ubl.monetaryTotal.prepaidAmount);
	const amountPaid =
		prepaidAmount ??
		(total !== null && amountDue !== null && total > amountDue
			? toNumberOrNull(total - amountDue)
			: null);
	const taxTotal = toNumberOrNull(sumTaxTotal(ubl));
	const hasHeaderAllowanceCharges = (ubl.allowanceCharges?.length ?? 0) > 0;
	const headerDiscountTotal = sumAllowanceChargesByType(ubl.allowanceCharges, false);
	const headerChargeTotal = sumAllowanceChargesByType(ubl.allowanceCharges, true);
	const currency = normalizeCurrency(ubl.currency);
	const paymentTerms = normalizeText(ubl.paymentTermsNote);
	const poNumber =
		normalizeText(ubl.orderReference) ?? normalizeText(ubl.salesOrderId);

	const lineItems = ubl.lines.map((line) => ({
		description:
			normalizeText(line.description) ??
			normalizeText(line.itemName) ??
			"Line item",
		quantity: toNumberOrNull(line.quantity),
		unit: normalizeText(line.unitCode),
		unit_price: toNumberOrNull(line.unitPrice),
		amount: toNumberOrNull(line.lineExtensionAmount),
		tax_amount: toNumberOrNull(line.taxAmount),
		tax_rate: toNumberOrNull(line.taxPercent),
		product_code:
			normalizeText(line.sellersItemId) ?? normalizeText(line.buyersItemId),
		discount_amount: toNumberOrNull(line.discountAmount),
		extra: {
			ubl_line_id: normalizeText(line.id),
			item_name: normalizeText(line.itemName),
			sellers_item_id: normalizeText(line.sellersItemId),
			buyers_item_id: normalizeText(line.buyersItemId),
			tax_category_id: normalizeText(line.taxCategoryId),
			tax_scheme_id: normalizeText(line.taxSchemeId),
			tax_subtotals: line.taxSubtotals ?? [],
			allowance_charges: sanitizeAllowanceCharges(line.allowanceCharges),
			charge_amount: toNumberOrNull(line.chargeAmount),
		},
	}));

	const supplierAddress = addressToString(ubl.seller.address);
	const receiverAddress = addressToString(ubl.buyer.address);
	const supplierAddressStructured = addressToStructured(ubl.seller.address);
	const receiverAddressStructured = addressToStructured(ubl.buyer.address);
	const attachmentMetadata = sanitizeAttachments(ubl.attachments);
	const paymentMeansList =
		ubl.paymentMeansList && ubl.paymentMeansList.length > 0
			? ubl.paymentMeansList
			: ubl.paymentMeans
				? [ubl.paymentMeans]
				: [];

	const extracted: InvoiceExtractionDTO = {
		provider: "ubl_xml",
		document_id: documentId,
		invoice: {
			invoice_number: normalizeText(ubl.id),
			invoice_date: parseDate(ubl.issueDate),
			due_date: parseDate(ubl.dueDate),
			currency,
			subtotal,
			tax_total: taxTotal,
			total,
			amount_due: amountDue,
			amount_paid: amountPaid,
			discount_total:
				toNumberOrNull(ubl.monetaryTotal.allowanceTotalAmount) ??
				(hasHeaderAllowanceCharges
					? toNumberOrNull(headerDiscountTotal)
					: null),
			shipping_total:
				toNumberOrNull(ubl.monetaryTotal.chargeTotalAmount) ??
				(hasHeaderAllowanceCharges ? toNumberOrNull(headerChargeTotal) : null),
			payment_terms: paymentTerms,
			po_number: poNumber,
			supplier: {
				name:
					normalizeText(ubl.seller.name) ??
					normalizeText(ubl.seller.registrationName),
				address: supplierAddress,
				tax_id:
					normalizeText(ubl.seller.vatId) ??
					normalizeText(ubl.seller.companyId),
				iban: normalizeText(ubl.paymentMeans?.iban),
				bic: normalizeText(ubl.paymentMeans?.bic),
			},
			receiver: {
				name:
					normalizeText(ubl.buyer.name) ??
					normalizeText(ubl.buyer.registrationName),
				address: receiverAddress,
				tax_id:
					normalizeText(ubl.buyer.vatId) ??
					normalizeText(ubl.buyer.companyId),
			},
			extra: {
				document_type: ubl.documentType,
				customization_id: normalizeText(ubl.customizationId),
				profile_id: normalizeText(ubl.profileId),
				invoice_type_code: normalizeText(ubl.invoiceTypeCode),
				buyer_reference: normalizeText(ubl.buyerReference),
				order_reference_id: normalizeText(ubl.orderReference),
				sales_order_id: normalizeText(ubl.salesOrderId),
				contract_reference: normalizeText(ubl.contractReference),
				project_reference: normalizeText(ubl.projectReference),
				tax_point_date: parseDate(ubl.taxPointDate),
				invoice_period: ubl.invoicePeriod ?? null,
				note: normalizeText(ubl.note),
				payment_means: ubl.paymentMeans
					? {
							code: normalizeText(ubl.paymentMeans.code),
							code_name: normalizeText(ubl.paymentMeans.codeName),
							payment_id: normalizeText(ubl.paymentMeans.paymentId),
							iban: normalizeText(ubl.paymentMeans.iban),
							bic: normalizeText(ubl.paymentMeans.bic),
							account_name: normalizeText(ubl.paymentMeans.accountName),
						}
					: null,
				payment_means_list: paymentMeansList.map((item) => ({
					code: normalizeText(item.code),
					code_name: normalizeText(item.codeName),
					payment_id: normalizeText(item.paymentId),
					iban: normalizeText(item.iban),
					bic: normalizeText(item.bic),
					account_name: normalizeText(item.accountName),
				})),
				delivery: ubl.delivery
					? {
							actual_delivery_date: parseDate(
								ubl.delivery.actualDeliveryDate,
							),
							address: addressToStructured(ubl.delivery.address),
						}
					: null,
				supplier: {
					endpoint_id: normalizeText(ubl.seller.endpointId),
					endpoint_scheme_id: normalizeText(ubl.seller.endpointSchemeId),
					registration_name: normalizeText(ubl.seller.registrationName),
					company_legal_form: normalizeText(ubl.seller.companyLegalForm),
					tax_scheme_id: normalizeText(ubl.seller.taxSchemeId),
					contact_name: normalizeText(ubl.seller.contact?.name),
					contact_phone: normalizeText(ubl.seller.contact?.phone),
					contact_email: normalizeText(ubl.seller.contact?.email),
				},
				receiver: {
					endpoint_id: normalizeText(ubl.buyer.endpointId),
					endpoint_scheme_id: normalizeText(ubl.buyer.endpointSchemeId),
					registration_name: normalizeText(ubl.buyer.registrationName),
					company_legal_form: normalizeText(ubl.buyer.companyLegalForm),
					tax_scheme_id: normalizeText(ubl.buyer.taxSchemeId),
					contact_name: normalizeText(ubl.buyer.contact?.name),
					contact_phone: normalizeText(ubl.buyer.contact?.phone),
					contact_email: normalizeText(ubl.buyer.contact?.email),
				},
				supplier_address_structured: supplierAddressStructured,
				receiver_address_structured: receiverAddressStructured,
				tax_subtotals: ubl.taxSubtotals,
				allowance_charges: sanitizeAllowanceCharges(ubl.allowanceCharges),
				attachments: attachmentMetadata,
			},
		},
		line_items: lineItems,
		confidence: {
			overall: 1,
			fields: {
				invoice_id: 1,
				invoice_date: 1,
				due_date: 1,
				total_amount: 1,
				supplier_name: 1,
			},
		},
	};

	return {
		extracted,
		rawPayload: {
			format: "ubl_xml",
			invoice: sanitizeRawUbl(ubl),
		},
	};
};

/**
 * Parse a UBL invoice from raw bytes and normalize it into a DTO.
 */
export const parseUblInvoiceDocument = (params: {
	bytes: Uint8Array;
	documentId: string;
	mimeType: string;
}) => {
	const xml = decodeXmlBytes(params.bytes);
	const { extracted, rawPayload } = normalizeUblResponse(xml, params.documentId);
	return {
		rawPayload: {
			...rawPayload,
			mime_type: params.mimeType,
		},
		extracted,
		providerJobId: null as string | null,
	};
};
