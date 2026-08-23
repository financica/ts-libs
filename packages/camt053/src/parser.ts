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

/**
 * A parsed XML element as fast-xml-parser emits it: child elements keyed by
 * tag name, attributes keyed by `@_name`, and text under `#text` when the
 * element also carries attributes. Values are `unknown` because the parser
 * gives no static guarantees; every access goes through the guarded helpers.
 */
type XmlNode = Record<string, unknown>;

const isNode = (val: unknown): val is XmlNode =>
	typeof val === "object" && val !== null && !Array.isArray(val);

/** Access a child element by tag, or `undefined` when absent or not an element. */
function child(node: XmlNode | undefined, key: string): XmlNode | undefined {
	const val = node?.[key];
	return isNode(val) ? val : undefined;
}

/** Render a scalar (or attributed element's `#text`) as a string. */
function scalar(val: unknown): string | undefined {
	if (val == null) return undefined;
	// A node with attributes has its text in #text
	if (isNode(val)) return "#text" in val ? String(val["#text"]) : undefined;
	return String(val);
}

/** Safely access a text value from a node, returning undefined if absent. */
function text(node: XmlNode | undefined, key: string): string | undefined {
	return scalar(node?.[key]);
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
function asArray(val: unknown): unknown[] {
	if (val == null) return [];
	return Array.isArray(val) ? val : [val];
}

/** Child elements under a repeatable tag. */
function children(node: XmlNode | undefined, key: string): XmlNode[] {
	return asArray(node?.[key]).filter(isNode);
}

/** Text values under a repeatable scalar tag. */
function texts(node: XmlNode | undefined, key: string): string[] {
	return asArray(node?.[key])
		.map(scalar)
		.filter((v): v is string => v !== undefined);
}

/** Get the amount and currency from an Amt node with @_Ccy attribute. */
function amountAndCurrency(node: XmlNode | undefined, key: string) {
	if (!node) return undefined;
	const amt = node[key];
	if (amt == null) return undefined;
	const rawAmount = scalar(amt);
	if (rawAmount === undefined) return undefined;
	const currency = isNode(amt) && "@_Ccy" in amt ? String(amt["@_Ccy"]) : undefined;
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
	const adrLines = texts(node, "AdrLine");
	return {
		addressType: text(child(node, "AdrTp"), "Cd"),
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
	const orgId = child(node, "OrgId");
	const prvtId = child(node, "PrvtId");
	const orgOthr = child(orgId, "Othr");
	return {
		organisationId: text(orgOthr, "Id"),
		organisationIdScheme: text(child(orgOthr, "SchmeNm"), "Cd"),
		bicOrBei: text(orgId, "BICOrBEI"),
		privateId: text(child(prvtId, "Othr"), "Id"),
	};
}

function parseParty(node: XmlNode | undefined): Camt053Party | undefined {
	if (!node) return undefined;
	// CAMT.053.001.10 wraps party in a Pty element; older versions don't
	const inner = child(node, "Pty") ?? node;
	return {
		name: text(inner, "Nm"),
		identification: parsePartyIdentification(child(inner, "Id")),
		postalAddress: parsePostalAddress(child(inner, "PstlAdr")),
	};
}

function parseFinancialInstitution(
	node: XmlNode | undefined,
): Camt053FinancialInstitution | undefined {
	if (!node) return undefined;
	const fin = child(node, "FinInstnId") ?? node;
	return {
		bic: text(fin, "BIC") ?? text(fin, "BICFI"),
		name: text(fin, "Nm"),
		otherId: text(child(fin, "Othr"), "Id"),
		clearingSystemMemberId: text(child(fin, "ClrSysMmbId"), "MmbId"),
		postalAddress: parsePostalAddress(child(fin, "PstlAdr")),
	};
}

function parseAccount(node: XmlNode | undefined): Camt053Account | undefined {
	if (!node) return undefined;
	const id = child(node, "Id");
	return {
		iban: text(id, "IBAN"),
		otherId: text(child(id, "Othr"), "Id"),
		currency: text(node, "Ccy"),
		owner: parseParty(child(node, "Ownr")),
		servicer: parseFinancialInstitution(child(node, "Svcr")),
	};
}

function parseBankTransactionCode(
	node: XmlNode | undefined,
): Camt053BankTransactionCode | undefined {
	if (!node) return undefined;
	const domn = child(node, "Domn");
	const fmly = child(domn, "Fmly");
	const prtry = child(node, "Prtry");
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
	const txAmt = child(node, "TxAmt");
	const ac = amountAndCurrency(txAmt, "Amt");
	return {
		transactionAmount: ac?.amount,
		transactionCurrency: ac?.currency,
		currencyExchange: parseCurrencyExchange(child(txAmt, "CcyXchg")),
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
		debtor: parseParty(child(node, "Dbtr")),
		debtorAccount: parseAccount(child(node, "DbtrAcct")),
		creditor: parseParty(child(node, "Cdtr")),
		creditorAccount: parseAccount(child(node, "CdtrAcct")),
		ultimateDebtor: parseParty(child(node, "UltmtDbtr")),
		ultimateCreditor: parseParty(child(node, "UltmtCdtr")),
	};
}

function parseRelatedAgents(
	node: XmlNode | undefined,
): Camt053RelatedAgents | undefined {
	if (!node) return undefined;
	return {
		debtorAgent: parseFinancialInstitution(child(node, "DbtrAgt")),
		creditorAgent: parseFinancialInstitution(child(node, "CdtrAgt")),
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
	const cdtrRefInf = child(node, "CdtrRefInf");
	return {
		creditorReferenceType: text(child(child(cdtrRefInf, "Tp"), "CdOrPrtry"), "Cd"),
		creditorReference: text(cdtrRefInf, "Ref"),
	};
}

function parseRemittanceInformation(
	node: XmlNode | undefined,
): Camt053RemittanceInformation | undefined {
	if (!node) return undefined;
	const ustrd = texts(node, "Ustrd");
	const strd = children(node, "Strd").map(parseStructuredRemittance);
	return {
		unstructured: ustrd.length > 0 ? ustrd : undefined,
		structured: strd.length > 0 ? strd : undefined,
	};
}

function parseReturnInformation(
	node: XmlNode | undefined,
): Camt053ReturnInformation | undefined {
	if (!node) return undefined;
	const rsn = child(node, "Rsn");
	const addtlInf = texts(node, "AddtlInf");
	return {
		reasonCode: text(rsn, "Cd"),
		reasonProprietary: text(rsn, "Prtry"),
		additionalInformation: addtlInf.length > 0 ? addtlInf : undefined,
	};
}

function parseTransactionDetail(node: XmlNode): Camt053TransactionDetail {
	return {
		references: parseReferences(child(node, "Refs")),
		amountDetails: parseAmountDetails(child(node, "AmtDtls")),
		bankTransactionCode: parseBankTransactionCode(child(node, "BkTxCd")),
		relatedParties: parseRelatedParties(child(node, "RltdPties")),
		relatedAgents: parseRelatedAgents(child(node, "RltdAgts")),
		purpose: parsePurpose(child(node, "Purp")),
		remittanceInformation: parseRemittanceInformation(child(node, "RmtInf")),
		charges: parseCharges(child(node, "Chrgs")),
		returnInformation: parseReturnInformation(child(node, "RtrInf")),
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
		batch: parseBatch(child(node, "Btch")),
		transactionDetails: children(node, "TxDtls").map(parseTransactionDetail),
	};
}

function parseEntry(node: XmlNode): Camt053Entry {
	const ac = amountAndCurrency(node, "Amt");
	return {
		entryReference: text(node, "NtryRef"),
		amount: ac?.amount ?? 0,
		currency: ac?.currency ?? "",
		creditDebitIndicator: text(node, "CdtDbtInd") as "CRDT" | "DBIT",
		status: text(child(node, "Sts"), "Cd"),
		bookingDate: parseDate(child(node, "BookgDt")),
		valueDate: parseDate(child(node, "ValDt")),
		accountServicerReference: text(node, "AcctSvcrRef"),
		bankTransactionCode: parseBankTransactionCode(child(node, "BkTxCd")),
		amountDetails: parseAmountDetails(child(node, "AmtDtls")),
		charges: parseCharges(children(node, "Chrgs")[0]),
		reversalIndicator: node.RvslInd === "true" || node.RvslInd === true,
		additionalInformation: text(node, "AddtlNtryInf"),
		entryDetails: children(node, "NtryDtls").map(parseEntryDetail),
	};
}

function parseDate(node: XmlNode | undefined): Date | undefined {
	if (!node) return undefined;
	return date(node, "DtTm") ?? date(node, "Dt");
}

function parseBalance(node: XmlNode): Camt053Balance {
	const tp = child(node, "Tp");
	const cdOrPrtry = child(tp, "CdOrPrtry");
	const ac = amountAndCurrency(node, "Amt");
	return {
		type: text(cdOrPrtry, "Cd") ?? "",
		proprietaryType: text(cdOrPrtry, "Prtry"),
		amount: ac?.amount ?? 0,
		currency: ac?.currency ?? "",
		creditDebitIndicator: text(node, "CdtDbtInd") as "CRDT" | "DBIT",
		date: parseDate(child(node, "Dt")) ?? new Date(0),
	};
}

function parseTransactionSummary(
	node: XmlNode | undefined,
): Camt053TransactionSummary | undefined {
	if (!node) return undefined;
	const ttlNtries = child(node, "TtlNtries");
	const ttlNet = child(ttlNtries, "TtlNetNtry");
	const ttlCdt = child(node, "TtlCdtNtries");
	const ttlDbt = child(node, "TtlDbtNtries");
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
	const frToDt = child(node, "FrToDt");
	return {
		id: text(node, "Id") ?? "",
		electronicSequenceNumber: num(node, "ElctrncSeqNb"),
		legalSequenceNumber: num(node, "LglSeqNb"),
		creationDate: date(node, "CreDtTm") ?? new Date(0),
		fromDate: date(frToDt, "FrDtTm") ?? date(frToDt, "FrDt"),
		toDate: date(frToDt, "ToDtTm") ?? date(frToDt, "ToDt"),
		account: parseAccount(child(node, "Acct")) ?? {
			iban: undefined,
		},
		transactionSummary: parseTransactionSummary(child(node, "TxsSummry")),
		balances: children(node, "Bal").map(parseBalance),
		entries: children(node, "Ntry").map(parseEntry),
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
		const parsed: unknown = xmlParser.parse(xml);
		const doc = isNode(parsed) ? child(parsed, "Document") : undefined;
		if (!doc) return null;

		// Validate namespace
		const ns = text(doc, "@_xmlns") ?? "";
		if (!ns.startsWith(CAMT053_NS_PREFIX)) return null;

		const bkToCstmrStmt = child(doc, "BkToCstmrStmt");
		if (!bkToCstmrStmt) return null;

		const grpHdr = child(bkToCstmrStmt, "GrpHdr");

		return {
			messageId: text(grpHdr, "MsgId") ?? "",
			creationDate: date(grpHdr, "CreDtTm") ?? new Date(0),
			recipient: parseParty(child(grpHdr, "MsgRcpt")),
			statements: children(bkToCstmrStmt, "Stmt").map(parseStatement),
		};
	} catch {
		return null;
	}
}
