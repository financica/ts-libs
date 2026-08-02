/** Top-level CAMT.053 Bank-to-Customer Statement report. */
export interface Camt053Report {
	/** Message identification (GrpHdr/MsgId). */
	messageId: string;
	/** Report creation date/time (GrpHdr/CreDtTm). */
	creationDate: Date;
	/** Message recipient, if present (GrpHdr/MsgRcpt). */
	recipient?: Camt053Party;
	/** Array of statements in the report. */
	statements: Camt053Statement[];
}

/** A single bank statement (Stmt). */
export interface Camt053Statement {
	/** Statement identification (Stmt/Id). */
	id: string;
	/** Electronic sequence number (Stmt/ElctrncSeqNb). */
	electronicSequenceNumber?: number;
	/** Legal sequence number (Stmt/LglSeqNb). */
	legalSequenceNumber?: number;
	/** Statement creation date/time (Stmt/CreDtTm). */
	creationDate: Date;
	/** Start of the reporting period (Stmt/FrToDt/FrDtTm). */
	fromDate?: Date;
	/** End of the reporting period (Stmt/FrToDt/ToDtTm). */
	toDate?: Date;
	/** Account details for which this statement is generated. */
	account: Camt053Account;
	/** Transaction summary totals (Stmt/TxsSummry). */
	transactionSummary?: Camt053TransactionSummary;
	/** Balance information (Stmt/Bal). */
	balances: Camt053Balance[];
	/** Statement entries (Stmt/Ntry). */
	entries: Camt053Entry[];
}

/** Account information (Acct). */
export interface Camt053Account {
	/** IBAN, if present (Acct/Id/IBAN). */
	iban?: string;
	/** Other account identifier, if present (Acct/Id/Othr/Id). */
	otherId?: string;
	/** Account currency (Acct/Ccy). */
	currency?: string;
	/** Account owner (Acct/Ownr). */
	owner?: Camt053Party;
	/** Account servicer / financial institution (Acct/Svcr). */
	servicer?: Camt053FinancialInstitution;
}

/** Party information (used for account owner, message recipient, related parties). */
export interface Camt053Party {
	/** Party name (Nm). */
	name?: string;
	/** Party identification (Id/OrgId or Id/PrvtId). */
	identification?: Camt053PartyIdentification;
	/** Postal address (PstlAdr). */
	postalAddress?: Camt053PostalAddress;
}

/** Party identification details. */
export interface Camt053PartyIdentification {
	/** Organisation ID — other scheme ID (OrgId/Othr/Id). */
	organisationId?: string;
	/** Organisation ID scheme code (OrgId/Othr/SchmeNm/Cd). */
	organisationIdScheme?: string;
	/** BIC or BEI (OrgId/BICOrBEI). */
	bicOrBei?: string;
	/** Private person ID (PrvtId/Othr/Id). */
	privateId?: string;
}

/** Postal address (PstlAdr). */
export interface Camt053PostalAddress {
	/** Address type code (AdrTp/Cd). */
	addressType?: string;
	/** Street name (StrtNm). */
	streetName?: string;
	/** Building number (BldgNb). */
	buildingNumber?: string;
	/** Postal code (PstCd). */
	postalCode?: string;
	/** Town / city (TwnNm). */
	townName?: string;
	/** Country code (Ctry). */
	country?: string;
	/** Country subdivision (CtrySubDvsn). */
	countrySubDivision?: string;
	/** Unstructured address lines (AdrLine). */
	addressLines?: string[];
}

/** Financial institution identification (FinInstnId). */
export interface Camt053FinancialInstitution {
	/** BIC code (FinInstnId/BIC or FinInstnId/BICFI). */
	bic?: string;
	/** Institution name (FinInstnId/Nm). */
	name?: string;
	/** Other identification (FinInstnId/Othr/Id). */
	otherId?: string;
	/** Clearing system member ID (FinInstnId/ClrSysMmbId/MmbId). */
	clearingSystemMemberId?: string;
	/** Postal address (FinInstnId/PstlAdr). */
	postalAddress?: Camt053PostalAddress;
}

/** Transaction summary (TxsSummry). */
export interface Camt053TransactionSummary {
	/** Total entries count (TtlNtries/NbOfNtries). */
	totalEntries?: number;
	/** Total entries sum (TtlNtries/Sum). */
	totalEntriesSum?: number;
	/** Net entry amount (TtlNtries/TtlNetNtry/Amt). */
	netAmount?: number;
	/** Net entry credit/debit indicator (TtlNtries/TtlNetNtry/CdtDbtInd). */
	netCreditDebitIndicator?: "CRDT" | "DBIT";
	/** Credit entries count (TtlCdtNtries/NbOfNtries). */
	totalCreditEntries?: number;
	/** Credit entries sum (TtlCdtNtries/Sum). */
	totalCreditEntriesSum?: number;
	/** Debit entries count (TtlDbtNtries/NbOfNtries). */
	totalDebitEntries?: number;
	/** Debit entries sum (TtlDbtNtries/Sum). */
	totalDebitEntriesSum?: number;
}

/** Balance information (Bal). */
export interface Camt053Balance {
	/** Balance type code (Bal/Tp/CdOrPrtry/Cd), e.g. OPBD, CLBD, CLAV. */
	type: string;
	/** Balance type proprietary code (Bal/Tp/CdOrPrtry/Prtry). */
	proprietaryType?: string;
	/** Balance amount (Bal/Amt). */
	amount: number;
	/** Balance currency (Bal/Amt/@Ccy). */
	currency: string;
	/** Credit or debit indicator (Bal/CdtDbtInd). */
	creditDebitIndicator: "CRDT" | "DBIT";
	/** Balance date (Bal/Dt). */
	date: Date;
}

/** A single statement entry (Ntry). */
export interface Camt053Entry {
	/** Entry reference (NtryRef). */
	entryReference?: string;
	/** Entry amount (Amt). */
	amount: number;
	/** Entry currency (Amt/@Ccy). */
	currency: string;
	/** Credit or debit indicator (CdtDbtInd). */
	creditDebitIndicator: "CRDT" | "DBIT";
	/** Entry status code (Sts/Cd), e.g. BOOK, PDNG. */
	status?: string;
	/** Booking date (BookgDt). */
	bookingDate?: Date;
	/** Value date (ValDt). */
	valueDate?: Date;
	/** Account servicer reference (AcctSvcrRef). */
	accountServicerReference?: string;
	/** Bank transaction code (BkTxCd). */
	bankTransactionCode?: Camt053BankTransactionCode;
	/** Amount details including FX information (AmtDtls). */
	amountDetails?: Camt053AmountDetails;
	/** Charges information (Chrgs). */
	charges?: Camt053Charges;
	/** Reversal indicator (RvslInd). */
	reversalIndicator?: boolean;
	/** Additional entry information (AddtlNtryInf). */
	additionalInformation?: string;
	/** Entry details containing transaction-level information (NtryDtls). */
	entryDetails: Camt053EntryDetail[];
}

/** Amount details (AmtDtls). */
export interface Camt053AmountDetails {
	/** Transaction amount (TxAmt/Amt). */
	transactionAmount?: number;
	/** Transaction amount currency (TxAmt/Amt/@Ccy). */
	transactionCurrency?: string;
	/** Currency exchange details (TxAmt/CcyXchg). */
	currencyExchange?: Camt053CurrencyExchange;
}

/** Currency exchange details (CcyXchg). */
export interface Camt053CurrencyExchange {
	/** Source currency (SrcCcy). */
	sourceCurrency: string;
	/** Target currency (TrgtCcy). */
	targetCurrency: string;
	/** Unit currency (UnitCcy). */
	unitCurrency?: string;
	/** Exchange rate (XchgRate). */
	exchangeRate: number;
}

/** Charges information (Chrgs). */
export interface Camt053Charges {
	/** Total charges and tax amount (TtlChrgsAndTaxAmt). */
	totalAmount?: number;
	/** Total charges and tax currency (TtlChrgsAndTaxAmt/@Ccy). */
	totalCurrency?: string;
}

/** Entry detail container (NtryDtls). */
export interface Camt053EntryDetail {
	/** Batch information (Btch). */
	batch?: Camt053Batch;
	/** Transaction details (TxDtls). */
	transactionDetails: Camt053TransactionDetail[];
}

/** Batch information (Btch). */
export interface Camt053Batch {
	/** Message ID (MsgId). */
	messageId?: string;
	/** Payment information ID (PmtInfId). */
	paymentInformationId?: string;
	/** Number of transactions (NbOfTxs). */
	numberOfTransactions?: number;
	/** Total amount (TtlAmt). */
	totalAmount?: number;
	/** Total amount currency (TtlAmt/@Ccy). */
	totalCurrency?: string;
	/** Credit/debit indicator (CdtDbtInd). */
	creditDebitIndicator?: "CRDT" | "DBIT";
}

/** Bank transaction code (BkTxCd). */
export interface Camt053BankTransactionCode {
	/** Domain code (Domn/Cd). */
	domainCode?: string;
	/** Domain family code (Domn/Fmly/Cd). */
	domainFamilyCode?: string;
	/** Domain sub-family code (Domn/Fmly/SubFmlyCd). */
	domainSubFamilyCode?: string;
	/** Proprietary code (Prtry/Cd). */
	proprietaryCode?: string;
	/** Proprietary issuer (Prtry/Issr). */
	proprietaryIssuer?: string;
}

/** Individual transaction detail (TxDtls). */
export interface Camt053TransactionDetail {
	/** References (Refs). */
	references?: Camt053References;
	/** Amount details (AmtDtls). */
	amountDetails?: Camt053AmountDetails;
	/** Bank transaction code (BkTxCd). */
	bankTransactionCode?: Camt053BankTransactionCode;
	/** Related parties (RltdPties). */
	relatedParties?: Camt053RelatedParties;
	/** Related agents (RltdAgts). */
	relatedAgents?: Camt053RelatedAgents;
	/** Purpose (Purp). */
	purpose?: Camt053Purpose;
	/** Remittance information (RmtInf). */
	remittanceInformation?: Camt053RemittanceInformation;
	/** Charges (Chrgs). */
	charges?: Camt053Charges;
	/** Return information (RtrInf). */
	returnInformation?: Camt053ReturnInformation;
	/** Additional transaction information (AddtlTxInf). */
	additionalInformation?: string;
}

/** Transaction references (Refs). */
export interface Camt053References {
	/** Message ID (MsgId). */
	messageId?: string;
	/** Account servicer reference (AcctSvcrRef). */
	accountServicerReference?: string;
	/** Payment information ID (PmtInfId). */
	paymentInformationId?: string;
	/** Instruction ID (InstrId). */
	instructionId?: string;
	/** End-to-end ID (EndToEndId). */
	endToEndId?: string;
	/** Transaction ID (TxId). */
	transactionId?: string;
	/** Mandate ID (MndtId). */
	mandateId?: string;
}

/** Related parties (RltdPties). */
export interface Camt053RelatedParties {
	/** Debtor (Dbtr). */
	debtor?: Camt053Party;
	/** Debtor account (DbtrAcct). */
	debtorAccount?: Camt053Account;
	/** Creditor (Cdtr). */
	creditor?: Camt053Party;
	/** Creditor account (CdtrAcct). */
	creditorAccount?: Camt053Account;
	/** Ultimate debtor (UltmtDbtr). */
	ultimateDebtor?: Camt053Party;
	/** Ultimate creditor (UltmtCdtr). */
	ultimateCreditor?: Camt053Party;
}

/** Related agents (RltdAgts). */
export interface Camt053RelatedAgents {
	/** Debtor agent (DbtrAgt). */
	debtorAgent?: Camt053FinancialInstitution;
	/** Creditor agent (CdtrAgt). */
	creditorAgent?: Camt053FinancialInstitution;
}

/** Purpose (Purp). */
export interface Camt053Purpose {
	/** Purpose code (Cd). */
	code?: string;
	/** Proprietary purpose (Prtry). */
	proprietary?: string;
}

/** Remittance information (RmtInf). */
export interface Camt053RemittanceInformation {
	/** Unstructured remittance text (Ustrd). */
	unstructured?: string[];
	/** Structured remittance info (Strd). */
	structured?: Camt053StructuredRemittance[];
}

/** Structured remittance information (Strd). */
export interface Camt053StructuredRemittance {
	/** Creditor reference type (CdtrRefInf/Tp/CdOrPrtry/Cd). */
	creditorReferenceType?: string;
	/** Creditor reference (CdtrRefInf/Ref). */
	creditorReference?: string;
}

/** Return information (RtrInf). */
export interface Camt053ReturnInformation {
	/** Return reason code (Rsn/Cd). */
	reasonCode?: string;
	/** Return reason proprietary (Rsn/Prtry). */
	reasonProprietary?: string;
	/** Additional information (AddtlInf). */
	additionalInformation?: string[];
}
