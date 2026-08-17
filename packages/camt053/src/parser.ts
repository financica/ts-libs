import { XMLParser } from "fast-xml-parser";
import type {
	Camt053Account,
	Camt053AmountDetails,
	Camt053Balance,
	Camt053BankTransactionCode,
	Camt053Batch,
	Camt053Charges,
	Camt053CurrencyExchange,
	Camt053Entry,
	Camt053EntryDetail,
	Camt053FinancialInstitution,
	Camt053Party,
	Camt053PartyIdentification,
	Camt053PostalAddress,
	Camt053Purpose,
	Camt053References,
	Camt053RelatedAgents,
	Camt053RelatedParties,
	Camt053RemittanceInformation,
	Camt053Report,
	Camt053ReturnInformation,
	Camt053Statement,
	Camt053StructuredRemittance,
	Camt053TransactionDetail,
	Camt053TransactionSummary,
} from "./types.js";

/**
 * Common prefix of every CAMT.053 namespace URI, shared by all versions
 * (`camt.053.001.02` … `camt.053.001.10` and later). The parser uses it to
 * decide whether a document is a CAMT.053 at all; it is exported so callers can
 * sniff a file for the format before handing it over.
 */
export const CAMT053_NS_PREFIX = "urn:iso:std:iso:20022:tech:xsd:camt.053.001.";

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	// Preserve text content alongside attributes
	textNodeName: "#text",
	// Parse tag values as strings — we handle number conversion ourselves
	parseTagValue: false,
	// Ensure arrays are never collapsed to single values
	isArray: (name) => {
		const arrayTags = new Set([
			"Stmt",
			"Bal",
			"Ntry",
			"NtryDtls",
			"TxDtls",
			"Chrgs",
			"AdrLine",
			"Ustrd",
			"Strd",
			"AddtlInf",
		]);
		return arrayTags.has(name);
	},
});

// ---------------------------------------------------------------------------
// XML node access helpers
// ---------------------------------------------------------------------------

type XmlNode = Record<string, any>;

/** Safely access a text value from a node, returning undefined if absent. */
function text(node: XmlNode | undefined, key: string): string | undefined {
	if (!node) return undefined;
	const val = node[key] as unknown;
	if (val == null) return undefined;
	// A node with attributes has its text in #text
	if (typeof val === "object" && val !== null && "#text" in val) {
		return String((val as XmlNode)["#text"]);
	}
	return String(val as string | number | boolean);
}

/** Parse a numeric value from a node field. */
function num(node: XmlNode | undefined, key: string): number | undefined {
	const v = text(node, key);
	if (v == null) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

/** Parse a Date from a node field. */
function date(node: XmlNode | undefined, key: string): Date | undefined {
	const v = text(node, key);
	if (v == null) return undefined;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Ensure a value is wrapped in an array. */
function asArray<T>(val: T | T[] | undefined | null): T[] {
	if (val == null) return [];
	return Array.isArray(val) ? val : [val];
}

/** Get the amount and currency from an Amt node with @_Ccy attribute. */
function amountAndCurrency(node: XmlNode | undefined, key: string) {
	if (!node) return undefined;
	const amt = node[key] as XmlNode | undefined;
	if (!amt) return undefined;
	const rawAmount =
		typeof amt === "object" && "#text" in amt
			? String(amt["#text"])
			: String(amt as unknown);
	const currency =
		typeof amt === "object" && "@_Ccy" in amt ? String(amt["@_Ccy"]) : undefined;
	const n = Number(rawAmount);
	if (!Number.isFinite(n)) return undefined;
	return { amount: n, currency };
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function parsePostalAddress(
	node: XmlNode | undefined,
): Camt053PostalAddress | undefined {
	if (!node) return undefined;
	const adrLines = asArray(node.AdrLine).map(String);
	return {
		addressType: text(node.AdrTp as XmlNode | undefined, "Cd"),
		streetName: text(node, "StrtNm"),
		buildingNumber: text(node, "BldgNb"),
		postalCode: text(node, "PstCd"),
		townName: text(node, "TwnNm"),
		country: text(node, "Ctry"),
		countrySubDivision: text(node, "CtrySubDvsn"),
		addressLines: adrLines.length > 0 ? adrLines : undefined,
	};
}

function parsePartyIdentification(
	node: XmlNode | undefined,
): Camt053PartyIdentification | undefined {
	if (!node) return undefined;
	const orgId = node.OrgId as XmlNode | undefined;
	const prvtId = node.PrvtId as XmlNode | undefined;
	const orgOthr = orgId?.Othr as XmlNode | undefined;
	return {
		organisationId: text(orgOthr, "Id"),
		organisationIdScheme: text(orgOthr?.SchmeNm as XmlNode | undefined, "Cd"),
		bicOrBei: text(orgId, "BICOrBEI"),
		privateId: text(prvtId?.Othr as XmlNode | undefined, "Id"),
	};
}

function parseParty(node: XmlNode | undefined): Camt053Party | undefined {
	if (!node) return undefined;
	// CAMT.053.001.10 wraps party in a Pty element; older versions don't
	const inner = (node.Pty as XmlNode | undefined) ?? node;
	return {
		name: text(inner, "Nm"),
		identification: parsePartyIdentification(inner.Id as XmlNode | undefined),
		postalAddress: parsePostalAddress(inner.PstlAdr as XmlNode | undefined),
	};
}

function parseFinancialInstitution(
	node: XmlNode | undefined,
): Camt053FinancialInstitution | undefined {
	if (!node) return undefined;
	const fin = (node.FinInstnId as XmlNode | undefined) ?? node;
	return {
		bic: text(fin, "BIC") ?? text(fin, "BICFI"),
		name: text(fin, "Nm"),
		otherId: text(fin.Othr as XmlNode | undefined, "Id"),
		clearingSystemMemberId: text(fin.ClrSysMmbId as XmlNode | undefined, "MmbId"),
		postalAddress: parsePostalAddress(fin.PstlAdr as XmlNode | undefined),
	};
}

function parseAccount(node: XmlNode | undefined): Camt053Account | undefined {
	if (!node) return undefined;
	const id = node.Id as XmlNode | undefined;
	return {
		iban: text(id, "IBAN"),
		otherId: text(id?.Othr as XmlNode | undefined, "Id"),
		currency: text(node, "Ccy"),
		owner: parseParty(node.Ownr as XmlNode | undefined),
		servicer: parseFinancialInstitution(node.Svcr as XmlNode | undefined),
	};
}

function parseBankTransactionCode(
	node: XmlNode | undefined,
): Camt053BankTransactionCode | undefined {
	if (!node) return undefined;
	const domn = node.Domn as XmlNode | undefined;
	const fmly = domn?.Fmly as XmlNode | undefined;
	const prtry = node.Prtry as XmlNode | undefined;
	return {
		domainCode: text(domn, "Cd"),
		domainFamilyCode: text(fmly, "Cd"),
		domainSubFamilyCode: text(fmly, "SubFmlyCd"),
		proprietaryCode: text(prtry, "Cd"),
		proprietaryIssuer: text(prtry, "Issr"),
	};
}

function parseCurrencyExchange(
	node: XmlNode | undefined,
): Camt053CurrencyExchange | undefined {
	if (!node) return undefined;
	const srcCcy = text(node, "SrcCcy");
	const trgtCcy = text(node, "TrgtCcy");
	const xchgRate = num(node, "XchgRate");
	if (!srcCcy || !trgtCcy || xchgRate == null) return undefined;
	return {
		sourceCurrency: srcCcy,
		targetCurrency: trgtCcy,
		unitCurrency: text(node, "UnitCcy"),
		exchangeRate: xchgRate,
	};
}

function parseAmountDetails(
	node: XmlNode | undefined,
): Camt053AmountDetails | undefined {
	if (!node) return undefined;
	const txAmt = node.TxAmt as XmlNode | undefined;
	const ac = amountAndCurrency(txAmt, "Amt");
	return {
		transactionAmount: ac?.amount,
		transactionCurrency: ac?.currency,
		currencyExchange: parseCurrencyExchange(txAmt?.CcyXchg as XmlNode | undefined),
	};
}

function parseCharges(node: XmlNode | undefined): Camt053Charges | undefined {
	if (!node) return undefined;
	const ac = amountAndCurrency(node, "TtlChrgsAndTaxAmt");
	if (!ac) return undefined;
	return {
		totalAmount: ac.amount,
		totalCurrency: ac.currency,
	};
}

function parseReferences(node: XmlNode | undefined): Camt053References | undefined {
	if (!node) return undefined;
	return {
		messageId: text(node, "MsgId"),
		accountServicerReference: text(node, "AcctSvcrRef"),
		paymentInformationId: text(node, "PmtInfId"),
		instructionId: text(node, "InstrId"),
		endToEndId: text(node, "EndToEndId"),
		transactionId: text(node, "TxId"),
		mandateId: text(node, "MndtId"),
	};
}

function parseRelatedParties(
	node: XmlNode | undefined,
): Camt053RelatedParties | undefined {
	if (!node) return undefined;
	return {
		debtor: parseParty(node.Dbtr as XmlNode | undefined),
		debtorAccount: parseAccount(node.DbtrAcct as XmlNode | undefined),
		creditor: parseParty(node.Cdtr as XmlNode | undefined),
		creditorAccount: parseAccount(node.CdtrAcct as XmlNode | undefined),
		ultimateDebtor: parseParty(node.UltmtDbtr as XmlNode | undefined),
		ultimateCreditor: parseParty(node.UltmtCdtr as XmlNode | undefined),
	};
}

function parseRelatedAgents(
	node: XmlNode | undefined,
): Camt053RelatedAgents | undefined {
	if (!node) return undefined;
	return {
		debtorAgent: parseFinancialInstitution(node.DbtrAgt as XmlNode | undefined),
		creditorAgent: parseFinancialInstitution(node.CdtrAgt as XmlNode | undefined),
	};
}

function parsePurpose(node: XmlNode | undefined): Camt053Purpose | undefined {
	if (!node) return undefined;
	return {
		code: text(node, "Cd"),
		proprietary: text(node, "Prtry"),
	};
}

function parseStructuredRemittance(node: XmlNode): Camt053StructuredRemittance {
	const cdtrRefInf = node.CdtrRefInf as XmlNode | undefined;
	return {
		creditorReferenceType: text(
			(cdtrRefInf?.Tp as XmlNode | undefined)?.CdOrPrtry as XmlNode | undefined,
			"Cd",
		),
		creditorReference: text(cdtrRefInf, "Ref"),
	};
}

function parseRemittanceInformation(
	node: XmlNode | undefined,
): Camt053RemittanceInformation | undefined {
	if (!node) return undefined;
	const ustrd = asArray(node.Ustrd).map(String);
	const strd = asArray(node.Strd).map(parseStructuredRemittance);
	return {
		unstructured: ustrd.length > 0 ? ustrd : undefined,
		structured: strd.length > 0 ? strd : undefined,
	};
}

function parseReturnInformation(
	node: XmlNode | undefined,
): Camt053ReturnInformation | undefined {
	if (!node) return undefined;
	const rsn = node.Rsn as XmlNode | undefined;
	const addtlInf = asArray(node.AddtlInf).map(String);
	return {
		reasonCode: text(rsn, "Cd"),
		reasonProprietary: text(rsn, "Prtry"),
		additionalInformation: addtlInf.length > 0 ? addtlInf : undefined,
	};
}

function parseTransactionDetail(node: XmlNode): Camt053TransactionDetail {
	return {
		references: parseReferences(node.Refs as XmlNode | undefined),
		amountDetails: parseAmountDetails(node.AmtDtls as XmlNode | undefined),
		bankTransactionCode: parseBankTransactionCode(
			node.BkTxCd as XmlNode | undefined,
		),
		relatedParties: parseRelatedParties(node.RltdPties as XmlNode | undefined),
		relatedAgents: parseRelatedAgents(node.RltdAgts as XmlNode | undefined),
		purpose: parsePurpose(node.Purp as XmlNode | undefined),
		remittanceInformation: parseRemittanceInformation(
			node.RmtInf as XmlNode | undefined,
		),
		charges: parseCharges(node.Chrgs as XmlNode | undefined),
		returnInformation: parseReturnInformation(node.RtrInf as XmlNode | undefined),
		additionalInformation: text(node, "AddtlTxInf"),
	};
}

function parseBatch(node: XmlNode | undefined): Camt053Batch | undefined {
	if (!node) return undefined;
	const ac = amountAndCurrency(node, "TtlAmt");
	return {
		messageId: text(node, "MsgId"),
		paymentInformationId: text(node, "PmtInfId"),
		numberOfTransactions: num(node, "NbOfTxs"),
		totalAmount: ac?.amount,
		totalCurrency: ac?.currency,
		creditDebitIndicator: text(node, "CdtDbtInd") as "CRDT" | "DBIT" | undefined,
	};
}

function parseEntryDetail(node: XmlNode): Camt053EntryDetail {
	return {
		batch: parseBatch(node.Btch as XmlNode | undefined),
		transactionDetails: asArray(node.TxDtls).map(parseTransactionDetail),
	};
}

function parseEntry(node: XmlNode): Camt053Entry {
	const ac = amountAndCurrency(node, "Amt");
	return {
		entryReference: text(node, "NtryRef"),
		amount: ac?.amount ?? 0,
		currency: ac?.currency ?? "",
		creditDebitIndicator: text(node, "CdtDbtInd") as "CRDT" | "DBIT",
		status: text(node.Sts as XmlNode | undefined, "Cd"),
		bookingDate: parseDate(node.BookgDt as XmlNode | undefined),
		valueDate: parseDate(node.ValDt as XmlNode | undefined),
		accountServicerReference: text(node, "AcctSvcrRef"),
		bankTransactionCode: parseBankTransactionCode(
			node.BkTxCd as XmlNode | undefined,
		),
		amountDetails: parseAmountDetails(node.AmtDtls as XmlNode | undefined),
		charges: parseCharges(asArray(node.Chrgs)[0] as XmlNode | undefined),
		reversalIndicator: node.RvslInd === "true" || node.RvslInd === true,
		additionalInformation: text(node, "AddtlNtryInf"),
		entryDetails: asArray(node.NtryDtls).map(parseEntryDetail),
	};
}

function parseDate(node: XmlNode | undefined): Date | undefined {
	if (!node) return undefined;
	return date(node, "DtTm") ?? date(node, "Dt");
}

function parseBalance(node: XmlNode): Camt053Balance {
	const tp = node.Tp as XmlNode | undefined;
	const cdOrPrtry = tp?.CdOrPrtry as XmlNode | undefined;
	const ac = amountAndCurrency(node, "Amt");
	return {
		type: text(cdOrPrtry, "Cd") ?? "",
		proprietaryType: text(cdOrPrtry, "Prtry"),
		amount: ac?.amount ?? 0,
		currency: ac?.currency ?? "",
		creditDebitIndicator: text(node, "CdtDbtInd") as "CRDT" | "DBIT",
		date: parseDate(node.Dt as XmlNode | undefined) ?? new Date(0),
	};
}

function parseTransactionSummary(
	node: XmlNode | undefined,
): Camt053TransactionSummary | undefined {
	if (!node) return undefined;
	const ttlNtries = node.TtlNtries as XmlNode | undefined;
	const ttlNet = ttlNtries?.TtlNetNtry as XmlNode | undefined;
	const ttlCdt = node.TtlCdtNtries as XmlNode | undefined;
	const ttlDbt = node.TtlDbtNtries as XmlNode | undefined;
	return {
		totalEntries: num(ttlNtries, "NbOfNtries"),
		totalEntriesSum: num(ttlNtries, "Sum"),
		netAmount: num(ttlNet, "Amt"),
		netCreditDebitIndicator: text(ttlNet, "CdtDbtInd") as
			| "CRDT"
			| "DBIT"
			| undefined,
		totalCreditEntries: num(ttlCdt, "NbOfNtries"),
		totalCreditEntriesSum: num(ttlCdt, "Sum"),
		totalDebitEntries: num(ttlDbt, "NbOfNtries"),
		totalDebitEntriesSum: num(ttlDbt, "Sum"),
	};
}

function parseStatement(node: XmlNode): Camt053Statement {
	const frToDt = node.FrToDt as XmlNode | undefined;
	return {
		id: text(node, "Id") ?? "",
		electronicSequenceNumber: num(node, "ElctrncSeqNb"),
		legalSequenceNumber: num(node, "LglSeqNb"),
		creationDate: date(node, "CreDtTm") ?? new Date(0),
		fromDate: date(frToDt, "FrDtTm") ?? date(frToDt, "FrDt"),
		toDate: date(frToDt, "ToDtTm") ?? date(frToDt, "ToDt"),
		account: parseAccount(node.Acct as XmlNode | undefined) ?? {
			iban: undefined,
		},
		transactionSummary: parseTransactionSummary(
			node.TxsSummry as XmlNode | undefined,
		),
		balances: asArray(node.Bal).map(parseBalance),
		entries: asArray(node.Ntry).map(parseEntry),
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a CAMT.053 Bank-to-Customer Statement XML string into a typed object.
 *
 * Supports CAMT.053.001.x (any version from 001 to 010+). Returns `null` if
 * the XML cannot be parsed or is not a CAMT.053 document.
 */
export function parseCamt053(xml: string): Camt053Report | null {
	try {
		const parsed = xmlParser.parse(xml) as XmlNode;
		const doc = parsed.Document as XmlNode | undefined;
		if (!doc) return null;

		// Validate namespace
		const ns = text(doc, "@_xmlns") ?? "";
		if (!ns.startsWith(CAMT053_NS_PREFIX)) return null;

		const bkToCstmrStmt = doc.BkToCstmrStmt as XmlNode | undefined;
		if (!bkToCstmrStmt) return null;

		const grpHdr = bkToCstmrStmt.GrpHdr as XmlNode | undefined;

		return {
			messageId: text(grpHdr, "MsgId") ?? "",
			creationDate: date(grpHdr, "CreDtTm") ?? new Date(0),
			recipient: parseParty(grpHdr?.MsgRcpt as XmlNode | undefined),
			statements: asArray(bkToCstmrStmt.Stmt).map(parseStatement),
		};
	} catch {
		return null;
	}
}
