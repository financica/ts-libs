import { XMLBuilder } from "fast-xml-parser";
import type {
	Camt053Account,
	Camt053AmountDetails,
	Camt053Balance,
	Camt053BankTransactionCode,
	Camt053Batch,
	Camt053Charges,
	Camt053Entry,
	Camt053EntryDetail,
	Camt053FinancialInstitution,
	Camt053Party,
	Camt053PostalAddress,
	Camt053References,
	Camt053RemittanceInformation,
	Camt053Report,
	Camt053ReturnInformation,
	Camt053Statement,
	Camt053TransactionDetail,
	Camt053TransactionSummary,
} from "./types.js";

/** The schema version the serializer writes. */
export const CAMT053_SERIALIZED_NS = "urn:iso:std:iso:20022:tech:xsd:camt.053.001.04";

/**
 * Serialize a {@link Camt053Report} as a camt.053.001.04 document, elements
 * in schema order. `parseCamt053(serializeCamt053(report))` reproduces
 * `report`. A date at UTC midnight is written as a plain `Dt`; any other
 * instant as a `DtTm` in UTC.
 */
export function serializeCamt053(report: Camt053Report): string {
	const doc = {
		"?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
		Document: {
			"@_xmlns": CAMT053_SERIALIZED_NS,
			BkToCstmrStmt: {
				GrpHdr: compact({
					MsgId: report.messageId,
					CreDtTm: dateTime(report.creationDate),
					MsgRcpt: party(report.recipient),
				}),
				Stmt: report.statements.map(statement),
			},
		},
	};
	return builder.build(doc) as string;
}

const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	textNodeName: "#text",
	format: true,
	indentBy: "  ",
	suppressEmptyNode: true,
});

type Node = Record<string, unknown>;

/** Drop absent children so an optional element is simply not written. */
const compact = (node: Node): Node | undefined => {
	const out: Node = {};
	for (const [key, value] of Object.entries(node)) {
		if (value === undefined) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		out[key] = value;
	}
	return Object.keys(out).length > 0 ? out : undefined;
};

const dateTime = (date: Date): string => date.toISOString();

/** `{ Dt }` for a UTC-midnight date, `{ DtTm }` otherwise. */
const dateChoice = (date: Date | undefined): Node | undefined => {
	if (!date) return undefined;
	const iso = date.toISOString();
	return iso.endsWith("T00:00:00.000Z") ? { Dt: iso.slice(0, 10) } : { DtTm: iso };
};

const amountText = (value: number): string => Number(value.toFixed(5)).toString();

const amount = (value: number | undefined, currency: string | undefined) =>
	value === undefined
		? undefined
		: currency === undefined
			? amountText(value)
			: { "@_Ccy": currency, "#text": amountText(value) };

const postalAddress = (address: Camt053PostalAddress | undefined) =>
	address &&
	compact({
		AdrTp: address.addressType ? { Cd: address.addressType } : undefined,
		StrtNm: address.streetName,
		BldgNb: address.buildingNumber,
		PstCd: address.postalCode,
		TwnNm: address.townName,
		CtrySubDvsn: address.countrySubDivision,
		Ctry: address.country,
		AdrLine: address.addressLines,
	});

const party = (value: Camt053Party | undefined) => {
	if (!value) return undefined;
	const id = value.identification;
	const orgOthr =
		id && (id.organisationId || id.organisationIdScheme)
			? compact({
					Id: id.organisationId,
					SchmeNm: id.organisationIdScheme
						? { Cd: id.organisationIdScheme }
						: undefined,
				})
			: undefined;
	const orgId =
		id && (orgOthr || id.bicOrBei)
			? compact({ BICOrBEI: id.bicOrBei, Othr: orgOthr })
			: undefined;
	const prvtId = id?.privateId ? { Othr: { Id: id.privateId } } : undefined;
	return compact({
		Nm: value.name,
		PstlAdr: postalAddress(value.postalAddress),
		Id: orgId || prvtId ? compact({ OrgId: orgId, PrvtId: prvtId }) : undefined,
	});
};

const financialInstitution = (value: Camt053FinancialInstitution | undefined) =>
	value &&
	compact({
		FinInstnId: compact({
			BICFI: value.bic,
			ClrSysMmbId: value.clearingSystemMemberId
				? { MmbId: value.clearingSystemMemberId }
				: undefined,
			Nm: value.name,
			PstlAdr: postalAddress(value.postalAddress),
			Othr: value.otherId ? { Id: value.otherId } : undefined,
		}),
	});

const account = (value: Camt053Account | undefined) =>
	value &&
	compact({
		Id: compact({
			IBAN: value.iban,
			Othr: value.otherId ? { Id: value.otherId } : undefined,
		}),
		Ccy: value.currency,
		Ownr: party(value.owner),
		Svcr: financialInstitution(value.servicer),
	});

const bankTransactionCode = (value: Camt053BankTransactionCode | undefined) =>
	value &&
	compact({
		Domn: value.domainCode
			? compact({
					Cd: value.domainCode,
					Fmly:
						value.domainFamilyCode || value.domainSubFamilyCode
							? compact({
									Cd: value.domainFamilyCode,
									SubFmlyCd: value.domainSubFamilyCode,
								})
							: undefined,
				})
			: undefined,
		Prtry:
			value.proprietaryCode || value.proprietaryIssuer
				? compact({ Cd: value.proprietaryCode, Issr: value.proprietaryIssuer })
				: undefined,
	});

const amountDetails = (value: Camt053AmountDetails | undefined) =>
	value &&
	compact({
		TxAmt: compact({
			Amt: amount(value.transactionAmount, value.transactionCurrency),
			CcyXchg: value.currencyExchange
				? compact({
						SrcCcy: value.currencyExchange.sourceCurrency,
						TrgtCcy: value.currencyExchange.targetCurrency,
						UnitCcy: value.currencyExchange.unitCurrency,
						XchgRate: amountText(value.currencyExchange.exchangeRate),
					})
				: undefined,
		}),
	});

const charges = (value: Camt053Charges | undefined) =>
	value &&
	compact({ TtlChrgsAndTaxAmt: amount(value.totalAmount, value.totalCurrency) });

const references = (value: Camt053References | undefined) =>
	value &&
	compact({
		MsgId: value.messageId,
		AcctSvcrRef: value.accountServicerReference,
		PmtInfId: value.paymentInformationId,
		InstrId: value.instructionId,
		EndToEndId: value.endToEndId,
		TxId: value.transactionId,
		MndtId: value.mandateId,
	});

const remittanceInformation = (value: Camt053RemittanceInformation | undefined) =>
	value &&
	compact({
		Ustrd: value.unstructured,
		Strd: value.structured?.map((strd) =>
			compact({
				CdtrRefInf: compact({
					Tp: strd.creditorReferenceType
						? { CdOrPrtry: { Cd: strd.creditorReferenceType } }
						: undefined,
					Ref: strd.creditorReference,
				}),
			}),
		),
	});

const returnInformation = (value: Camt053ReturnInformation | undefined) =>
	value &&
	compact({
		Rsn:
			value.reasonCode || value.reasonProprietary
				? compact({ Cd: value.reasonCode, Prtry: value.reasonProprietary })
				: undefined,
		AddtlInf: value.additionalInformation,
	});

const transactionDetail = (value: Camt053TransactionDetail) =>
	compact({
		Refs: references(value.references),
		AmtDtls: amountDetails(value.amountDetails),
		BkTxCd: bankTransactionCode(value.bankTransactionCode),
		Chrgs: charges(value.charges),
		RltdPties: value.relatedParties
			? compact({
					Dbtr: party(value.relatedParties.debtor),
					DbtrAcct: account(value.relatedParties.debtorAccount),
					UltmtDbtr: party(value.relatedParties.ultimateDebtor),
					Cdtr: party(value.relatedParties.creditor),
					CdtrAcct: account(value.relatedParties.creditorAccount),
					UltmtCdtr: party(value.relatedParties.ultimateCreditor),
				})
			: undefined,
		RltdAgts: value.relatedAgents
			? compact({
					DbtrAgt: financialInstitution(value.relatedAgents.debtorAgent),
					CdtrAgt: financialInstitution(value.relatedAgents.creditorAgent),
				})
			: undefined,
		Purp: value.purpose
			? compact({ Cd: value.purpose.code, Prtry: value.purpose.proprietary })
			: undefined,
		RmtInf: remittanceInformation(value.remittanceInformation),
		RtrInf: returnInformation(value.returnInformation),
		AddtlTxInf: value.additionalInformation,
	}) ?? {};

const batch = (value: Camt053Batch | undefined) =>
	value &&
	compact({
		MsgId: value.messageId,
		PmtInfId: value.paymentInformationId,
		NbOfTxs: value.numberOfTransactions,
		TtlAmt: amount(value.totalAmount, value.totalCurrency),
		CdtDbtInd: value.creditDebitIndicator,
	});

const entryDetail = (value: Camt053EntryDetail) =>
	compact({
		Btch: batch(value.batch),
		TxDtls: value.transactionDetails.map(transactionDetail),
	}) ?? {};

const entry = (value: Camt053Entry) =>
	compact({
		NtryRef: value.entryReference,
		Amt: amount(value.amount, value.currency),
		CdtDbtInd: value.creditDebitIndicator,
		RvslInd: value.reversalIndicator,
		Sts: value.status ? { Cd: value.status } : undefined,
		BookgDt: dateChoice(value.bookingDate),
		ValDt: dateChoice(value.valueDate),
		AcctSvcrRef: value.accountServicerReference,
		BkTxCd: bankTransactionCode(value.bankTransactionCode),
		AmtDtls: amountDetails(value.amountDetails),
		Chrgs: charges(value.charges),
		NtryDtls: value.entryDetails.map(entryDetail),
		AddtlNtryInf: value.additionalInformation,
	});

const balance = (value: Camt053Balance) =>
	compact({
		Tp: {
			CdOrPrtry: compact({ Cd: value.type, Prtry: value.proprietaryType }),
		},
		Amt: amount(value.amount, value.currency),
		CdtDbtInd: value.creditDebitIndicator,
		Dt: dateChoice(value.date),
	});

const transactionSummary = (value: Camt053TransactionSummary | undefined) =>
	value &&
	compact({
		TtlNtries: compact({
			NbOfNtries: value.totalEntries,
			Sum:
				value.totalEntriesSum === undefined
					? undefined
					: amountText(value.totalEntriesSum),
			TtlNetNtry:
				value.netAmount !== undefined || value.netCreditDebitIndicator
					? compact({
							Amt:
								value.netAmount === undefined
									? undefined
									: amountText(value.netAmount),
							CdtDbtInd: value.netCreditDebitIndicator,
						})
					: undefined,
		}),
		TtlCdtNtries: compact({
			NbOfNtries: value.totalCreditEntries,
			Sum:
				value.totalCreditEntriesSum === undefined
					? undefined
					: amountText(value.totalCreditEntriesSum),
		}),
		TtlDbtNtries: compact({
			NbOfNtries: value.totalDebitEntries,
			Sum:
				value.totalDebitEntriesSum === undefined
					? undefined
					: amountText(value.totalDebitEntriesSum),
		}),
	});

const statement = (value: Camt053Statement) =>
	compact({
		Id: value.id,
		ElctrncSeqNb: value.electronicSequenceNumber,
		LglSeqNb: value.legalSequenceNumber,
		CreDtTm: dateTime(value.creationDate),
		FrToDt:
			value.fromDate || value.toDate
				? compact({
						FrDtTm: value.fromDate && dateTime(value.fromDate),
						ToDtTm: value.toDate && dateTime(value.toDate),
					})
				: undefined,
		Acct: account(value.account) ?? {},
		Bal: value.balances.map(balance),
		TxsSummry: transactionSummary(value.transactionSummary),
		Ntry: value.entries.map(entry),
	});
