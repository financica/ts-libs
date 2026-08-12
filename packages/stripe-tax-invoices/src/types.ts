/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

/** A calendar month as `YYYY-MM`. */
export type IsoMonth = string;

/** One of the two parties printed on the invoice. */
export interface InvoiceParty {
	/** Legal name, as printed. */
	name: string;
	/** Everything printed under the name, in order, minus the email. */
	addressLines: string[];
	/**
	 * The tax registration printed for this party, e.g. `IE 3206488LH`. Spacing
	 * is left exactly as printed.
	 */
	taxNumber: string | null;
	/**
	 * What the document calls that registration — `Stripe VAT Number`,
	 * `Customer GST Number`, and so on. Which one appears depends on the Stripe
	 * entity that issued the invoice and on where the customer is registered.
	 */
	taxNumberLabel: string | null;
	/** Contact address, when the party block prints one. */
	email: string | null;
}

/**
 * The volume behind a fee line, read off its description line — e.g.
 * `17 card payments totaling €1,882.76`.
 *
 * This is the only place the invoice states what was actually processed, which
 * is what lets a month's fees be tied back to the payments that produced them.
 */
export interface FeeVolume {
	/** How many payments the line covers. */
	count: number;
	/** What they were called, e.g. `card payments`, `other payment`. */
	kind: string;
	/** Their gross total, in the section's currency. */
	amount: number;
}

/** One row of the fee table. */
export interface FeeLine {
	/**
	 * The fee's name. Until mid-2026 these were categories (`Stripe Processing
	 * Fees`, `Invoicing`); newer invoices name the product itself (`Card
	 * payments - Stripe fee`).
	 */
	description: string;
	/** The line printed underneath the description, when there is one. */
	detail: string | null;
	/** `detail` read as a payment count and volume, when it states one. */
	volume: FeeVolume | null;
	/** The fee charged, in the section's currency. */
	feeAmount: number;
	/** Tax on that fee. Zero under a reverse charge; `null` if not printed. */
	vatAmount: number | null;
	/** Position in the printed table, starting at zero. */
	lineOrder: number;
}

/**
 * The fee table for one transfer currency, with the totals printed beneath it.
 *
 * An account that settles in several currencies is billed per currency, and
 * each currency gets its own table and its own totals. Amounts are never
 * comparable across sections, so nothing here is summed for you.
 */
export interface FeeSection {
	/** ISO 4217 code from the `Transfer Currency:` heading. */
	currency: string;
	lines: FeeLine[];
	/** `Stripe Fees` — the fee lines before tax. */
	stripeFees: number | null;
	/** `Total VAT` — tax across the fee lines. */
	totalVat: number | null;
	/** `Total` — fees plus tax. */
	total: number | null;
	/**
	 * `Debited from your Balance`, as printed: negative, because it is what
	 * Stripe already took out of the balance. `total + debitedFromBalance`
	 * equals `amountDue`.
	 *
	 * Invoices from mid-2026 onwards omit the row and state in prose that the
	 * balance will be debited, leaving this `null`.
	 */
	debitedFromBalance: number | null;
	/** `Amount Due` — what is still payable, normally zero. */
	amountDue: number | null;
}

/** A Stripe tax invoice: what Stripe charged you for a month, and the tax on it. */
export interface StripeTaxInvoice {
	/** e.g. `BQCMEBS7-2025-08`. Unique per account and service month. */
	invoiceNumber: string;
	/** The Stripe account billed, e.g. `acct_1RayACDEBQCMEBs7`. */
	accountId: string;
	/** The date the invoice was issued. */
	invoiceDate: IsoDate;
	/** The month the fees were incurred in. */
	serviceMonth: IsoMonth;
	/** The Stripe entity that issued the invoice. */
	supplier: InvoiceParty;
	/** The billed business. */
	customer: InvoiceParty;
	/** Whether the invoice carries the reverse-charge note. */
	reverseCharge: boolean;
	/** One entry per transfer currency, in printed order. */
	sections: FeeSection[];
}

/** A positioned run of text lifted out of the PDF. */
export interface TextItem {
	str: string;
	/** Left edge, in PDF points. */
	x: number;
	/** Right edge, in PDF points. Columns on this invoice are right-aligned. */
	right: number;
	y: number;
}

/** Text items sharing a baseline, ordered left to right. */
export interface TextRow {
	y: number;
	items: TextItem[];
}
