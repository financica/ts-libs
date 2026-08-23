import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
	AdditionalReference,
	AllowanceCharge,
	BankAccount,
	BillingPeriod,
	DocumentAllowanceCharge,
	DocumentReference,
	FacturXInvoice,
	InvoiceLine,
	Note,
	PaymentMeans,
	PostalAddress,
	Price,
	SchemedId,
	Tax,
	TaxBreakdownEntry,
	TradeContact,
	TradeParty,
} from "../model.js";
import { type FacturXProfile, detectProfile } from "../profiles.js";
import { parseDecimal } from "../numeric.js";

/**
 * Tolerant CII (Cross Industry Invoice) reader for Factur-X / ZUGFeRD 2.x /
 * XRechnung documents. It maps whatever the document carries onto the
 * `FacturXInvoice` model without enforcing a profile schema, so any EN 16931
 * CIUS (including XRechnung, which stricter libraries reject) parses.
 *
 * The XML parser decodes numeric character references (`&#233;` → `é`) as
 * required by XML 1.0 §4.1, and matches elements by local name so unusual
 * namespace prefixes don't matter.
 */

export class FacturXParseError extends Error {
	override readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = "FacturXParseError";
		if (options && "cause" in options) this.cause = options.cause;
	}
}

/** A mandatory value: throws `FacturXParseError` naming the business term when absent. */
const required = <T>(value: T | undefined, what: string): T => {
	if (value === undefined) throw new FacturXParseError(`Missing ${what}.`);
	return value;
};

export interface FacturXParseResult {
	invoice: FacturXInvoice;
	/** Classified profile, when the guideline URN (BT-24) is recognized. */
	profile?: FacturXProfile;
	/** Non-fatal oddities found while reading the document. */
	warnings: string[];
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): Node[] => {
	if (Array.isArray(value)) return value.filter(isNode);
	return isNode(value) ? [value] : [];
};

const child = (node: Node | undefined, name: string): Node | undefined => {
	const value = node?.[name];
	if (Array.isArray(value)) return isNode(value[0]) ? value[0] : undefined;
	return isNode(value) ? value : undefined;
};

const text = (node: Node | undefined, name?: string): string | undefined => {
	const target = name === undefined ? node : child(node, name);
	const value = target?.["#text"];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
};

const attr = (node: Node | undefined, name: string): string | undefined => {
	const value = node?.[`@${name}`];
	return typeof value === "string" && value ? value : undefined;
};

const decimal = (node: Node | undefined, name: string): number | undefined =>
	parseDecimal(text(node, name));

const schemedId = (node: Node | undefined): SchemedId | undefined => {
	const id = text(node);
	if (id === undefined) return undefined;
	const schemeId = attr(node, "schemeID");
	return { id, ...(schemeId !== undefined ? { schemeId } : {}) };
};

/** CII date node (udt/qdt DateTimeString or DateString) → ISO YYYY-MM-DD. */
const isoDate = (node: Node | undefined): string | undefined => {
	if (!node) return undefined;
	const raw = text(node, "DateTimeString") ?? text(node, "DateString") ?? text(node);
	if (!raw) return undefined;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 8) {
		return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
	}
	return undefined;
};

const readNotes = (node: Node | undefined, name: string): Note[] =>
	asArray(node?.[name]).flatMap((entry) => {
		const content = text(entry, "Content");
		if (content === undefined) return [];
		const subjectCode = text(entry, "SubjectCode");
		return [{ content, ...(subjectCode !== undefined ? { subjectCode } : {}) }];
	});

const readAddress = (node: Node | undefined): PostalAddress | undefined => {
	if (!node) return undefined;
	const address: PostalAddress = {};
	const line1 = text(node, "LineOne");
	const line2 = text(node, "LineTwo");
	const line3 = text(node, "LineThree");
	const postcode = text(node, "PostcodeCode");
	const city = text(node, "CityName");
	const country = text(node, "CountryID");
	const countrySubdivision = text(node, "CountrySubDivisionName");
	if (line1 !== undefined) address.line1 = line1;
	if (line2 !== undefined) address.line2 = line2;
	if (line3 !== undefined) address.line3 = line3;
	if (postcode !== undefined) address.postcode = postcode;
	if (city !== undefined) address.city = city;
	if (country !== undefined) address.country = country;
	if (countrySubdivision !== undefined)
		address.countrySubdivision = countrySubdivision;
	return Object.keys(address).length > 0 ? address : undefined;
};

const readContact = (node: Node | undefined): TradeContact | undefined => {
	if (!node) return undefined;
	const contact: TradeContact = {};
	const name = text(node, "PersonName");
	const department = text(node, "DepartmentName");
	const phone = text(
		child(node, "TelephoneUniversalCommunication"),
		"CompleteNumber",
	);
	const email = text(child(node, "EmailURIUniversalCommunication"), "URIID");
	if (name !== undefined) contact.name = name;
	if (department !== undefined) contact.department = department;
	if (phone !== undefined) contact.phone = phone;
	if (email !== undefined) contact.email = email;
	return Object.keys(contact).length > 0 ? contact : undefined;
};

const readParty = (node: Node | undefined): TradeParty | undefined => {
	if (!node) return undefined;
	const party: TradeParty = {};
	const ids = asArray(node["ID"])
		.map((entry) => text(entry))
		.filter((value): value is string => value !== undefined);
	if (ids.length > 0) party.ids = ids;
	const globalIds = asArray(node["GlobalID"])
		.map(schemedId)
		.filter((value): value is SchemedId => value !== undefined);
	if (globalIds.length > 0) party.globalIds = globalIds;
	const name = text(node, "Name");
	if (name !== undefined) party.name = name;
	const description = text(node, "Description");
	if (description !== undefined) party.description = description;
	const legal = child(node, "SpecifiedLegalOrganization");
	if (legal) {
		const id = schemedId(child(legal, "ID"));
		const tradingName = text(legal, "TradingBusinessName");
		if (id || tradingName !== undefined) {
			party.legalOrganization = {
				...(id ? { id } : {}),
				...(tradingName !== undefined ? { tradingName } : {}),
			};
		}
	}
	const contact = readContact(child(node, "DefinedTradeContact"));
	if (contact) party.contact = contact;
	const address = readAddress(child(node, "PostalTradeAddress"));
	if (address) party.address = address;
	const electronicAddress = schemedId(
		child(child(node, "URIUniversalCommunication"), "URIID"),
	);
	if (electronicAddress) party.electronicAddress = electronicAddress;
	for (const registration of asArray(node["SpecifiedTaxRegistration"])) {
		const idNode = child(registration, "ID");
		const id = text(idNode);
		if (id === undefined) continue;
		const scheme = attr(idNode, "schemeID");
		if (scheme === "FC") {
			party.taxId ??= id;
		} else if (scheme === "VA" || party.vatId === undefined) {
			party.vatId ??= id;
		} else {
			party.taxId ??= id;
		}
	}
	return Object.keys(party).length > 0 ? party : undefined;
};

const readTax = (node: Node | undefined): Tax | undefined => {
	if (!node) return undefined;
	const categoryCode = text(node, "CategoryCode");
	if (categoryCode === undefined) return undefined;
	const typeCode = text(node, "TypeCode");
	const rate = decimal(node, "RateApplicablePercent");
	return {
		categoryCode,
		...(rate !== undefined ? { rateApplicablePercent: rate } : {}),
		...(typeCode !== undefined ? { typeCode } : {}),
	};
};

const readAllowanceCharge = (node: Node): AllowanceCharge | undefined => {
	const actualAmount = decimal(node, "ActualAmount");
	if (actualAmount === undefined) return undefined;
	const basisAmount = decimal(node, "BasisAmount");
	const calculationPercent = decimal(node, "CalculationPercent");
	const reason = text(node, "Reason");
	const reasonCode = text(node, "ReasonCode");
	return {
		actualAmount,
		...(basisAmount !== undefined ? { basisAmount } : {}),
		...(calculationPercent !== undefined ? { calculationPercent } : {}),
		...(reason !== undefined ? { reason } : {}),
		...(reasonCode !== undefined ? { reasonCode } : {}),
	};
};

const isChargeIndicator = (node: Node): boolean =>
	(text(child(node, "ChargeIndicator"), "Indicator") ?? "false").toLowerCase() ===
	"true";

const readPrice = (node: Node | undefined): Price | undefined => {
	if (!node) return undefined;
	const amount = decimal(node, "ChargeAmount");
	if (amount === undefined) return undefined;
	const basisNode = child(node, "BasisQuantity");
	const basisQuantity = parseDecimal(text(basisNode));
	const basisQuantityUnit = attr(basisNode, "unitCode");
	return {
		amount,
		...(basisQuantity !== undefined ? { basisQuantity } : {}),
		...(basisQuantityUnit !== undefined ? { basisQuantityUnit } : {}),
	};
};

const readBillingPeriod = (node: Node | undefined): BillingPeriod | undefined => {
	if (!node) return undefined;
	const start = isoDate(child(node, "StartDateTime"));
	const end = isoDate(child(node, "EndDateTime"));
	if (start === undefined && end === undefined) return undefined;
	return {
		...(start !== undefined ? { start } : {}),
		...(end !== undefined ? { end } : {}),
	};
};

const readLine = (node: Node, index: number, warnings: string[]): InvoiceLine => {
	const lineDocument = child(node, "AssociatedDocumentLineDocument");
	const id = required(
		text(lineDocument, "LineID"),
		`line identifier (BT-126) on line ${index + 1}`,
	);
	const note = text(child(lineDocument ?? {}, "IncludedNote"), "Content");

	const product = child(node, "SpecifiedTradeProduct");
	const productName = text(product, "Name");
	const productDescription = text(product, "Description");
	const sellerAssignedId = text(product, "SellerAssignedID");
	const buyerAssignedId = text(product, "BuyerAssignedID");
	const productGlobalId = schemedId(child(product, "GlobalID"));
	const originCountry = text(child(product, "OriginTradeCountry"), "ID");
	const attributes = asArray(product?.["ApplicableProductCharacteristic"]).flatMap(
		(entry) => {
			const attributeName = text(entry, "Description");
			const value = text(entry, "Value");
			return attributeName !== undefined && value !== undefined
				? [{ name: attributeName, value }]
				: [];
		},
	);

	const agreement = child(node, "SpecifiedLineTradeAgreement");
	const grossPriceNode = child(agreement, "GrossPriceProductTradePrice");
	const grossPrice = readPrice(grossPriceNode);
	const grossAllowances = asArray(grossPriceNode?.["AppliedTradeAllowanceCharge"])
		.map(readAllowanceCharge)
		.filter((value): value is AllowanceCharge => value !== undefined);
	const netPrice = readPrice(child(agreement, "NetPriceProductTradePrice"));
	const buyerOrderLineReference = text(
		child(agreement, "BuyerOrderReferencedDocument"),
		"LineID",
	);

	const quantityNode = child(
		child(node, "SpecifiedLineTradeDelivery"),
		"BilledQuantity",
	);
	const quantity = parseDecimal(text(quantityNode));
	const unitCode = attr(quantityNode, "unitCode");
	if (quantity === undefined) {
		warnings.push(`Line ${id}: missing or invalid billed quantity (BT-129).`);
	}

	const settlement = child(node, "SpecifiedLineTradeSettlement");
	const tax = readTax(child(settlement, "ApplicableTradeTax"));
	const allowanceCharges = asArray(settlement?.["SpecifiedTradeAllowanceCharge"]);
	const allowances = allowanceCharges
		.filter((entry) => !isChargeIndicator(entry))
		.map(readAllowanceCharge)
		.filter((value): value is AllowanceCharge => value !== undefined);
	const charges = allowanceCharges
		.filter(isChargeIndicator)
		.map(readAllowanceCharge)
		.filter((value): value is AllowanceCharge => value !== undefined);
	const netTotal = decimal(
		child(settlement, "SpecifiedTradeSettlementLineMonetarySummation"),
		"LineTotalAmount",
	);
	const billingPeriod = readBillingPeriod(
		child(settlement, "BillingSpecifiedPeriod"),
	);
	const buyerAccountingReference = text(
		child(settlement, "ReceivableSpecifiedTradeAccountingAccount"),
		"ID",
	);

	return {
		id,
		...(note !== undefined ? { note } : {}),
		product: {
			name: required(productName, `item name (BT-153) on line ${id}`),
			...(productDescription !== undefined
				? { description: productDescription }
				: {}),
			...(sellerAssignedId !== undefined ? { sellerAssignedId } : {}),
			...(buyerAssignedId !== undefined ? { buyerAssignedId } : {}),
			...(productGlobalId ? { globalId: productGlobalId } : {}),
			...(attributes.length > 0 ? { attributes } : {}),
			...(originCountry !== undefined ? { originCountry } : {}),
		},
		...(grossPrice
			? {
					grossPrice: {
						...grossPrice,
						...(grossAllowances.length > 0
							? { allowances: grossAllowances }
							: {}),
					},
				}
			: {}),
		...(netPrice ? { netPrice } : {}),
		quantity: required(quantity, `invoiced quantity (BT-129) on line ${id}`),
		unitCode: required(unitCode, `invoiced quantity unit (BT-130) on line ${id}`),
		...(buyerOrderLineReference !== undefined ? { buyerOrderLineReference } : {}),
		tax: required(tax, `line VAT category (BT-151) on line ${id}`),
		...(billingPeriod ? { billingPeriod } : {}),
		...(allowances.length > 0 ? { allowances } : {}),
		...(charges.length > 0 ? { charges } : {}),
		...(buyerAccountingReference !== undefined ? { buyerAccountingReference } : {}),
		...(netTotal !== undefined ? { netTotal } : {}),
	};
};

const readPaymentMeans = (node: Node): PaymentMeans | undefined => {
	const typeCode = text(node, "TypeCode");
	if (typeCode === undefined) return undefined;
	const information = text(node, "Information");
	const cardNode = child(node, "ApplicableTradeSettlementFinancialCard");
	const cardId = text(cardNode, "ID");
	const cardHolder = text(cardNode, "CardholderName");
	const payerIban = text(child(node, "PayerPartyDebtorFinancialAccount"), "IBANID");
	const accountNode = child(node, "PayeePartyCreditorFinancialAccount");
	const bic = text(
		child(node, "PayeeSpecifiedCreditorFinancialInstitution"),
		"BICID",
	);
	const payeeAccount: BankAccount = {};
	const iban = text(accountNode, "IBANID");
	const accountName = text(accountNode, "AccountName");
	const proprietaryId = text(accountNode, "ProprietaryID");
	if (iban !== undefined) payeeAccount.iban = iban;
	if (accountName !== undefined) payeeAccount.accountName = accountName;
	if (proprietaryId !== undefined) payeeAccount.proprietaryId = proprietaryId;
	if (bic !== undefined) payeeAccount.bic = bic;
	return {
		typeCode,
		...(information !== undefined ? { information } : {}),
		...(cardId !== undefined
			? {
					card: {
						id: cardId,
						...(cardHolder !== undefined ? { holderName: cardHolder } : {}),
					},
				}
			: {}),
		...(payerIban !== undefined ? { payerIban } : {}),
		...(Object.keys(payeeAccount).length > 0 ? { payeeAccount } : {}),
	};
};

const readTaxBreakdown = (node: Node): TaxBreakdownEntry | undefined => {
	const categoryCode = text(node, "CategoryCode");
	if (categoryCode === undefined) return undefined;
	const calculatedAmount = decimal(node, "CalculatedAmount");
	const basisAmount = decimal(node, "BasisAmount");
	const rate = decimal(node, "RateApplicablePercent");
	const typeCode = text(node, "TypeCode");
	const exemptionReason = text(node, "ExemptionReason");
	const exemptionReasonCode = text(node, "ExemptionReasonCode");
	const taxPointDate = isoDate(child(node, "TaxPointDate"));
	const dueDateTypeCode = text(node, "DueDateTypeCode");
	return {
		calculatedAmount: required(
			calculatedAmount,
			`VAT category tax amount (BT-117) for category ${categoryCode}`,
		),
		...(typeCode !== undefined ? { typeCode } : {}),
		...(exemptionReason !== undefined ? { exemptionReason } : {}),
		...(exemptionReasonCode !== undefined ? { exemptionReasonCode } : {}),
		basisAmount: required(
			basisAmount,
			`VAT category taxable amount (BT-116) for category ${categoryCode}`,
		),
		categoryCode,
		...(rate !== undefined ? { rateApplicablePercent: rate } : {}),
		...(taxPointDate !== undefined ? { taxPointDate } : {}),
		...(dueDateTypeCode !== undefined ? { dueDateTypeCode } : {}),
	};
};

const readAdditionalReference = (node: Node): AdditionalReference | undefined => {
	const id = text(node, "IssuerAssignedID");
	if (id === undefined) return undefined;
	const typeCode = text(node, "TypeCode");
	const name = text(node, "Name");
	const uri = text(node, "URIID");
	const attachmentNode = child(node, "AttachmentBinaryObject");
	const base64 = text(attachmentNode);
	const mimeType = attr(attachmentNode, "mimeCode");
	const filename = attr(attachmentNode, "filename");
	return {
		id,
		...(typeCode !== undefined ? { typeCode } : {}),
		...(name !== undefined ? { name } : {}),
		...(uri !== undefined ? { uri } : {}),
		...(base64 !== undefined && mimeType !== undefined
			? {
					attachment: {
						base64,
						mimeType,
						...(filename !== undefined ? { filename } : {}),
					},
				}
			: {}),
	};
};

/**
 * Parse Factur-X / ZUGFeRD / XRechnung CII XML into a `FacturXInvoice`.
 *
 * Returns `null` when the document is not a CII invoice (no
 * `CrossIndustryInvoice` root). Throws `FacturXParseError` when it is one but
 * the XML is malformed or a mandatory business term (BT-1 invoice number,
 * BT-2 issue date, BT-3 type code, BT-5 currency, seller, buyer, line and
 * VAT-breakdown essentials) is missing. Non-fatal oddities are reported in
 * `warnings`.
 */
export const parseFacturXXml = (xml: string): FacturXParseResult | null => {
	const validation = XMLValidator.validate(xml);
	if (validation !== true) {
		throw new FacturXParseError(`Invalid XML: ${validation.err.msg}`, {
			cause: validation.err,
		});
	}
	let root: unknown;
	try {
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@",
			parseTagValue: false,
			alwaysCreateTextNode: true,
			removeNSPrefix: true,
			// Numeric character references (&#233;) are core XML 1.0, but
			// fast-xml-parser only decodes them with htmlEntities enabled.
			htmlEntities: true,
			processEntities: true,
		});
		root = parser.parse(xml) as unknown;
	} catch (cause) {
		throw new FacturXParseError(
			`Invalid XML: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
	}
	if (!isNode(root)) return null;
	const cii = child(root, "CrossIndustryInvoice");
	if (!cii) return null;

	const warnings: string[] = [];
	const context = child(cii, "ExchangedDocumentContext");
	const profileUrn = text(
		child(context, "GuidelineSpecifiedDocumentContextParameter"),
		"ID",
	);
	const businessProcessType = text(
		child(context, "BusinessProcessSpecifiedDocumentContextParameter"),
		"ID",
	);

	const document = child(cii, "ExchangedDocument");
	const id = required(text(document, "ID"), "invoice number (BT-1)");
	const typeCode = required(text(document, "TypeCode"), "invoice type code (BT-3)");
	const issueDate = required(
		isoDate(child(document, "IssueDateTime")),
		"or invalid issue date (BT-2)",
	);
	const notes = readNotes(document ?? {}, "IncludedNote");

	const transaction = child(cii, "SupplyChainTradeTransaction");
	const agreement = child(transaction, "ApplicableHeaderTradeAgreement");
	const delivery = child(transaction, "ApplicableHeaderTradeDelivery");
	const settlement = child(transaction, "ApplicableHeaderTradeSettlement");

	const currency = required(
		text(settlement, "InvoiceCurrencyCode"),
		"invoice currency (BT-5)",
	);
	const taxCurrency = text(settlement, "TaxCurrencyCode");

	const seller = required(
		readParty(child(agreement, "SellerTradeParty")),
		"seller (BG-4)",
	);
	const buyer = required(
		readParty(child(agreement, "BuyerTradeParty")),
		"buyer (BG-7)",
	);
	const payee = readParty(child(settlement, "PayeeTradeParty"));
	const sellerTaxRepresentative = readParty(
		child(agreement, "SellerTaxRepresentativeTradeParty"),
	);
	const deliverTo = readParty(child(delivery, "ShipToTradeParty"));
	if (seller.name === undefined) warnings.push("Missing seller name (BT-27).");

	const buyerReference = text(agreement, "BuyerReference");
	const purchaseOrderReference = text(
		child(agreement, "BuyerOrderReferencedDocument"),
		"IssuerAssignedID",
	);
	const salesOrderReference = text(
		child(agreement, "SellerOrderReferencedDocument"),
		"IssuerAssignedID",
	);
	const contractReference = text(
		child(agreement, "ContractReferencedDocument"),
		"IssuerAssignedID",
	);
	const additionalReferences = asArray(agreement?.["AdditionalReferencedDocument"])
		.map(readAdditionalReference)
		.filter((value): value is AdditionalReference => value !== undefined);
	const projectNode = child(agreement, "SpecifiedProcuringProject");
	const projectId = text(projectNode, "ID");
	const projectName = text(projectNode, "Name");

	const deliveryDate = isoDate(
		child(child(delivery, "ActualDeliverySupplyChainEvent"), "OccurrenceDateTime"),
	);
	const despatchAdviceReference = text(
		child(delivery, "DespatchAdviceReferencedDocument"),
		"IssuerAssignedID",
	);
	const receivingAdviceReference = text(
		child(delivery, "ReceivingAdviceReferencedDocument"),
		"IssuerAssignedID",
	);

	const lines = asArray(transaction?.["IncludedSupplyChainTradeLineItem"]).map(
		(node, index) => readLine(node, index, warnings),
	);

	const paymentMeans = asArray(settlement?.["SpecifiedTradeSettlementPaymentMeans"])
		.map(readPaymentMeans)
		.filter((value): value is PaymentMeans => value !== undefined);
	const taxBreakdown = asArray(settlement?.["ApplicableTradeTax"])
		.map(readTaxBreakdown)
		.filter((value): value is TaxBreakdownEntry => value !== undefined);
	const headerAllowanceCharges = asArray(
		settlement?.["SpecifiedTradeAllowanceCharge"],
	);
	const toDocumentAllowanceCharge = (
		node: Node,
	): DocumentAllowanceCharge | undefined => {
		const entry = readAllowanceCharge(node);
		if (!entry) return undefined;
		const tax = readTax(child(node, "CategoryTradeTax"));
		return {
			...entry,
			tax: required(
				tax,
				"document level allowance/charge VAT category (BT-95/BT-102)",
			),
		};
	};
	const allowances = headerAllowanceCharges
		.filter((node) => !isChargeIndicator(node))
		.map(toDocumentAllowanceCharge)
		.filter((value): value is DocumentAllowanceCharge => value !== undefined);
	const charges = headerAllowanceCharges
		.filter(isChargeIndicator)
		.map(toDocumentAllowanceCharge)
		.filter((value): value is DocumentAllowanceCharge => value !== undefined);

	const billingPeriod = readBillingPeriod(
		child(settlement, "BillingSpecifiedPeriod"),
	);
	const termsNode = child(settlement, "SpecifiedTradePaymentTerms");
	const paymentTermsDescription = text(termsNode, "Description");
	const dueDate = isoDate(child(termsNode ?? {}, "DueDateDateTime"));
	const directDebitMandateId = text(termsNode, "DirectDebitMandateID");
	const creditorReference = text(settlement, "CreditorReferenceID");
	const paymentReference = text(settlement, "PaymentReference");
	const buyerAccountingReference = text(
		child(settlement, "ReceivableSpecifiedTradeAccountingAccount"),
		"ID",
	);

	const summation = child(
		settlement,
		"SpecifiedTradeSettlementHeaderMonetarySummation",
	);
	const taxTotalNodes = asArray(summation?.["TaxTotalAmount"]);
	let taxTotal: number | undefined;
	let taxTotalInTaxCurrency: number | undefined;
	for (const node of taxTotalNodes) {
		const amount = parseDecimal(text(node));
		if (amount === undefined) continue;
		const nodeCurrency = attr(node, "currencyID");
		if (
			taxCurrency !== undefined &&
			nodeCurrency === taxCurrency &&
			nodeCurrency !== currency
		) {
			taxTotalInTaxCurrency = amount;
		} else if (taxTotal === undefined) {
			taxTotal = amount;
		}
	}
	const lineTotal = decimal(summation, "LineTotalAmount");
	const chargeTotal = decimal(summation, "ChargeTotalAmount");
	const allowanceTotal = decimal(summation, "AllowanceTotalAmount");
	const taxBasisTotal = decimal(summation, "TaxBasisTotalAmount");
	const roundingAmount = decimal(summation, "RoundingAmount");
	const grandTotal = decimal(summation, "GrandTotalAmount");
	const prepaidAmount = decimal(summation, "TotalPrepaidAmount");
	const duePayable = decimal(summation, "DuePayableAmount");

	const precedingInvoices = asArray(
		settlement?.["InvoiceReferencedDocument"],
	).flatMap((node): DocumentReference[] => {
		const referenceId = text(node, "IssuerAssignedID");
		if (referenceId === undefined) return [];
		const referenceDate = isoDate(child(node, "FormattedIssueDateTime"));
		return [
			{
				id: referenceId,
				...(referenceDate !== undefined ? { issueDate: referenceDate } : {}),
			},
		];
	});

	const invoice: FacturXInvoice = {
		...(profileUrn !== undefined ? { profile: profileUrn } : {}),
		...(businessProcessType !== undefined ? { businessProcessType } : {}),
		id,
		typeCode,
		issueDate,
		currency,
		...(taxCurrency !== undefined ? { taxCurrency } : {}),
		...(notes.length > 0 ? { notes } : {}),
		seller,
		buyer,
		...(payee ? { payee } : {}),
		...(sellerTaxRepresentative ? { sellerTaxRepresentative } : {}),
		...(buyerReference !== undefined ? { buyerReference } : {}),
		...(purchaseOrderReference !== undefined ? { purchaseOrderReference } : {}),
		...(salesOrderReference !== undefined ? { salesOrderReference } : {}),
		...(contractReference !== undefined ? { contractReference } : {}),
		...(despatchAdviceReference !== undefined ? { despatchAdviceReference } : {}),
		...(receivingAdviceReference !== undefined ? { receivingAdviceReference } : {}),
		...(projectId !== undefined
			? {
					projectReference: {
						id: projectId,
						...(projectName !== undefined ? { name: projectName } : {}),
					},
				}
			: {}),
		...(additionalReferences.length > 0 ? { additionalReferences } : {}),
		...(precedingInvoices.length > 0 ? { precedingInvoices } : {}),
		...(deliverTo ? { deliverTo } : {}),
		...(deliveryDate !== undefined ? { deliveryDate } : {}),
		...(billingPeriod ? { billingPeriod } : {}),
		...(creditorReference !== undefined ? { creditorReference } : {}),
		...(paymentReference !== undefined ? { paymentReference } : {}),
		...(paymentMeans.length > 0 ? { paymentMeans } : {}),
		...(paymentTermsDescription !== undefined ||
		dueDate !== undefined ||
		directDebitMandateId !== undefined
			? {
					paymentTerms: {
						...(paymentTermsDescription !== undefined
							? { description: paymentTermsDescription }
							: {}),
						...(dueDate !== undefined ? { dueDate } : {}),
						...(directDebitMandateId !== undefined
							? { directDebitMandateId }
							: {}),
					},
				}
			: {}),
		...(buyerAccountingReference !== undefined ? { buyerAccountingReference } : {}),
		...(lines.length > 0 ? { lines } : {}),
		...(allowances.length > 0 ? { allowances } : {}),
		...(charges.length > 0 ? { charges } : {}),
		...(taxBreakdown.length > 0 ? { taxBreakdown } : {}),
		totals: {
			...(lineTotal !== undefined ? { lineTotal } : {}),
			...(chargeTotal !== undefined ? { chargeTotal } : {}),
			...(allowanceTotal !== undefined ? { allowanceTotal } : {}),
			...(taxBasisTotal !== undefined ? { taxBasisTotal } : {}),
			...(taxTotal !== undefined ? { taxTotal } : {}),
			...(taxTotalInTaxCurrency !== undefined ? { taxTotalInTaxCurrency } : {}),
			...(roundingAmount !== undefined ? { roundingAmount } : {}),
			...(grandTotal !== undefined ? { grandTotal } : {}),
			...(prepaidAmount !== undefined ? { prepaidAmount } : {}),
			...(duePayable !== undefined ? { duePayable } : {}),
		},
	};

	const profile = detectProfile(profileUrn);
	if (profileUrn === undefined) {
		warnings.push("Missing guideline identifier (BT-24).");
	} else if (profile === undefined) {
		warnings.push(`Unrecognized guideline "${profileUrn}".`);
	}

	return { invoice, ...(profile !== undefined ? { profile } : {}), warnings };
};
