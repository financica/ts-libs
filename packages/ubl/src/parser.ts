import type { Element } from "@xmldom/xmldom";
import type {
	UblAddress,
	UblAllowanceCharge,
	UblAttachment,
	UblBillingReference,
	UblContact,
	UblDelivery,
	UblDocumentReference,
	UblInvoice,
	UblInvoicePeriod,
	UblItemProperty,
	UblLine,
	UblMonetaryTotal,
	UblParty,
	UblPartyIdentification,
	UblPaymentMeans,
	UblTaxSubtotal,
} from "./types.js";
import { UblParseError } from "./errors.js";
import { CAC_NS, CBC_NS, parseXmlDocument } from "./xml-dom.js";

// --- DOM helpers ---

const trimmed = (value: string | null | undefined): string | undefined => {
	const text = value?.trim();
	return text ? text : undefined;
};

/** First descendant CBC element's trimmed text; absent or blank is `undefined`. */
function cbcText(parent: Element, tag: string): string | undefined {
	return trimmed(parent.getElementsByTagNameNS(CBC_NS, tag)[0]?.textContent);
}

/** Like {@link cbcText} but throws: the element is mandatory in EN 16931. */
function requiredCbcText(parent: Element, tag: string, what: string): string {
	const value = cbcText(parent, tag);
	if (value === undefined) throw new UblParseError(`Missing ${what} (cbc:${tag})`);
	return value;
}

const toNumber = (value: string | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

function cacElement(parent: Element, tag: string): Element | null {
	return parent.getElementsByTagNameNS(CAC_NS, tag)[0] ?? null;
}

function cacElements(parent: Element, tag: string): Element[] {
	return Array.from(parent.getElementsByTagNameNS(CAC_NS, tag));
}

/** First descendant CBC element as a number; absent or non-numeric is `undefined`. */
function cbcNumber(parent: Element, tag: string): number | undefined {
	return toNumber(cbcText(parent, tag));
}

function childElementsByTagNs(
	parent: Element,
	namespace: string,
	tag: string,
): Element[] {
	const elements: Element[] = [];
	for (let i = 0; i < parent.childNodes.length; i++) {
		const node = parent.childNodes[i];
		if (!node || node.nodeType !== 1) continue;
		const element = node as Element;
		if (element.namespaceURI === namespace && element.localName === tag) {
			elements.push(element);
		}
	}
	return elements;
}

function cbcDirectText(parent: Element, tag: string): string | undefined {
	return trimmed(childElementsByTagNs(parent, CBC_NS, tag)[0]?.textContent);
}

function cbcDirectNumber(parent: Element, tag: string): number | undefined {
	return toNumber(cbcDirectText(parent, tag));
}

const attribute = (el: Element | null | undefined, name: string): string | undefined =>
	trimmed(el?.getAttribute(name));

function cacDirectElement(parent: Element, tag: string): Element | null {
	return childElementsByTagNs(parent, CAC_NS, tag)[0] ?? null;
}

function cacDirectElements(parent: Element, tag: string): Element[] {
	return childElementsByTagNs(parent, CAC_NS, tag);
}

// --- Section parsers ---

function parseAddressFromElement(address: Element | null): UblAddress | undefined {
	if (!address) return undefined;
	const country = cacElement(address, "Country");
	return {
		street: cbcText(address, "StreetName"),
		additionalStreet: cbcText(address, "AdditionalStreetName"),
		city: cbcText(address, "CityName"),
		postalZone: cbcText(address, "PostalZone"),
		countrySubentity: cbcText(address, "CountrySubentity"),
		countryCode: country ? cbcText(country, "IdentificationCode") : undefined,
	};
}

function parseAddress(party: Element): UblAddress | undefined {
	const postal = cacElement(party, "PostalAddress");
	return parseAddressFromElement(postal);
}

function parseTaxSchemeId(parent: Element | null): string | undefined {
	if (!parent) return undefined;
	const taxScheme = cacElement(parent, "TaxScheme");
	if (!taxScheme) return undefined;
	return cbcText(taxScheme, "ID");
}

function parseContact(party: Element): UblContact | undefined {
	const contact = cacElement(party, "Contact");
	if (!contact) return undefined;
	const name = cbcText(contact, "Name");
	const phone = cbcText(contact, "Telephone");
	const email = cbcText(contact, "ElectronicMail");
	if (!name && !phone && !email) return undefined;
	return { name, phone, email };
}

function parsePartyIdentifications(party: Element): UblPartyIdentification[] {
	const ids = cacElements(party, "PartyIdentification");
	const result: UblPartyIdentification[] = [];
	for (const idEl of ids) {
		const idValue = cbcText(idEl, "ID");
		if (!idValue) continue;
		result.push({
			id: idValue,
			schemeId: attribute(
				idEl.getElementsByTagNameNS(CBC_NS, "ID")[0],
				"schemeID",
			),
		});
	}
	return result;
}

function parseParty(root: Element, role: string): UblParty {
	const wrapper = cacElement(root, role);
	const party = wrapper ? cacElement(wrapper, "Party") : null;
	if (!party) return {};

	const partyName = cacElement(party, "PartyName");
	const legalEntity = cacElement(party, "PartyLegalEntity");
	const taxScheme = cacElement(party, "PartyTaxScheme");
	const partyId = cacElement(party, "PartyIdentification");
	const endpointEl = party.getElementsByTagNameNS(CBC_NS, "EndpointID")[0];
	const partyIdentifications = parsePartyIdentifications(party);
	const companyIdEl = legalEntity
		? legalEntity.getElementsByTagNameNS(CBC_NS, "CompanyID")[0]
		: null;

	return {
		name: partyName ? cbcText(partyName, "Name") : undefined,
		registrationName: legalEntity
			? cbcText(legalEntity, "RegistrationName")
			: undefined,
		companyLegalForm: legalEntity
			? cbcText(legalEntity, "CompanyLegalForm")
			: undefined,
		vatId: taxScheme ? cbcText(taxScheme, "CompanyID") : undefined,
		taxSchemeId: parseTaxSchemeId(taxScheme),
		companyId: companyIdEl
			? trimmed(companyIdEl.textContent)
			: partyId
				? cbcText(partyId, "ID")
				: undefined,
		companyIdSchemeId: attribute(companyIdEl, "schemeID"),
		endpointId: trimmed(endpointEl?.textContent),
		endpointSchemeId: attribute(endpointEl, "schemeID"),
		partyIdentifications:
			partyIdentifications.length > 0 ? partyIdentifications : undefined,
		address: parseAddress(party),
		contact: parseContact(party),
	};
}

function parseTaxSubtotal(sub: Element): UblTaxSubtotal {
	const cat = cacElement(sub, "TaxCategory");
	return {
		taxableAmount: cbcNumber(sub, "TaxableAmount"),
		taxAmount: cbcNumber(sub, "TaxAmount"),
		taxPercent:
			(cat ? cbcNumber(cat, "Percent") : undefined) ?? cbcNumber(sub, "Percent"),
		taxCategoryId: cat ? cbcText(cat, "ID") : undefined,
		taxSchemeId: parseTaxSchemeId(cat),
		taxExemptionReason: cat ? cbcText(cat, "TaxExemptionReason") : undefined,
	};
}

function parseTaxSubtotalsFromTaxTotal(taxTotal: Element): UblTaxSubtotal[] {
	return cacDirectElements(taxTotal, "TaxSubtotal").map(parseTaxSubtotal);
}

function parseTaxSubtotals(root: Element): UblTaxSubtotal[] {
	const taxTotals = cacDirectElements(root, "TaxTotal");
	if (taxTotals.length === 0) return [];
	return taxTotals.flatMap(parseTaxSubtotalsFromTaxTotal);
}

function parseAllowanceCharge(charge: Element): UblAllowanceCharge {
	const taxCategory = cacElement(charge, "TaxCategory");
	const indicatorRaw = cbcDirectText(charge, "ChargeIndicator")?.toLowerCase();
	const chargeIndicator = indicatorRaw === "true" || indicatorRaw === "1";
	return {
		chargeIndicator,
		amount: cbcNumber(charge, "Amount"),
		baseAmount: cbcDirectNumber(charge, "BaseAmount"),
		multiplierFactorNumeric: cbcDirectNumber(charge, "MultiplierFactorNumeric"),
		reason: cbcText(charge, "AllowanceChargeReason"),
		reasonCode: cbcText(charge, "AllowanceChargeReasonCode"),
		taxPercent: taxCategory ? cbcNumber(taxCategory, "Percent") : undefined,
		taxCategoryId: taxCategory ? cbcText(taxCategory, "ID") : undefined,
		taxSchemeId: parseTaxSchemeId(taxCategory),
	};
}

function parseAllowanceCharges(parent: Element): UblAllowanceCharge[] {
	return cacDirectElements(parent, "AllowanceCharge").map(parseAllowanceCharge);
}

function parseLines(root: Element, isCreditNote: boolean): UblLine[] {
	const qtyTag = isCreditNote ? "CreditedQuantity" : "InvoicedQuantity";
	const lineTag = isCreditNote ? "CreditNoteLine" : "InvoiceLine";

	return cacElements(root, lineTag).map((line) => {
		const item = cacElement(line, "Item");
		const price = cacElement(line, "Price");
		const taxCategory = item ? cacElement(item, "ClassifiedTaxCategory") : null;
		const sellersId = item ? cacElement(item, "SellersItemIdentification") : null;
		const buyersId = item ? cacElement(item, "BuyersItemIdentification") : null;
		const qtyEl = line.getElementsByTagNameNS(CBC_NS, qtyTag)[0];
		const lineExtensionAmount = cbcNumber(line, "LineExtensionAmount");
		const lineTaxTotal = cacDirectElement(line, "TaxTotal");
		const lineTaxSubtotals = lineTaxTotal
			? parseTaxSubtotalsFromTaxTotal(lineTaxTotal)
			: [];
		const taxAmountFromSubtotals = lineTaxSubtotals.reduce(
			(sum, subtotal) => sum + (subtotal.taxAmount ?? 0),
			0,
		);
		const taxAmountFromLineTotal = lineTaxTotal
			? cbcDirectNumber(lineTaxTotal, "TaxAmount")
			: undefined;
		const taxPercent =
			lineTaxSubtotals[0]?.taxPercent ??
			(taxCategory ? cbcNumber(taxCategory, "Percent") : undefined);
		const computedTaxAmount =
			taxPercent !== undefined && lineExtensionAmount !== undefined
				? Number(((lineExtensionAmount * taxPercent) / 100).toFixed(2))
				: undefined;
		const lineAllowanceCharges = parseAllowanceCharges(line);
		const priceAllowanceCharges = price ? parseAllowanceCharges(price) : [];
		const allowanceCharges = [...lineAllowanceCharges, ...priceAllowanceCharges];
		const discountAmount = allowanceCharges.reduce(
			(sum, charge) =>
				charge.chargeIndicator ? sum : sum + Math.abs(charge.amount ?? 0),
			0,
		);
		const chargeAmount = allowanceCharges.reduce(
			(sum, charge) =>
				charge.chargeIndicator ? sum + Math.abs(charge.amount ?? 0) : sum,
			0,
		);

		const additionalItemProperties: UblItemProperty[] = [];
		if (item) {
			for (const prop of cacElements(item, "AdditionalItemProperty")) {
				const propName = cbcText(prop, "Name");
				const propValue = cbcText(prop, "Value");
				if (propName) {
					additionalItemProperties.push({
						name: propName,
						value: propValue,
					});
				}
			}
		}

		// EN16931 BT-146 (PriceAmount) is the price for BT-149 (BaseQuantity) units
		// of the item, not necessarily for one unit. Effective unit price is
		// PriceAmount / BaseQuantity, with BaseQuantity defaulting to 1 when absent.
		const priceAmount = price ? cbcNumber(price, "PriceAmount") : undefined;
		const priceBaseQuantity = price
			? cbcDirectNumber(price, "BaseQuantity")
			: undefined;
		const unitPrice =
			priceAmount !== undefined && priceBaseQuantity && priceBaseQuantity > 0
				? priceAmount / priceBaseQuantity
				: priceAmount;

		return {
			id: requiredCbcText(line, "ID", `${lineTag} identifier`),
			description: item ? cbcText(item, "Description") : undefined,
			quantity: cbcNumber(line, qtyTag),
			unitCode: attribute(qtyEl, "unitCode"),
			unitPrice,
			lineExtensionAmount,
			taxPercent,
			taxAmount:
				taxAmountFromLineTotal ??
				(lineTaxSubtotals.length > 0
					? taxAmountFromSubtotals
					: computedTaxAmount),
			taxCategoryId:
				lineTaxSubtotals[0]?.taxCategoryId ??
				(taxCategory ? cbcText(taxCategory, "ID") : undefined),
			taxSchemeId:
				lineTaxSubtotals[0]?.taxSchemeId ?? parseTaxSchemeId(taxCategory),
			taxSubtotals: lineTaxSubtotals.length > 0 ? lineTaxSubtotals : undefined,
			allowanceCharges:
				allowanceCharges.length > 0 ? allowanceCharges : undefined,
			discountAmount: discountAmount > 0 ? discountAmount : undefined,
			chargeAmount: chargeAmount > 0 ? chargeAmount : undefined,
			itemName: item ? cbcText(item, "Name") : undefined,
			sellersItemId: sellersId ? cbcText(sellersId, "ID") : undefined,
			buyersItemId: buyersId ? cbcText(buyersId, "ID") : undefined,
			additionalItemProperties:
				additionalItemProperties.length > 0
					? additionalItemProperties
					: undefined,
			invoicePeriod: parseInvoicePeriod(line),
		};
	});
}

function parseMonetaryTotal(root: Element): UblMonetaryTotal {
	const total = cacDirectElement(root, "LegalMonetaryTotal");
	if (!total) return {};
	return {
		lineExtensionAmount: cbcNumber(total, "LineExtensionAmount"),
		taxExclusiveAmount: cbcNumber(total, "TaxExclusiveAmount"),
		taxInclusiveAmount: cbcNumber(total, "TaxInclusiveAmount"),
		allowanceTotalAmount: cbcNumber(total, "AllowanceTotalAmount"),
		chargeTotalAmount: cbcNumber(total, "ChargeTotalAmount"),
		prepaidAmount: cbcNumber(total, "PrepaidAmount"),
		payableRoundingAmount: cbcNumber(total, "PayableRoundingAmount"),
		payableAmount: cbcNumber(total, "PayableAmount"),
	};
}

function parsePaymentMeansElement(pm: Element): UblPaymentMeans {
	const account = cacElement(pm, "PayeeFinancialAccount");
	const branch = account ? cacElement(account, "FinancialInstitutionBranch") : null;
	const paymentMeansCodeEl = pm.getElementsByTagNameNS(CBC_NS, "PaymentMeansCode")[0];
	const mandate = cacElement(pm, "PaymentMandate");

	return {
		code: cbcText(pm, "PaymentMeansCode"),
		codeName: attribute(paymentMeansCodeEl, "name"),
		paymentId: cbcText(pm, "PaymentID"),
		iban: account ? cbcText(account, "ID") : undefined,
		bic: branch ? cbcText(branch, "ID") : undefined,
		accountName: account ? cbcText(account, "Name") : undefined,
		mandateId: mandate ? cbcText(mandate, "ID") : undefined,
	};
}

function parsePaymentMeansList(root: Element): UblPaymentMeans[] | undefined {
	const list = cacElements(root, "PaymentMeans").map(parsePaymentMeansElement);
	return list.length > 0 ? list : undefined;
}

/**
 * BT-73/BT-74 on a document, BT-134/BT-135 on a line. Direct children only:
 * a descendant search on the document root would report the first line's
 * period as the document's whenever the document states none of its own.
 */
function parseInvoicePeriod(parent: Element): UblInvoicePeriod | undefined {
	const period = cacDirectElement(parent, "InvoicePeriod");
	if (!period) return undefined;

	const start = cbcText(period, "StartDate");
	const end = cbcText(period, "EndDate");
	if (!start && !end) return undefined;

	return {
		startDate: start,
		endDate: end,
		descriptionCode: cbcText(period, "DescriptionCode"),
	};
}

function parseDelivery(root: Element): UblDelivery | undefined {
	const delivery = cacElement(root, "Delivery");
	if (!delivery) return undefined;
	const actualDeliveryDate = cbcText(delivery, "ActualDeliveryDate");
	const deliveryLocation = cacElement(delivery, "DeliveryLocation");
	const address = parseAddressFromElement(
		deliveryLocation ? cacElement(deliveryLocation, "Address") : null,
	);
	if (!actualDeliveryDate && !address) return undefined;
	return {
		actualDeliveryDate,
		address,
	};
}

function parsePaymentTermsNote(root: Element): string | undefined {
	const paymentTerms = cacElement(root, "PaymentTerms");
	if (!paymentTerms) return undefined;
	return cbcText(paymentTerms, "Note");
}

function parseNotes(root: Element): string | undefined {
	const noteEls = root.getElementsByTagNameNS(CBC_NS, "Note");
	const notes: string[] = [];
	for (let i = 0; i < noteEls.length; i++) {
		const el = noteEls[i];
		if (!el) continue;
		if (el.parentElement === root || el.parentNode === root) {
			const text = el.textContent?.trim();
			if (text) notes.push(text);
		}
	}
	return notes.length > 0 ? notes.join("\n") : undefined;
}

function parseAttachments(root: Element): {
	attachments: UblAttachment[] | undefined;
	documentReferences: UblDocumentReference[] | undefined;
} {
	const refs = cacElements(root, "AdditionalDocumentReference");
	const attachments: UblAttachment[] = [];
	const documentReferences: UblDocumentReference[] = [];

	for (const ref of refs) {
		const attachment = cacElement(ref, "Attachment");
		const refId = cbcText(ref, "ID");
		const description = cbcText(ref, "DocumentDescription");

		if (!attachment) {
			// Text-only document reference (e.g. terms & conditions, notices)
			if (refId || description) {
				documentReferences.push({ id: refId, description });
			}
			continue;
		}

		const binaryEl = attachment.getElementsByTagNameNS(
			CBC_NS,
			"EmbeddedDocumentBinaryObject",
		)[0];
		const externalRef = cacElement(attachment, "ExternalReference");

		if (binaryEl) {
			const content = binaryEl.textContent?.trim();
			if (content) {
				attachments.push({
					id: refId,
					filename: attribute(binaryEl, "filename"),
					mimeCode: attribute(binaryEl, "mimeCode"),
					description,
					base64Content: content,
				});
			}
		} else if (externalRef) {
			const uri = cbcText(externalRef, "URI");
			if (uri) {
				attachments.push({
					id: refId,
					description,
					externalUri: uri,
				});
			}
		}
	}

	return {
		attachments: attachments.length > 0 ? attachments : undefined,
		documentReferences:
			documentReferences.length > 0 ? documentReferences : undefined,
	};
}

function parseBillingReference(root: Element): UblBillingReference | undefined {
	const billingRef = cacElement(root, "BillingReference");
	if (!billingRef) return undefined;
	const invoiceRef = cacElement(billingRef, "InvoiceDocumentReference");
	if (!invoiceRef) return undefined;
	const invoiceId = cbcText(invoiceRef, "ID");
	const invoiceIssueDate = cbcText(invoiceRef, "IssueDate");
	if (!invoiceId && !invoiceIssueDate) return undefined;
	return { invoiceId, invoiceIssueDate };
}

// --- Main parser ---

/**
 * Drop `undefined`-valued keys recursively so an absent field is an absent
 * key, not a key holding `undefined`. Arrays keep their order and length.
 */
function omitUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(omitUndefined) as T;
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			if (entry !== undefined) out[key] = omitUndefined(entry);
		}
		return out as T;
	}
	return value;
}

const INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const CREDIT_NOTE_NS = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";

/**
 * Parse a UBL 2.1 Invoice or CreditNote.
 *
 * Returns `null` when the XML is well-formed but its root is not a UBL
 * `Invoice`/`CreditNote`. Throws {@link UblParseError} when the XML is
 * malformed or the document lacks an element EN 16931 makes mandatory
 * (document id, issue date, currency, line id).
 */
export function parseUblInvoice(xml: string): UblInvoice | null {
	const doc = parseXmlDocument(xml);
	const root = doc.documentElement;
	if (!root) return null;

	let documentType: "Invoice" | "CreditNote";
	if (root.localName === "Invoice" && root.namespaceURI === INVOICE_NS) {
		documentType = "Invoice";
	} else if (
		root.localName === "CreditNote" &&
		root.namespaceURI === CREDIT_NOTE_NS
	) {
		documentType = "CreditNote";
	} else {
		return null;
	}

	const isCreditNote = documentType === "CreditNote";
	const id = requiredCbcText(root, "ID", "document identifier");
	const issueDate = requiredCbcText(root, "IssueDate", "issue date");
	const currency = requiredCbcText(root, "DocumentCurrencyCode", "currency code");
	const paymentMeansList = parsePaymentMeansList(root);
	const orderReference = cacElement(root, "OrderReference");
	const contractReference = cacElement(root, "ContractDocumentReference");
	const projectReference = cacElement(root, "ProjectReference");
	const { attachments, documentReferences } = parseAttachments(root);

	return omitUndefined<UblInvoice>({
		documentType,
		customizationId: cbcText(root, "CustomizationID"),
		profileId: cbcText(root, "ProfileID"),
		id,
		invoiceTypeCode:
			cbcText(root, "InvoiceTypeCode") ?? cbcText(root, "CreditNoteTypeCode"),
		issueDate,
		dueDate: cbcText(root, "DueDate"),
		taxPointDate: cbcText(root, "TaxPointDate"),
		currency,
		buyerReference: cbcText(root, "BuyerReference"),
		orderReference: orderReference ? cbcText(orderReference, "ID") : undefined,
		salesOrderId: orderReference
			? cbcText(orderReference, "SalesOrderID")
			: undefined,
		contractReference: contractReference
			? cbcText(contractReference, "ID")
			: undefined,
		projectReference: projectReference
			? cbcText(projectReference, "ID")
			: undefined,
		billingReference: parseBillingReference(root),
		seller: parseParty(root, "AccountingSupplierParty"),
		buyer: parseParty(root, "AccountingCustomerParty"),
		delivery: parseDelivery(root),
		lines: parseLines(root, isCreditNote),
		taxSubtotals: parseTaxSubtotals(root),
		monetaryTotal: parseMonetaryTotal(root),
		paymentMeansList,
		paymentMeans: paymentMeansList?.[0],
		invoicePeriod: parseInvoicePeriod(root),
		note: parseNotes(root),
		paymentTermsNote: parsePaymentTermsNote(root),
		attachments,
		documentReferences,
		allowanceCharges: parseAllowanceCharges(root),
	});
}
