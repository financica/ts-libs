/** Top-level result of parsing a CODA file. */
export interface CodaFile {
	/** One or more statements contained in the file. */
	statements: CodaStatement[];
}

/** A single bank statement within a CODA file. */
export interface CodaStatement {
	// ── Header record (0) ─────────────────────────────────────────────

	/** File creation date. */
	creationDate: Date;
	/** Bank identification number (3 digits). */
	bankId: number;
	/** Whether this is a duplicate file. */
	isDuplicate: boolean;
	/** File reference assigned by the bank. */
	fileReference?: string | undefined;
	/** Name of the addressee. Absent when the bank leaves the field blank. */
	addressee?: string | undefined;
	/** BIC of the bank holding the account. */
	bic?: string | undefined;
	/** Identification number of the Belgium-based account holder. */
	companyId?: string | undefined;
	/** Separate application code (5 positions). Absent when blank. */
	separateApplication?: string | undefined;
	/** Transaction reference (MT940 tag 20). */
	transactionReference?: string | undefined;
	/** Related reference (MT940 tag 21). */
	relatedReference?: string | undefined;
	/** CODA standard version number. */
	version: number;

	// ── Old balance record (1) ────────────────────────────────────────

	/** Account details. */
	account: CodaAccount;
	/** Paper statement sequence number. */
	paperStatementSequence: number;
	/** CODA statement sequence number. */
	codaStatementSequence: number;
	/** Name of the account holder (from old balance record). */
	accountHolderName?: string | undefined;
	/** Account description text. */
	accountDescription?: string | undefined;
	/** Opening balance. */
	oldBalance: CodaBalance;

	// ── New balance record (8) ────────────────────────────────────────

	/** Closing balance. Absent in empty files without record 8. */
	newBalance?: CodaBalance | undefined;

	// ── Movements ─────────────────────────────────────────────────────

	/** Transaction movements (records 2.x with linked 3.x). */
	movements: CodaMovement[];

	// ── Free communications (record 4) ────────────────────────────────

	/** Free communication texts. */
	freeCommunications: string[];

	// ── Trailer record (9) ────────────────────────────────────────────

	/** Sum of debit movement amounts. Absent when the file has no trailer record. */
	totalDebit?: number | undefined;
	/** Sum of credit movement amounts. Absent when the file has no trailer record. */
	totalCredit?: number | undefined;
}

/** Account number and currency information. */
export interface CodaAccount {
	/** Account number structure type. */
	structure: "belgian-bban" | "foreign-bban" | "belgian-iban" | "foreign-iban";
	/** Account number (BBAN or IBAN). */
	number: string;
	/** ISO currency code. */
	currency?: string | undefined;
	/** ISO country code (available for Belgian BBAN). */
	countryCode?: string | undefined;
}

/** A balance (old or new) with amount and date. */
export interface CodaBalance {
	/** Signed amount: positive for credit, negative for debit. */
	amount: number;
	/** Balance date. */
	date: Date;
}

/** A single transaction movement assembled from records 2.1, 2.2, 2.3. */
export interface CodaMovement {
	/** Continuous sequence number (groups related records). */
	sequenceNumber: number;
	/** Detail number within the sequence. */
	detailNumber: number;
	/** Bank reference number (informative). */
	bankReference: string;
	/** Signed amount: positive for credit, negative for debit. */
	amount: number;
	/** Value date. Undefined if not known (000000). */
	valueDate?: Date | undefined;
	/** Entry/booking date. */
	entryDate: Date;
	/** 8-digit transaction code broken into type/family/transaction/category. */
	transactionCode: CodaTransactionCode;
	/** Full communication text concatenated from all record parts. */
	communication: string;
	/** Whether the communication uses structured or free format. */
	communicationType: "structured" | "unstructured";
	/** 3-digit structured communication type code (e.g. 101, 102, 127). */
	structuredCommunicationType?: number | undefined;
	/** Paper statement sequence number. */
	paperStatementSequence: number;
	/** Globalisation code (1-9). Undefined if not set. */
	globalisationCode?: number | undefined;

	// ── From record 2.2 ──────────────────────────────────────────────

	/** Customer reference (up to 35 chars). */
	customerReference?: string | undefined;
	/** BIC of the counterparty's bank. */
	counterpartyBic?: string | undefined;
	/**
	 * R-transaction type.
	 * 1=reject, 2=return, 3=refund, 4=reversal, 5=cancellation.
	 */
	rTransactionType?: number | undefined;
	/** ISO reason return code for R-transactions. */
	rTransactionReason?: string | undefined;
	/** SEPA CategoryPurpose code. */
	categoryPurpose?: string | undefined;
	/** SEPA Purpose code. */
	purpose?: string | undefined;

	// ── From record 2.3 ──────────────────────────────────────────────

	/** Counterparty account number. */
	counterpartyAccountNumber?: string | undefined;
	/** Counterparty account currency. */
	counterpartyAccountCurrency?: string | undefined;
	/** Counterparty name. */
	counterpartyName?: string | undefined;

	// ── Linked information records ───────────────────────────────────

	/** Information records (3.x) linked to this movement. */
	information: CodaInformation[];
}

/** 8-digit CODA transaction code. */
export interface CodaTransactionCode {
	/** Type digit (0-9): simple, totalised by customer/bank, detail, etc. */
	type: number;
	/** Family code (01-89): broad category (transfers, cards, etc.). */
	family: number;
	/** Transaction code within the family. */
	transaction: number;
	/** Category code (000-999): additional detail. */
	category: number;
}

/** An information record group assembled from records 3.1, 3.2, 3.3. */
export interface CodaInformation {
	/** Continuous sequence number (matches the parent movement). */
	sequenceNumber: number;
	/** Detail number. */
	detailNumber: number;
	/** Bank reference. */
	bankReference: string;
	/** Transaction code. */
	transactionCode: CodaTransactionCode;
	/** Full communication text concatenated from all parts. */
	communication: string;
	/** Whether the communication uses structured or free format. */
	communicationType: "structured" | "unstructured";
	/** 3-digit structured communication type code. */
	structuredCommunicationType?: number | undefined;
}
