/** Top-level CAMT.053 Bank-to-Customer Statement report. */
export interface Camt053Report {
	/** Message identification (GrpHdr/MsgId). */
	messageId: string;
	/** Report creation date/time (GrpHdr/CreDtTm). */
	creationDate: Date;
	/** Message recipient, if present (GrpHdr/MsgRcpt). */
	recipient?: Camt053Party | undefined;
	/** Array of statements in the report. */
	statements: Camt053Statement[];
}

/** A single bank statement (Stmt). */
export interface Camt053Statement {
	/** Statement identification (Stmt/Id). */
	id: string;
	/** Electronic sequence number (Stmt/ElctrncSeqNb). */
	electronicSequenceNumber?: number | undefined;
	/** Legal sequence number (Stmt/LglSeqNb). */
	legalSequenceNumber?: number | undefined;
	/** Statement creation date/time (Stmt/CreDtTm). */
	creationDate: Date;
	/** Start of the reporting period (Stmt/FrToDt/FrDtTm). */
	fromDate?: Date | undefined;
	/** End of the reporting period (Stmt/FrToDt/ToDtTm). */
	toDate?: Date | undefined;
	/** Account details for which this statement is generated. */
	account: Camt053Account;
	/** Transaction summary totals (Stmt/TxsSummry). */
	transactionSummary?: Camt053TransactionSummary | undefined;
	/** Balance information (Stmt/Bal). */
	balances: Camt053Balance[];
	/** Statement entries (Stmt/Ntry). */
	entries: Camt053Entry[];
}

/** Account information (Acct). */
export interface Camt053Account {
	/** IBAN, if present (Acct/Id/IBAN). */
	iban?: string | undefined;
	/** Other account identifier, if present (Acct/Id/Othr/Id). */
	otherId?: string | undefined;
	/** Account currency (Acct/Ccy). */
	currency?: string | undefined;
	/** Account owner (Acct/Ownr). */
	owner?: Camt053Party | undefined;
	/** Account servicer / financial institution (Acct/Svcr). */
	servicer?: Camt053FinancialInstitution | undefined;
}

/** Party information (used for account owner, message recipient, related parties). */
export interface Camt053Party {
	/** Party name (Nm). */
	name?: string | undefined;
	/** Party identification (Id/OrgId or Id/PrvtId). */
	identification?: Camt053PartyIdentification | undefined;
	/** Postal address (PstlAdr). */
	postalAddress?: Camt053PostalAddress | undefined;
}

/** Party identification details. */
export interface Camt053PartyIdentification {
	/** Organisation ID — other scheme ID (OrgId/Othr/Id). */
	organisationId?: string | undefined;
	/** Organisation ID scheme code (OrgId/Othr/SchmeNm/Cd). */
	organisationIdScheme?: string | undefined;
	/** BIC or BEI (OrgId/BICOrBEI). */
	bicOrBei?: string | undefined;
	/** Private person ID (PrvtId/Othr/Id). */
	privateId?: string | undefined;
}

/** Postal address (PstlAdr). */
export interface Camt053PostalAddress {
	/** Address type code (AdrTp/Cd). */
	addressType?: string | undefined;
	/** Street name (StrtNm). */
	streetName?: string | undefined;
	/** Building number (BldgNb). */
	buildingNumber?: string | undefined;
	/** Postal code (PstCd). */
	postalCode?: string | undefined;
	/** Town / city (TwnNm). */
	townName?: string | undefined;
	/** Country code (Ctry). */
	country?: string | undefined;
	/** Country subdivision (CtrySubDvsn). */
	countrySubDivision?: string | undefined;
	/** Unstructured address lines (AdrLine). */
	addressLines?: string[] | undefined;
}

/** Financial institution identification (FinInstnId). */
export interface Camt053FinancialInstitution {
	/** BIC code (FinInstnId/BIC or FinInstnId/BICFI). */
	bic?: string | undefined;
	/** Institution name (FinInstnId/Nm). */
	name?: string | undefined;
	/** Other identification (FinInstnId/Othr/Id). */
	otherId?: string | undefined;
	/** Clearing system member ID (FinInstnId/ClrSysMmbId/MmbId). */
	clearingSystemMemberId?: string | undefined;
	/** Postal address (FinInstnId/PstlAdr). */
	postalAddress?: Camt053PostalAddress | undefined;
}

/** Transaction summary (TxsSummry). */
export interface Camt053TransactionSummary {
	/** Total entries count (TtlNtries/NbOfNtries). */
	totalEntries?: number | undefined;
	/** Total entries sum (TtlNtries/Sum). */
	totalEntriesSum?: number | undefined;
	/** Net entry amount (TtlNtries/TtlNetNtry/Amt). */
	netAmount?: number | undefined;
	/** Net entry credit/debit indicator (TtlNtries/TtlNetNtry/CdtDbtInd). */
	netCreditDebitIndicator?: "CRDT" | "DBIT" | undefined;
	/** Credit entries count (TtlCdtNtries/NbOfNtries). */
	totalCreditEntries?: number | undefined;
	/** Credit entries sum (TtlCdtNtries/Sum). */
	totalCreditEntriesSum?: number | undefined;
	/** Debit entries count (TtlDbtNtries/NbOfNtries). */
	totalDebitEntries?: number | undefined;
	/** Debit entries sum (TtlDbtNtries/Sum). */
	totalDebitEntriesSum?: number | undefined;
}

/** Balance information (Bal). */
export interface Camt053Balance {
	/** Balance type code (Bal/Tp/CdOrPrtry/Cd), e.g. OPBD, CLBD, CLAV. Absent when the balance uses a proprietary type. */
	type?: string | undefined;
	/** Balance type proprietary code (Bal/Tp/CdOrPrtry/Prtry). */
	proprietaryType?: string | undefined;
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
	entryReference?: string | undefined;
	/** Entry amount (Amt). */
	amount: number;
	/** Entry currency (Amt/@Ccy). */
	currency: string;
	/** Credit or debit indicator (CdtDbtInd). */
	creditDebitIndicator: "CRDT" | "DBIT";
	/** Entry status code (Sts/Cd), e.g. BOOK, PDNG. */
	status?: string | undefined;
	/** Booking date (BookgDt). */
	bookingDate?: Date | undefined;
	/** Value date (ValDt). */
	valueDate?: Date | undefined;
	/** Account servicer reference (AcctSvcrRef). */
	accountServicerReference?: string | undefined;
	/** Bank transaction code (BkTxCd). */
	bankTransactionCode?: Camt053BankTransactionCode | undefined;
	/** Amount details including FX information (AmtDtls). */
	amountDetails?: Camt053AmountDetails | undefined;
	/** Charges information (Chrgs). */
	charges?: Camt053Charges | undefined;
	/** Reversal indicator (RvslInd). */
	reversalIndicator?: boolean | undefined;
	/** Additional entry information (AddtlNtryInf). */
	additionalInformation?: string | undefined;
	/** Entry details containing transaction-level information (NtryDtls). */
	entryDetails: Camt053EntryDetail[];
}

/** Amount details (AmtDtls). */
export interface Camt053AmountDetails {
	/** Transaction amount (TxAmt/Amt). */
	transactionAmount?: number | undefined;
	/** Transaction amount currency (TxAmt/Amt/@Ccy). */
	transactionCurrency?: string | undefined;
	/** Currency exchange details (TxAmt/CcyXchg). */
	currencyExchange?: Camt053CurrencyExchange | undefined;
}

/** Currency exchange details (CcyXchg). */
export interface Camt053CurrencyExchange {
	/** Source currency (SrcCcy). */
	sourceCurrency: string;
	/** Target currency (TrgtCcy). */
	targetCurrency: string;
	/** Unit currency (UnitCcy). */
	unitCurrency?: string | undefined;
	/** Exchange rate (XchgRate). */
	exchangeRate: number;
}

/** Charges information (Chrgs). */
export interface Camt053Charges {
	/** Total charges and tax amount (TtlChrgsAndTaxAmt). */
	totalAmount?: number | undefined;
	/** Total charges and tax currency (TtlChrgsAndTaxAmt/@Ccy). */
	totalCurrency?: string | undefined;
}

/** Entry detail container (NtryDtls). */
export interface Camt053EntryDetail {
	/** Batch information (Btch). */
	batch?: Camt053Batch | undefined;
	/** Transaction details (TxDtls). */
	transactionDetails: Camt053TransactionDetail[];
}

/** Batch information (Btch). */
export interface Camt053Batch {
	/** Message ID (MsgId). */
	messageId?: string | undefined;
	/** Payment information ID (PmtInfId). */
	paymentInformationId?: string | undefined;
	/** Number of transactions (NbOfTxs). */
	numberOfTransactions?: number | undefined;
	/** Total amount (TtlAmt). */
	totalAmount?: number | undefined;
	/** Total amount currency (TtlAmt/@Ccy). */
	totalCurrency?: string | undefined;
	/** Credit/debit indicator (CdtDbtInd). */
	creditDebitIndicator?: "CRDT" | "DBIT" | undefined;
}

/** Bank transaction code (BkTxCd). */
export interface Camt053BankTransactionCode {
	/** Domain code (Domn/Cd). */
	domainCode?: string | undefined;
	/** Domain family code (Domn/Fmly/Cd). */
	domainFamilyCode?: string | undefined;
	/** Domain sub-family code (Domn/Fmly/SubFmlyCd). */
	domainSubFamilyCode?: string | undefined;
	/** Proprietary code (Prtry/Cd). */
	proprietaryCode?: string | undefined;
	/** Proprietary issuer (Prtry/Issr). */
	proprietaryIssuer?: string | undefined;
}

/** Individual transaction detail (TxDtls). */
export interface Camt053TransactionDetail {
	/** References (Refs). */
	references?: Camt053References | undefined;
	/** Amount details (AmtDtls). */
	amountDetails?: Camt053AmountDetails | undefined;
	/** Bank transaction code (BkTxCd). */
	bankTransactionCode?: Camt053BankTransactionCode | undefined;
	/** Related parties (RltdPties). */
	relatedParties?: Camt053RelatedParties | undefined;
	/** Related agents (RltdAgts). */
	relatedAgents?: Camt053RelatedAgents | undefined;
	/** Purpose (Purp). */
	purpose?: Camt053Purpose | undefined;
	/** Remittance information (RmtInf). */
	remittanceInformation?: Camt053RemittanceInformation | undefined;
	/** Charges (Chrgs). */
	charges?: Camt053Charges | undefined;
	/** Return information (RtrInf). */
	returnInformation?: Camt053ReturnInformation | undefined;
	/** Additional transaction information (AddtlTxInf). */
	additionalInformation?: string | undefined;
}

/** Transaction references (Refs). */
export interface Camt053References {
	/** Message ID (MsgId). */
	messageId?: string | undefined;
	/** Account servicer reference (AcctSvcrRef). */
	accountServicerReference?: string | undefined;
	/** Payment information ID (PmtInfId). */
	paymentInformationId?: string | undefined;
	/** Instruction ID (InstrId). */
	instructionId?: string | undefined;
	/** End-to-end ID (EndToEndId). */
	endToEndId?: string | undefined;
	/** Transaction ID (TxId). */
	transactionId?: string | undefined;
	/** Mandate ID (MndtId). */
	mandateId?: string | undefined;
}

/** Related parties (RltdPties). */
export interface Camt053RelatedParties {
	/** Debtor (Dbtr). */
	debtor?: Camt053Party | undefined;
	/** Debtor account (DbtrAcct). */
	debtorAccount?: Camt053Account | undefined;
	/** Creditor (Cdtr). */
	creditor?: Camt053Party | undefined;
	/** Creditor account (CdtrAcct). */
	creditorAccount?: Camt053Account | undefined;
	/** Ultimate debtor (UltmtDbtr). */
	ultimateDebtor?: Camt053Party | undefined;
	/** Ultimate creditor (UltmtCdtr). */
	ultimateCreditor?: Camt053Party | undefined;
}

/** Related agents (RltdAgts). */
export interface Camt053RelatedAgents {
	/** Debtor agent (DbtrAgt). */
	debtorAgent?: Camt053FinancialInstitution | undefined;
	/** Creditor agent (CdtrAgt). */
	creditorAgent?: Camt053FinancialInstitution | undefined;
}

/** Purpose (Purp). */
export interface Camt053Purpose {
	/** Purpose code (Cd). */
	code?: string | undefined;
	/** Proprietary purpose (Prtry). */
	proprietary?: string | undefined;
}

/** Remittance information (RmtInf). */
export interface Camt053RemittanceInformation {
	/** Unstructured remittance text (Ustrd). */
	unstructured?: string[] | undefined;
	/** Structured remittance info (Strd). */
	structured?: Camt053StructuredRemittance[] | undefined;
}

/** Structured remittance information (Strd). */
export interface Camt053StructuredRemittance {
	/** Creditor reference type (CdtrRefInf/Tp/CdOrPrtry/Cd). */
	creditorReferenceType?: string | undefined;
	/** Creditor reference (CdtrRefInf/Ref). */
	creditorReference?: string | undefined;
}

/** Return information (RtrInf). */
export interface Camt053ReturnInformation {
	/** Return reason code (Rsn/Cd). */
	reasonCode?: string | undefined;
	/** Return reason proprietary (Rsn/Prtry). */
	reasonProprietary?: string | undefined;
	/** Additional information (AddtlInf). */
	additionalInformation?: string[] | undefined;
}
