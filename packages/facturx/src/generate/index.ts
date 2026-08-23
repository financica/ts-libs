import type {
	AdditionalReference,
	AllowanceCharge,
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
	TradeParty,
} from "../model.js";
import { PROFILE_URNS, detectProfile, profileHasLines } from "../profiles.js";
import { formatAmount, formatDecimal } from "../numeric.js";
import { escapeXmlAttribute, escapeXmlText } from "../xml-escape.js";

/**
 * Serialize a `FacturXInvoice` to CII (UN/CEFACT Cross Industry Invoice) XML,
 * the syntax embedded in Factur-X / ZUGFeRD hybrid PDFs. Element order
 * follows the CII D16B schema so the output validates against the official
 * Factur-X schematrons.
 */

export class FacturXBuildError extends Error {
	readonly errors: string[];

	constructor(errors: string[]) {
		super(`The invoice cannot be serialized to Factur-X XML: ${errors.join(" ")}`);
		this.name = "FacturXBuildError";
		this.errors = errors;
	}
}

type XmlNode = string | XmlTree | XmlNode[];
interface XmlTree {
	[key: string]: XmlNode | undefined;
}

/**
 * Minimal XML serializer for the ordered trees this module builds. Object
 * key order is emit order; `@name` keys become attributes and `#text` the
 * element text. Arrays repeat the element.
 */
const serializeElement = (name: string, node: XmlNode, indent: string): string => {
	if (typeof node === "string") {
		return `${indent}<${name}>${escapeXmlText(node)}</${name}>\n`;
	}
	if (Array.isArray(node)) {
		return node.map((entry) => serializeElement(name, entry, indent)).join("");
	}
	let attributes = "";
	let textContent: string | undefined;
	const children: [string, XmlNode][] = [];
	for (const [key, value] of Object.entries(node)) {
		if (value === undefined) continue;
		if (key.startsWith("@") && typeof value === "string") {
			attributes += ` ${key.slice(1)}="${escapeXmlAttribute(value)}"`;
		} else if (key === "#text" && typeof value === "string") {
			textContent = value;
		} else {
			children.push([key, value]);
		}
	}
	if (textContent !== undefined) {
		return `${indent}<${name}${attributes}>${escapeXmlText(textContent)}</${name}>\n`;
	}
	if (children.length === 0) {
		return `${indent}<${name}${attributes}/>\n`;
	}
	const body = children
		.map(([childName, child]) => serializeElement(childName, child, `${indent}\t`))
		.join("");
	return `${indent}<${name}${attributes}>\n${body}${indent}</${name}>\n`;
};

/** "YYYY-MM-DD" → CII format-102 "YYYYMMDD". */
const toFormat102 = (isoDate: string): string => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
	if (!match) {
		throw new FacturXBuildError([`Invalid ISO date "${isoDate}".`]);
	}
	return `${match[1]}${match[2]}${match[3]}`;
};

const dateTimeNode = (isoDate: string): XmlTree => ({
	"udt:DateTimeString": { "#text": toFormat102(isoDate), "@format": "102" },
});

const formattedDateTimeNode = (isoDate: string): XmlTree => ({
	"qdt:DateTimeString": { "#text": toFormat102(isoDate), "@format": "102" },
});

const schemedIdNode = (value: SchemedId): XmlTree => ({
	"#text": value.id,
	...(value.schemeId !== undefined ? { "@schemeID": value.schemeId } : {}),
});

const noteNode = (note: Note): XmlTree => ({
	"ram:Content": note.content,
	...(note.subjectCode !== undefined ? { "ram:SubjectCode": note.subjectCode } : {}),
});

const addressNode = (address: PostalAddress): XmlTree => ({
	...(address.postcode !== undefined ? { "ram:PostcodeCode": address.postcode } : {}),
	...(address.line1 !== undefined ? { "ram:LineOne": address.line1 } : {}),
	...(address.line2 !== undefined ? { "ram:LineTwo": address.line2 } : {}),
	...(address.line3 !== undefined ? { "ram:LineThree": address.line3 } : {}),
	...(address.city !== undefined ? { "ram:CityName": address.city } : {}),
	...(address.country !== undefined ? { "ram:CountryID": address.country } : {}),
	...(address.countrySubdivision !== undefined
		? { "ram:CountrySubDivisionName": address.countrySubdivision }
		: {}),
});

const partyNode = (party: TradeParty): XmlTree => {
	const taxRegistrations: XmlTree[] = [];
	if (party.vatId) {
		taxRegistrations.push({
			"ram:ID": { "#text": party.vatId, "@schemeID": "VA" },
		});
	}
	if (party.taxId) {
		taxRegistrations.push({
			"ram:ID": { "#text": party.taxId, "@schemeID": "FC" },
		});
	}
	return {
		...(party.ids?.length ? { "ram:ID": party.ids } : {}),
		...(party.globalIds?.length
			? { "ram:GlobalID": party.globalIds.map(schemedIdNode) }
			: {}),
		...(party.name !== undefined ? { "ram:Name": party.name } : {}),
		...(party.description !== undefined
			? { "ram:Description": party.description }
			: {}),
		...(party.legalOrganization
			? {
					"ram:SpecifiedLegalOrganization": {
						...(party.legalOrganization.id
							? { "ram:ID": schemedIdNode(party.legalOrganization.id) }
							: {}),
						...(party.legalOrganization.tradingName !== undefined
							? {
									"ram:TradingBusinessName":
										party.legalOrganization.tradingName,
								}
							: {}),
					},
				}
			: {}),
		...(party.contact
			? {
					"ram:DefinedTradeContact": {
						...(party.contact.name !== undefined
							? { "ram:PersonName": party.contact.name }
							: {}),
						...(party.contact.department !== undefined
							? { "ram:DepartmentName": party.contact.department }
							: {}),
						...(party.contact.phone !== undefined
							? {
									"ram:TelephoneUniversalCommunication": {
										"ram:CompleteNumber": party.contact.phone,
									},
								}
							: {}),
						...(party.contact.email !== undefined
							? {
									"ram:EmailURIUniversalCommunication": {
										"ram:URIID": party.contact.email,
									},
								}
							: {}),
					},
				}
			: {}),
		...(party.address
			? { "ram:PostalTradeAddress": addressNode(party.address) }
			: {}),
		...(party.electronicAddress
			? {
					"ram:URIUniversalCommunication": {
						"ram:URIID": schemedIdNode(party.electronicAddress),
					},
				}
			: {}),
		...(taxRegistrations.length
			? { "ram:SpecifiedTaxRegistration": taxRegistrations }
			: {}),
	};
};

const categoryTradeTaxNode = (tax: Tax): XmlTree => ({
	"ram:TypeCode": tax.typeCode ?? "VAT",
	"ram:CategoryCode": tax.categoryCode,
	...(tax.rateApplicablePercent !== undefined
		? { "ram:RateApplicablePercent": formatDecimal(tax.rateApplicablePercent) }
		: {}),
});

const allowanceChargeNode = (
	entry: AllowanceCharge,
	isCharge: boolean,
	tax?: Tax,
): XmlTree => ({
	"ram:ChargeIndicator": { "udt:Indicator": isCharge ? "true" : "false" },
	...(entry.calculationPercent !== undefined
		? { "ram:CalculationPercent": formatDecimal(entry.calculationPercent) }
		: {}),
	...(entry.basisAmount !== undefined
		? { "ram:BasisAmount": formatAmount(entry.basisAmount) }
		: {}),
	"ram:ActualAmount": formatAmount(entry.actualAmount),
	...(entry.reasonCode !== undefined ? { "ram:ReasonCode": entry.reasonCode } : {}),
	...(entry.reason !== undefined ? { "ram:Reason": entry.reason } : {}),
	...(tax ? { "ram:CategoryTradeTax": categoryTradeTaxNode(tax) } : {}),
});

const documentAllowanceChargeNodes = (
	allowances: DocumentAllowanceCharge[],
	charges: DocumentAllowanceCharge[],
): XmlTree[] => [
	...allowances.map((entry) => allowanceChargeNode(entry, false, entry.tax)),
	...charges.map((entry) => allowanceChargeNode(entry, true, entry.tax)),
];

const priceNode = (price: Price, allowances?: AllowanceCharge[]): XmlTree => ({
	"ram:ChargeAmount": formatDecimal(price.amount, { maxDecimals: 4, minDecimals: 2 }),
	...(price.basisQuantity !== undefined
		? {
				"ram:BasisQuantity": {
					"#text": formatDecimal(price.basisQuantity),
					...(price.basisQuantityUnit !== undefined
						? { "@unitCode": price.basisQuantityUnit }
						: {}),
				},
			}
		: {}),
	...(allowances?.length
		? {
				"ram:AppliedTradeAllowanceCharge": allowances.map((entry) => ({
					"ram:ChargeIndicator": { "udt:Indicator": "false" },
					"ram:ActualAmount": formatDecimal(entry.actualAmount, {
						maxDecimals: 4,
						minDecimals: 2,
					}),
					...(entry.reason !== undefined
						? { "ram:Reason": entry.reason }
						: {}),
				})),
			}
		: {}),
});

const lineNode = (line: InvoiceLine): XmlTree => ({
	"ram:AssociatedDocumentLineDocument": {
		"ram:LineID": line.id,
		...(line.note !== undefined
			? { "ram:IncludedNote": { "ram:Content": line.note } }
			: {}),
	},
	"ram:SpecifiedTradeProduct": {
		...(line.product.globalId
			? { "ram:GlobalID": schemedIdNode(line.product.globalId) }
			: {}),
		...(line.product.sellerAssignedId !== undefined
			? { "ram:SellerAssignedID": line.product.sellerAssignedId }
			: {}),
		...(line.product.buyerAssignedId !== undefined
			? { "ram:BuyerAssignedID": line.product.buyerAssignedId }
			: {}),
		"ram:Name": line.product.name,
		...(line.product.description !== undefined
			? { "ram:Description": line.product.description }
			: {}),
		...(line.product.attributes?.length
			? {
					"ram:ApplicableProductCharacteristic": line.product.attributes.map(
						(attribute) => ({
							"ram:Description": attribute.name,
							"ram:Value": attribute.value,
						}),
					),
				}
			: {}),
		...(line.product.originCountry !== undefined
			? { "ram:OriginTradeCountry": { "ram:ID": line.product.originCountry } }
			: {}),
	},
	"ram:SpecifiedLineTradeAgreement": {
		...(line.buyerOrderLineReference !== undefined
			? {
					"ram:BuyerOrderReferencedDocument": {
						"ram:LineID": line.buyerOrderLineReference,
					},
				}
			: {}),
		...(line.grossPrice
			? {
					"ram:GrossPriceProductTradePrice": priceNode(
						line.grossPrice,
						line.grossPrice.allowances,
					),
				}
			: {}),
		"ram:NetPriceProductTradePrice": priceNode(line.netPrice ?? { amount: 0 }),
	},
	"ram:SpecifiedLineTradeDelivery": {
		"ram:BilledQuantity": {
			"#text": formatDecimal(line.quantity),
			"@unitCode": line.unitCode,
		},
	},
	"ram:SpecifiedLineTradeSettlement": {
		"ram:ApplicableTradeTax": categoryTradeTaxNode(line.tax),
		...(line.billingPeriod
			? {
					"ram:BillingSpecifiedPeriod": {
						...(line.billingPeriod.start !== undefined
							? {
									"ram:StartDateTime": dateTimeNode(
										line.billingPeriod.start,
									),
								}
							: {}),
						...(line.billingPeriod.end !== undefined
							? {
									"ram:EndDateTime": dateTimeNode(
										line.billingPeriod.end,
									),
								}
							: {}),
					},
				}
			: {}),
		...(line.allowances?.length || line.charges?.length
			? {
					"ram:SpecifiedTradeAllowanceCharge": [
						...(line.allowances ?? []).map((entry) =>
							allowanceChargeNode(entry, false),
						),
						...(line.charges ?? []).map((entry) =>
							allowanceChargeNode(entry, true),
						),
					],
				}
			: {}),
		"ram:SpecifiedTradeSettlementLineMonetarySummation": {
			"ram:LineTotalAmount": formatAmount(line.netTotal ?? 0),
		},
		...(line.buyerAccountingReference !== undefined
			? {
					"ram:ReceivableSpecifiedTradeAccountingAccount": {
						"ram:ID": line.buyerAccountingReference,
					},
				}
			: {}),
	},
});

const paymentMeansNode = (means: PaymentMeans): XmlTree => ({
	"ram:TypeCode": means.typeCode,
	...(means.information !== undefined
		? { "ram:Information": means.information }
		: {}),
	...(means.card
		? {
				"ram:ApplicableTradeSettlementFinancialCard": {
					"ram:ID": means.card.id,
					...(means.card.holderName !== undefined
						? { "ram:CardholderName": means.card.holderName }
						: {}),
				},
			}
		: {}),
	...(means.payerIban !== undefined
		? {
				"ram:PayerPartyDebtorFinancialAccount": {
					"ram:IBANID": means.payerIban,
				},
			}
		: {}),
	...(means.payeeAccount
		? {
				"ram:PayeePartyCreditorFinancialAccount": {
					...(means.payeeAccount.iban !== undefined
						? { "ram:IBANID": means.payeeAccount.iban }
						: {}),
					...(means.payeeAccount.accountName !== undefined
						? { "ram:AccountName": means.payeeAccount.accountName }
						: {}),
					...(means.payeeAccount.proprietaryId !== undefined
						? { "ram:ProprietaryID": means.payeeAccount.proprietaryId }
						: {}),
				},
			}
		: {}),
	...(means.payeeAccount?.bic !== undefined
		? {
				"ram:PayeeSpecifiedCreditorFinancialInstitution": {
					"ram:BICID": means.payeeAccount.bic,
				},
			}
		: {}),
});

const taxBreakdownNode = (entry: TaxBreakdownEntry): XmlTree => ({
	"ram:CalculatedAmount": formatAmount(entry.calculatedAmount),
	"ram:TypeCode": entry.typeCode ?? "VAT",
	...(entry.exemptionReason !== undefined
		? { "ram:ExemptionReason": entry.exemptionReason }
		: {}),
	"ram:BasisAmount": formatAmount(entry.basisAmount),
	"ram:CategoryCode": entry.categoryCode,
	...(entry.exemptionReasonCode !== undefined
		? { "ram:ExemptionReasonCode": entry.exemptionReasonCode }
		: {}),
	...(entry.taxPointDate !== undefined
		? {
				"ram:TaxPointDate": {
					"udt:DateString": {
						"#text": toFormat102(entry.taxPointDate),
						"@format": "102",
					},
				},
			}
		: {}),
	...(entry.dueDateTypeCode !== undefined
		? { "ram:DueDateTypeCode": entry.dueDateTypeCode }
		: {}),
	...(entry.rateApplicablePercent !== undefined
		? { "ram:RateApplicablePercent": formatDecimal(entry.rateApplicablePercent) }
		: {}),
});

const additionalReferenceNode = (reference: AdditionalReference): XmlTree => ({
	"ram:IssuerAssignedID": reference.id,
	...(reference.uri !== undefined ? { "ram:URIID": reference.uri } : {}),
	...(reference.typeCode !== undefined ? { "ram:TypeCode": reference.typeCode } : {}),
	...(reference.name !== undefined ? { "ram:Name": reference.name } : {}),
	...(reference.attachment
		? {
				"ram:AttachmentBinaryObject": {
					"#text": reference.attachment.base64,
					"@mimeCode": reference.attachment.mimeType,
					...(reference.attachment.filename !== undefined
						? { "@filename": reference.attachment.filename }
						: {}),
				},
			}
		: {}),
});

const precedingInvoiceNode = (reference: DocumentReference): XmlTree => ({
	"ram:IssuerAssignedID": reference.id,
	...(reference.issueDate !== undefined
		? { "ram:FormattedIssueDateTime": formattedDateTimeNode(reference.issueDate) }
		: {}),
});

/** Sanity checks before serialization; collects human-readable problems. */
export const validateForBuild = (invoice: FacturXInvoice): string[] => {
	const errors: string[] = [];
	if (!invoice.id?.trim()) errors.push("The invoice has no id (BT-1).");
	if (!invoice.typeCode?.trim()) errors.push("The invoice has no type code (BT-3).");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.issueDate ?? "")) {
		errors.push("The issue date (BT-2) must be an ISO YYYY-MM-DD string.");
	}
	if (!invoice.currency?.trim()) errors.push("The invoice has no currency (BT-5).");
	if (!invoice.seller?.name?.trim()) errors.push("The seller has no name (BT-27).");
	if (!invoice.seller?.address?.country) {
		errors.push("The seller address has no country (BT-40).");
	}
	if (!invoice.buyer?.name?.trim()) errors.push("The buyer has no name (BT-44).");
	if (!invoice.totals) {
		errors.push("The invoice has no totals (BG-22); run computeTotals first.");
	}
	const profile = detectProfile(invoice.profile) ?? "en16931";
	if (profileHasLines(profile) && !invoice.lines?.length) {
		errors.push("The invoice has no lines (BG-25).");
	}
	return errors;
};

/**
 * Serialize the invoice to Factur-X CII XML. The invoice must carry its
 * `taxBreakdown` and `totals` (usually via `computeTotals`). Throws
 * `FacturXBuildError` listing the problems when required fields are missing.
 */
export const buildFacturXXml = (invoice: FacturXInvoice): string => {
	const errors = validateForBuild(invoice);
	if (errors.length > 0) throw new FacturXBuildError(errors);
	const totals = invoice.totals ?? {};

	const headerTradeAgreement: XmlTree = {
		...(invoice.buyerReference !== undefined
			? { "ram:BuyerReference": invoice.buyerReference }
			: {}),
		"ram:SellerTradeParty": partyNode(invoice.seller),
		"ram:BuyerTradeParty": partyNode(invoice.buyer),
		...(invoice.sellerTaxRepresentative
			? {
					"ram:SellerTaxRepresentativeTradeParty": partyNode(
						invoice.sellerTaxRepresentative,
					),
				}
			: {}),
		...(invoice.salesOrderReference !== undefined
			? {
					"ram:SellerOrderReferencedDocument": {
						"ram:IssuerAssignedID": invoice.salesOrderReference,
					},
				}
			: {}),
		...(invoice.purchaseOrderReference !== undefined
			? {
					"ram:BuyerOrderReferencedDocument": {
						"ram:IssuerAssignedID": invoice.purchaseOrderReference,
					},
				}
			: {}),
		...(invoice.contractReference !== undefined
			? {
					"ram:ContractReferencedDocument": {
						"ram:IssuerAssignedID": invoice.contractReference,
					},
				}
			: {}),
		...(invoice.additionalReferences?.length
			? {
					"ram:AdditionalReferencedDocument":
						invoice.additionalReferences.map(additionalReferenceNode),
				}
			: {}),
		...(invoice.projectReference
			? {
					"ram:SpecifiedProcuringProject": {
						"ram:ID": invoice.projectReference.id,
						...(invoice.projectReference.name !== undefined
							? { "ram:Name": invoice.projectReference.name }
							: {}),
					},
				}
			: {}),
	};

	const headerTradeDelivery: XmlTree = {
		...(invoice.deliverTo
			? { "ram:ShipToTradeParty": partyNode(invoice.deliverTo) }
			: {}),
		...(invoice.deliveryDate !== undefined
			? {
					"ram:ActualDeliverySupplyChainEvent": {
						"ram:OccurrenceDateTime": dateTimeNode(invoice.deliveryDate),
					},
				}
			: {}),
		...(invoice.despatchAdviceReference !== undefined
			? {
					"ram:DespatchAdviceReferencedDocument": {
						"ram:IssuerAssignedID": invoice.despatchAdviceReference,
					},
				}
			: {}),
		...(invoice.receivingAdviceReference !== undefined
			? {
					"ram:ReceivingAdviceReferencedDocument": {
						"ram:IssuerAssignedID": invoice.receivingAdviceReference,
					},
				}
			: {}),
	};

	const headerTradeSettlement: XmlTree = {
		...(invoice.creditorReference !== undefined
			? { "ram:CreditorReferenceID": invoice.creditorReference }
			: {}),
		...(invoice.paymentReference !== undefined
			? { "ram:PaymentReference": invoice.paymentReference }
			: {}),
		...(invoice.taxCurrency !== undefined
			? { "ram:TaxCurrencyCode": invoice.taxCurrency }
			: {}),
		"ram:InvoiceCurrencyCode": invoice.currency,
		...(invoice.payee ? { "ram:PayeeTradeParty": partyNode(invoice.payee) } : {}),
		...(invoice.paymentMeans?.length
			? {
					"ram:SpecifiedTradeSettlementPaymentMeans":
						invoice.paymentMeans.map(paymentMeansNode),
				}
			: {}),
		...(invoice.taxBreakdown?.length
			? { "ram:ApplicableTradeTax": invoice.taxBreakdown.map(taxBreakdownNode) }
			: {}),
		...(invoice.billingPeriod
			? {
					"ram:BillingSpecifiedPeriod": {
						...(invoice.billingPeriod.start !== undefined
							? {
									"ram:StartDateTime": dateTimeNode(
										invoice.billingPeriod.start,
									),
								}
							: {}),
						...(invoice.billingPeriod.end !== undefined
							? {
									"ram:EndDateTime": dateTimeNode(
										invoice.billingPeriod.end,
									),
								}
							: {}),
					},
				}
			: {}),
		...(invoice.allowances?.length || invoice.charges?.length
			? {
					"ram:SpecifiedTradeAllowanceCharge": documentAllowanceChargeNodes(
						invoice.allowances ?? [],
						invoice.charges ?? [],
					),
				}
			: {}),
		...(invoice.paymentTerms
			? {
					"ram:SpecifiedTradePaymentTerms": {
						...(invoice.paymentTerms.description !== undefined
							? { "ram:Description": invoice.paymentTerms.description }
							: {}),
						...(invoice.paymentTerms.dueDate !== undefined
							? {
									"ram:DueDateDateTime": dateTimeNode(
										invoice.paymentTerms.dueDate,
									),
								}
							: {}),
						...(invoice.paymentTerms.directDebitMandateId !== undefined
							? {
									"ram:DirectDebitMandateID":
										invoice.paymentTerms.directDebitMandateId,
								}
							: {}),
					},
				}
			: {}),
		"ram:SpecifiedTradeSettlementHeaderMonetarySummation": {
			...(totals.lineTotal !== undefined
				? { "ram:LineTotalAmount": formatAmount(totals.lineTotal) }
				: {}),
			...(totals.chargeTotal !== undefined
				? { "ram:ChargeTotalAmount": formatAmount(totals.chargeTotal) }
				: {}),
			...(totals.allowanceTotal !== undefined
				? { "ram:AllowanceTotalAmount": formatAmount(totals.allowanceTotal) }
				: {}),
			...(totals.taxBasisTotal !== undefined
				? { "ram:TaxBasisTotalAmount": formatAmount(totals.taxBasisTotal) }
				: {}),
			...(totals.taxTotal !== undefined
				? {
						"ram:TaxTotalAmount": [
							{
								"#text": formatAmount(totals.taxTotal),
								"@currencyID": invoice.currency,
							},
							...(totals.taxTotalInTaxCurrency !== undefined &&
							invoice.taxCurrency
								? [
										{
											"#text": formatAmount(
												totals.taxTotalInTaxCurrency,
											),
											"@currencyID": invoice.taxCurrency,
										},
									]
								: []),
						],
					}
				: {}),
			...(totals.roundingAmount !== undefined
				? { "ram:RoundingAmount": formatAmount(totals.roundingAmount) }
				: {}),
			...(totals.grandTotal !== undefined
				? { "ram:GrandTotalAmount": formatAmount(totals.grandTotal) }
				: {}),
			...(totals.prepaidAmount !== undefined
				? { "ram:TotalPrepaidAmount": formatAmount(totals.prepaidAmount) }
				: {}),
			...(totals.duePayable !== undefined
				? { "ram:DuePayableAmount": formatAmount(totals.duePayable) }
				: {}),
		},
		...(invoice.precedingInvoices?.length
			? {
					"ram:InvoiceReferencedDocument":
						invoice.precedingInvoices.map(precedingInvoiceNode),
				}
			: {}),
		...(invoice.buyerAccountingReference !== undefined
			? {
					"ram:ReceivableSpecifiedTradeAccountingAccount": {
						"ram:ID": invoice.buyerAccountingReference,
					},
				}
			: {}),
	};

	const tree: XmlTree = {
		"@xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
		"@xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
		"@xmlns:ram":
			"urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
		"@xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
		"rsm:ExchangedDocumentContext": {
			...(invoice.businessProcessType !== undefined
				? {
						"ram:BusinessProcessSpecifiedDocumentContextParameter": {
							"ram:ID": invoice.businessProcessType,
						},
					}
				: {}),
			"ram:GuidelineSpecifiedDocumentContextParameter": {
				"ram:ID": invoice.profile ?? PROFILE_URNS.en16931,
			},
		},
		"rsm:ExchangedDocument": {
			"ram:ID": invoice.id,
			"ram:TypeCode": invoice.typeCode,
			"ram:IssueDateTime": dateTimeNode(invoice.issueDate),
			...(invoice.notes?.length
				? { "ram:IncludedNote": invoice.notes.map(noteNode) }
				: {}),
		},
		"rsm:SupplyChainTradeTransaction": {
			...(invoice.lines?.length
				? {
						"ram:IncludedSupplyChainTradeLineItem":
							invoice.lines.map(lineNode),
					}
				: {}),
			"ram:ApplicableHeaderTradeAgreement": headerTradeAgreement,
			"ram:ApplicableHeaderTradeDelivery": headerTradeDelivery,
			"ram:ApplicableHeaderTradeSettlement": headerTradeSettlement,
		},
	};

	return (
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		serializeElement("rsm:CrossIndustryInvoice", tree, "").trim()
	);
};
