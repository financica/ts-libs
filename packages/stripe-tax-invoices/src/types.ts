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
	/** How many payments, refunds or adjustments the line covers. */
	count: number;
	/** What they were called, e.g. `card payments`, `other refund`. */
	kind: string;
	/** Their gross total, in the section's currency. Negative for refunds. */
	amount: number;
}

/** One row of the fee table. */
export interface FeeLine {
	/**
	 * The fee's name, verbatim — `Stripe Processing Fees`, `Tax Product Fees`,
	 * `Billing - Usage Fee`, `Fee Adjustment`. A footnote marker is part of the
	 * name as printed (`Refunded Fees †`); see `StripeTaxInvoice.footnotes`.
	 *
	 * The same name can appear on several lines of one section, each covering a
	 * different group of payments, so this does not identify a line.
	 */
	description: string;
	/** The line printed underneath the description, when there is one. */
	detail: string | null;
	/** `detail` read as a count and a volume, when it states one. */
	volume: FeeVolume | null;
	/** The fee charged, in the section's currency. Negative for an adjustment. */
	feeAmount: number;
	/** Tax on that fee. Zero under a reverse charge; `null` if not printed. */
	vatAmount: number | null;
	/** Position in the printed table, starting at zero. */
	lineOrder: number;
}

/** The totals printed under a fee table. */
export interface SectionTotals {
	/** `Stripe Fees` — the fee lines before tax. */
	stripeFees: number | null;
	/** `Total VAT` — tax across the fee lines. */
	totalVat: number | null;
	/** `Total` — fees plus tax. */
	total: number | null;
	/**
	 * `Debited from your Balance`, as printed: negative, because it is what
	 * Stripe took out of the balance. `total + debitedFromBalance` equals
	 * `amountDue`.
	 *
	 * `null` when the invoice does not print the row — which happens when
	 * nothing has been debited yet, and the note under the table says so in the
	 * future tense instead. `settlementNote` carries that wording.
	 */
	debitedFromBalance: number | null;
	/** `Amount Due` — what is still payable, normally zero. */
	amountDue: number | null;
}

/**
 * The fee table for one transfer currency, with the totals printed beneath it.
 *
 * An account that settles in several currencies is billed per currency, and
 * each currency gets its own table, its own totals, and normally its own page.
 * Amounts are never comparable across sections, so nothing here is summed for
 * you — `StripeTaxInvoice.totals` is the figure that spans them.
 */
export interface FeeSection {
	/** ISO 4217 code from the `Transfer Currency:` heading. */
	currency: string;
	lines: FeeLine[];
	/** The totals, in `currency`. */
	totals: SectionTotals;
	/**
	 * The currency the totals are restated in, from the `in USD` / `in EUR`
	 * column headings. Only printed when the section is not already in the
	 * currency Stripe reports the invoice in.
	 */
	convertedCurrency: string | null;
	/** The same totals in `convertedCurrency`, when that column is printed. */
	convertedTotals: SectionTotals | null;
}

/** One rate from the `Exchange Rates` table under the last fee section. */
export interface ExchangeRate {
	/** ISO 4217 code converted from. */
	from: string;
	/** ISO 4217 code converted to. */
	to: string;
	/** As printed, to full precision. */
	rate: number;
}

/** What the invoice comes to overall, in the currency Stripe reports it in. */
export interface InvoiceTotals {
	/** ISO 4217 code, from `Total fees in EUR` or the sole section. */
	currency: string;
	/** `Total fees in <currency>`. */
	fees: number | null;
	/** `Total VAT in <currency>`. */
	vat: number | null;
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
	/** Whether the invoice carries a reverse-charge note. */
	reverseCharge: boolean;
	/**
	 * That note, verbatim — `Reverse Charge VAT may be applicable.` and
	 * `VAT reverse charge applies.` are both in circulation.
	 */
	reverseChargeNote: string | null;
	/** One entry per transfer currency, in printed order. */
	sections: FeeSection[];
	/**
	 * What the invoice comes to across every section.
	 *
	 * Printed as `Total fees in EUR` when the invoice spans more than one
	 * currency. A single-currency invoice has nothing to convert and prints no
	 * such row, so these are that section's own totals.
	 */
	totals: InvoiceTotals;
	/** The `Exchange Rates` table, empty unless the invoice spans currencies. */
	exchangeRates: ExchangeRate[];
	/** How those rates were arrived at, e.g. `derived from average rate for period`. */
	exchangeRateBasis: string | null;
	/**
	 * The note under the table saying what happened to the money — whether the
	 * total has been debited from the Stripe balance, or is going to be.
	 * Several wordings are in circulation, so it is kept verbatim rather than
	 * reduced to a flag.
	 */
	settlementNote: string | null;
	/** Marked notes under the table, e.g. `† Stripe payment fees are not refunded…`. */
	footnotes: string[];
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
