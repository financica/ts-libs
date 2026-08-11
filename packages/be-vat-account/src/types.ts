/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

/** The language the statement was issued in. */
export type StatementLanguage = "fr" | "nl";

/**
 * Which of the two layouts the statement uses.
 *
 * - `pform671` — Q4 2022 onwards. Carries a `PFORM671` marker and a form
 *   reference, dates as `DD.MM.YYYY`, situation lines with a month name.
 * - `legacy` — before Q4 2022. No marker, dates as `DD/MM/YYYY`, the VAT number
 *   printed with dots, situation lines as `MM/YYYY`.
 */
export type StatementLayout = "pform671" | "legacy";

/** What the closing balance means for the taxpayer. */
export type BalanceType = "to_pay" | "to_reimburse" | "to_carry_forward" | "zero";

export interface StatementHeader {
	/** Enterprise number, ten digits, no `BE` prefix and no dots. */
	vatNumber: string;
	/**
	 * The administration's reference for this document.
	 *
	 * On a `pform671` statement this is the printed
	 * `BE…/PFORM671/…/…` reference. Legacy statements carry no reference, so a
	 * stable synthetic one is derived from the VAT number and situation date —
	 * enough to deduplicate imports, but not a value the administration knows.
	 */
	formReference: string;
	/** UUID printed on the document, when it has one. */
	documentUuid: string | null;
	/** The date the statement was drawn up. */
	statementDate: IsoDate;
	/** The date the reported position is stated as of. */
	situationDate: IsoDate;
	/** The start of the period the detailed entries cover. */
	periodStartDate: IsoDate;
	language: StatementLanguage;
	layout: StatementLayout;
	balanceType: BalanceType;
	/** Always non-negative; `balanceType` carries the direction. */
	balanceAmount: number;
	/** The `+++000/0000/00000+++` payment reference, when one is printed. */
	structuredCommunication: string | null;
}

/**
 * What a row in the detailed table represents.
 *
 * - `transaction` — a dated movement (a return, a payment, interest, a fine).
 * - `situation` — the running position at the end of a month.
 * - `previous_balance` — the carried-forward opening position.
 */
export type EntryType = "transaction" | "situation" | "previous_balance";

export interface StatementEntry {
	entryType: EntryType;
	/** The date the administration recorded the movement. */
	registrationDate: IsoDate | null;
	/** Single-letter operation code, optionally suffixed with `-MM.YYYY`. */
	operationCode: string | null;
	/** The date the movement takes effect, which drives interest. */
	effectiveDate: IsoDate | null;
	/** Amount in the taxpayer's favour, i.e. owed by the administration. */
	amountInFavor: number | null;
	/** Amount owed by the taxpayer to the administration. */
	amountOwed: number | null;
	/** Month `1`–`12`, on `situation` rows only. */
	situationMonth: number | null;
	/** Four-digit year, on `situation` rows only. */
	situationYear: number | null;
	/** Position in the printed table, starting at zero. */
	lineOrder: number;
}

export interface VatAccountStatement {
	header: StatementHeader;
	entries: StatementEntry[];
}

/** A positioned run of text lifted out of the PDF. */
export interface TextItem {
	str: string;
	x: number;
	y: number;
}

/** Text items sharing a baseline, ordered left to right. */
export interface TextRow {
	y: number;
	items: TextItem[];
}
