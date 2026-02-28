import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import type {
	UblAddress,
	UblAllowanceCharge,
	UblAttachment,
	UblDelivery,
	UblInvoice,
	UblInvoicePeriod,
	UblLine,
	UblMonetaryTotal,
	UblParty,
	UblPaymentMeans,
	UblTaxSubtotal,
} from "./types.js";

const CBC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC_NS =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

// --- DOM helpers ---

function cbcText(parent: Element, tag: string): string {
	const el = parent.getElementsByTagNameNS(CBC_NS, tag)[0];
	return el?.textContent?.trim() ?? "";
}

function cacElement(parent: Element, tag: string): Element | null {
	return parent.getElementsByTagNameNS(CAC_NS, tag)[0] ?? null;
}

function cacElements(parent: Element, tag: string): Element[] {
	return Array.from(parent.getElementsByTagNameNS(CAC_NS, tag));
}

function cbcNumber(parent: Element, tag: string): number {
	const n = Number.parseFloat(cbcText(parent, tag));
	return Number.isNaN(n) ? 0 : n;
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

function cbcDirectText(parent: Element, tag: string): string {
	const el = childElementsByTagNs(parent, CBC_NS, tag)[0];
	return el?.textContent?.trim() ?? "";
}

function cbcDirectNumber(parent: Element, tag: string): number | null {
	const value = cbcDirectText(parent, tag);
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? null : parsed;
}

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
		additionalStreet: cbcText(address, "AdditionalStreetName") || undefined,
		city: cbcText(address, "CityName"),
		postalZone: cbcText(address, "PostalZone"),
		countrySubentity: cbcText(address, "CountrySubentity") || undefined,
		countryCode: country ? cbcText(country, "IdentificationCode") : "",
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
	return cbcText(taxScheme, "ID") || undefined;
}

function parseContact(party: Element): import("./types.js").UblContact | undefined {
	const contact = cacElement(party, "Contact");
	if (!contact) return undefined;
	const name = cbcText(contact, "Name");
	const phone = cbcText(contact, "Telephone");
	const email = cbcText(contact, "ElectronicMail");
	if (!name && !phone && !email) return undefined;
	return {
		name: name || undefined,
		phone: phone || undefined,
		email: email || undefined,
	};
}

function parseParty(root: Element, role: string): UblParty {
	const wrapper = cacElement(root, role);
	const party = wrapper ? cacElement(wrapper, "Party") : null;
	if (!party) return { name: "Unknown" };

	const partyName = cacElement(party, "PartyName");
	const legalEntity = cacElement(party, "PartyLegalEntity");
	const taxScheme = cacElement(party, "PartyTaxScheme");
	const partyId = cacElement(party, "PartyIdentification");
	const endpointEl = party.getElementsByTagNameNS(CBC_NS, "EndpointID")[0];

	return {
		name: partyName ? cbcText(partyName, "Name") : "",
		registrationName: legalEntity
			? cbcText(legalEntity, "RegistrationName") || undefined
			: undefined,
		companyLegalForm: legalEntity
			? cbcText(legalEntity, "CompanyLegalForm") || undefined
			: undefined,
		vatId: taxScheme ? cbcText(taxScheme, "CompanyID") || undefined : undefined,
		taxSchemeId: parseTaxSchemeId(taxScheme),
		companyId: legalEntity
			? cbcText(legalEntity, "CompanyID") || undefined
			: partyId
				? cbcText(partyId, "ID") || undefined
				: undefined,
		endpointId: endpointEl?.textContent?.trim() || undefined,
		endpointSchemeId: endpointEl?.getAttribute("schemeID") || undefined,
		address: parseAddress(party),
		contact: parseContact(party),
	};
}

function parseTaxSubtotal(sub: Element): UblTaxSubtotal {
	const cat = cacElement(sub, "TaxCategory");
	return {
		taxableAmount: cbcNumber(sub, "TaxableAmount"),
		taxAmount: cbcNumber(sub, "TaxAmount"),
		taxPercent: cat ? cbcNumber(cat, "Percent") : 0,
		taxCategoryId: cat ? cbcText(cat, "ID") || undefined : undefined,
		taxSchemeId: parseTaxSchemeId(cat),
		taxExemptionReason: cat
			? cbcText(cat, "TaxExemptionReason") || undefined
			: undefined,
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
	const indicatorRaw = cbcDirectText(charge, "ChargeIndicator").toLowerCase();
	const chargeIndicator = indicatorRaw === "true" || indicatorRaw === "1";
	return {
		chargeIndicator,
		amount: cbcNumber(charge, "Amount"),
		baseAmount: cbcDirectNumber(charge, "BaseAmount") ?? undefined,
		multiplierFactorNumeric:
			cbcDirectNumber(charge, "MultiplierFactorNumeric") ?? undefined,
		reason: cbcText(charge, "AllowanceChargeReason") || undefined,
		reasonCode: cbcText(charge, "AllowanceChargeReasonCode") || undefined,
		taxPercent: taxCategory ? cbcNumber(taxCategory, "Percent") : undefined,
		taxCategoryId: taxCategory
			? cbcText(taxCategory, "ID") || undefined
			: undefined,
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
			(sum, subtotal) => sum + subtotal.taxAmount,
			0,
		);
		const taxAmountFromLineTotal = lineTaxTotal
			? cbcDirectNumber(lineTaxTotal, "TaxAmount")
			: null;
		const taxPercent =
			lineTaxSubtotals[0]?.taxPercent ??
			(taxCategory ? cbcNumber(taxCategory, "Percent") : undefined);
		const computedTaxAmount =
			taxPercent !== undefined
				? Number(((lineExtensionAmount * taxPercent) / 100).toFixed(2))
				: undefined;
		const allowanceCharges = parseAllowanceCharges(line);
		const discountAmount = allowanceCharges.reduce(
			(sum, charge) =>
				charge.chargeIndicator ? sum : sum + Math.abs(charge.amount),
			0,
		);
		const chargeAmount = allowanceCharges.reduce(
			(sum, charge) =>
				charge.chargeIndicator ? sum + Math.abs(charge.amount) : sum,
			0,
		);

		return {
			id: cbcText(line, "ID"),
			description: item ? cbcText(item, "Description") : "",
			quantity: cbcNumber(line, qtyTag),
			unitCode: qtyEl?.getAttribute("unitCode") ?? "",
			unitPrice: price ? cbcNumber(price, "PriceAmount") : 0,
			lineExtensionAmount,
			taxPercent,
			taxAmount:
				taxAmountFromLineTotal ??
				(lineTaxSubtotals.length > 0
					? taxAmountFromSubtotals
					: computedTaxAmount),
			taxCategoryId:
				lineTaxSubtotals[0]?.taxCategoryId ??
				(taxCategory ? cbcText(taxCategory, "ID") || undefined : undefined),
			taxSchemeId:
				lineTaxSubtotals[0]?.taxSchemeId ?? parseTaxSchemeId(taxCategory),
			taxSubtotals: lineTaxSubtotals.length > 0 ? lineTaxSubtotals : undefined,
			allowanceCharges:
				allowanceCharges.length > 0 ? allowanceCharges : undefined,
			discountAmount: discountAmount > 0 ? discountAmount : undefined,
			chargeAmount: chargeAmount > 0 ? chargeAmount : undefined,
			itemName: item ? cbcText(item, "Name") || undefined : undefined,
			sellersItemId: sellersId
				? cbcText(sellersId, "ID") || undefined
				: undefined,
			buyersItemId: buyersId ? cbcText(buyersId, "ID") || undefined : undefined,
		};
	});
}

function parseMonetaryTotal(root: Element): UblMonetaryTotal {
	const total = cacDirectElement(root, "LegalMonetaryTotal");
	if (!total) {
		return {
			lineExtensionAmount: 0,
			taxExclusiveAmount: 0,
			taxInclusiveAmount: 0,
			payableAmount: 0,
		};
	}
	return {
		lineExtensionAmount: cbcNumber(total, "LineExtensionAmount"),
		taxExclusiveAmount: cbcNumber(total, "TaxExclusiveAmount"),
		taxInclusiveAmount: cbcNumber(total, "TaxInclusiveAmount"),
		allowanceTotalAmount: cbcNumber(total, "AllowanceTotalAmount") || undefined,
		chargeTotalAmount: cbcNumber(total, "ChargeTotalAmount") || undefined,
		prepaidAmount: cbcNumber(total, "PrepaidAmount") || undefined,
		payableRoundingAmount: cbcNumber(total, "PayableRoundingAmount") || undefined,
		payableAmount: cbcNumber(total, "PayableAmount"),
	};
}

function parsePaymentMeansElement(pm: Element): UblPaymentMeans {
	const account = cacElement(pm, "PayeeFinancialAccount");
	const branch = account ? cacElement(account, "FinancialInstitutionBranch") : null;
	const paymentMeansCodeEl = pm.getElementsByTagNameNS(CBC_NS, "PaymentMeansCode")[0];

	return {
		code: cbcText(pm, "PaymentMeansCode"),
		codeName: paymentMeansCodeEl?.getAttribute("name") || undefined,
		paymentId: cbcText(pm, "PaymentID") || undefined,
		iban: account ? cbcText(account, "ID") || undefined : undefined,
		bic: branch ? cbcText(branch, "ID") || undefined : undefined,
		accountName: (account && cbcText(account, "Name")) || undefined,
	};
}

function parsePaymentMeansList(root: Element): UblPaymentMeans[] | undefined {
	const list = cacElements(root, "PaymentMeans").map(parsePaymentMeansElement);
	return list.length > 0 ? list : undefined;
}

function parseInvoicePeriod(root: Element): UblInvoicePeriod | undefined {
	const period = cacElement(root, "InvoicePeriod");
	if (!period) return undefined;

	const start = cbcText(period, "StartDate");
	const end = cbcText(period, "EndDate");
	if (!start && !end) return undefined;

	return {
		startDate: start || undefined,
		endDate: end || undefined,
		descriptionCode: cbcText(period, "DescriptionCode") || undefined,
	};
}

function parseDelivery(root: Element): UblDelivery | undefined {
	const delivery = cacElement(root, "Delivery");
	if (!delivery) return undefined;
	const actualDeliveryDate = cbcText(delivery, "ActualDeliveryDate") || undefined;
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
	const note = cbcText(paymentTerms, "Note");
	return note || undefined;
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

function parseAttachments(root: Element): UblAttachment[] | undefined {
	const refs = cacElements(root, "AdditionalDocumentReference");
	const attachments: UblAttachment[] = [];

	for (const ref of refs) {
		const attachment = cacElement(ref, "Attachment");
		if (!attachment) continue;

		const binaryEl = attachment.getElementsByTagNameNS(
			CBC_NS,
			"EmbeddedDocumentBinaryObject",
		)[0];
		if (!binaryEl) continue;

		const content = binaryEl.textContent?.trim();
		if (!content) continue;

		attachments.push({
			id: cbcText(ref, "ID"),
			filename: binaryEl.getAttribute("filename") || undefined,
			mimeCode: binaryEl.getAttribute("mimeCode") || undefined,
			description: cbcText(ref, "DocumentDescription") || undefined,
			base64Content: content,
		});
	}

	return attachments.length > 0 ? attachments : undefined;
}

// --- Main parser ---

export function parseUblInvoice(xml: string): UblInvoice | null {
	try {
		const BrowserDomParser = globalThis.DOMParser as
			| typeof XmlDomParser
			| undefined;
		const parser = BrowserDomParser ? new BrowserDomParser() : new XmlDomParser();
		const doc = parser.parseFromString(xml, "text/xml");
		if (doc.getElementsByTagName("parsererror").length > 0) return null;

		const root = doc.documentElement;
		const localName = root.localName;

		let documentType: "Invoice" | "CreditNote";
		if (localName === "Invoice") {
			documentType = "Invoice";
		} else if (localName === "CreditNote") {
			documentType = "CreditNote";
		} else {
			return null;
		}

		const isCreditNote = documentType === "CreditNote";
		const id = cbcText(root, "ID");
		if (!id) return null;
		const paymentMeansList = parsePaymentMeansList(root);
		const orderReference = cacElement(root, "OrderReference");
		const contractReference = cacElement(root, "ContractDocumentReference");
		const projectReference = cacElement(root, "ProjectReference");

		return {
			documentType,
			customizationId: cbcText(root, "CustomizationID") || undefined,
			profileId: cbcText(root, "ProfileID") || undefined,
			id,
			invoiceTypeCode: cbcText(root, "InvoiceTypeCode") || undefined,
			issueDate: cbcText(root, "IssueDate"),
			dueDate: cbcText(root, "DueDate") || undefined,
			taxPointDate: cbcText(root, "TaxPointDate") || undefined,
			currency: cbcText(root, "DocumentCurrencyCode"),
			buyerReference: cbcText(root, "BuyerReference") || undefined,
			orderReference: orderReference ? cbcText(orderReference, "ID") : undefined,
			salesOrderId: orderReference
				? cbcText(orderReference, "SalesOrderID") || undefined
				: undefined,
			contractReference: contractReference
				? cbcText(contractReference, "ID")
				: undefined,
			projectReference: projectReference
				? cbcText(projectReference, "ID")
				: undefined,
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
			attachments: parseAttachments(root),
			allowanceCharges: parseAllowanceCharges(root),
		};
	} catch {
		return null;
	}
}
