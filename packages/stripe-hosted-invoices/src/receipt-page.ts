/**
 * Deterministic parser for Stripe's hosted receipt page — the document Stripe
 * emails after a payment or a refund, served from `pay.stripe.com` and
 * `dashboard.stripe.com/receipts/invoices/<token>`.
 *
 * The page is an email-layout table soup with no classes, ids or embedded JSON,
 * and neither the hosted-invoice payload nor the ephemeral-key API exposes the
 * refund: `/v1/invoices/{id}/hosted` still reports the invoice as fully paid.
 * The refunded amount and date exist nowhere else. So the markup is flattened
 * to text lines and the labelled rows are read positionally, which is stable
 * across the receipt layouts Stripe renders (label line, then value line).
 *
 * This is the one module that needs a DOM-ish parser. The URL matchers in
 * `./urls` stay dependency-free so a browser can use them to detect a pasted
 * link without pulling this in.
 */

import { parse } from "node-html-parser";

/** One credited line, sign-flipped to the positive amounts credit notes store. */
export type StripeReceiptCreditLine = {
	description: string;
	quantity: number;
	/** Unit price when the receipt prints one, else null (derive from the total). */
	unitAmount: number | null;
	amount: number;
};

/**
 * The credit note behind a refund, when the merchant issued one. Stripe prints
 * its number on each credited line (`(50CAA332-0004-CN-01) …`) and totals the
 * block under "Credited total"; a refund taken without a credit note says
 * "Total refunded without credit note" instead and has no block at all.
 */
type StripeReceiptCreditNote = {
	/** Stripe's credit-note number, e.g. `50CAA332-0004-CN-01`. */
	number: string | null;
	/** "Credited total" as a positive amount. */
	total: number | null;
	lines: StripeReceiptCreditLine[];
};

export type StripeReceiptPage = {
	/** `refund` when the receipt documents a refund rather than a payment. */
	kind: "payment" | "refund";
	/** The business that issued the receipt. */
	merchantName: string | null;
	/** Headline amount in major units — the refunded amount on a refund receipt. */
	amount: number | null;
	/** ISO date (YYYY-MM-DD) the refund/payment happened. */
	date: string | null;
	receiptNumber: string | null;
	invoiceNumber: string | null;
	/** The "Amount paid" row, used to calibrate the amount parse against the invoice. */
	amountPaid: number | null;
	/** Null when the refund was taken without a credit note. */
	creditNote: StripeReceiptCreditNote | null;
};

const MONTHS: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/** "January 8, 2025" → "2025-01-08". */
const parseReceiptDate = (text: string): string | null => {
	const match = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
	if (!match) return null;
	const [, monthName, dayText, yearText] = match;
	if (!monthName || !dayText || !yearText) return null;
	const month = MONTHS[monthName.toLowerCase()];
	if (!month) return null;
	return `${yearText}-${String(month).padStart(2, "0")}-${dayText.padStart(2, "0")}`;
};

/**
 * A money cell, e.g. `$348.99`, `-$5.00`, `1.234,56 EUR`, `1 234,56 kr`, `¥1,000`.
 *
 * Stripe formats amounts per the invoice locale, so both separator conventions
 * occur. Whichever of `.`/`,` comes last is the decimal point when exactly two
 * digits follow it, which is how every two-decimal currency renders; anything
 * else is a digit-group separator, which is how zero-decimal currencies render.
 * Three-decimal currencies (KWD, BHD, …) are read as grouped instead — the two
 * are indistinguishable in this markup — so callers cross-check the parse
 * against the invoice total. Returns null when the text holds no figure.
 */
export const parseReceiptAmount = (raw: string): number | null => {
	const text = raw.replace(/[\u00a0\u202f]/g, " ").trim();
	if (!/\d/.test(text)) return null;
	const negative = /^\s*[-−]/.test(text) || /\(\s*[^)]*\d[^)]*\)/.test(text);
	const digits = text.replace(/[^\d.,]/g, "");
	if (!digits) return null;

	const decimalAt = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
	const decimals = decimalAt === -1 ? "" : digits.slice(decimalAt + 1);
	const isDecimalSeparator = decimals.length === 2;

	const whole = (isDecimalSeparator ? digits.slice(0, decimalAt) : digits).replace(
		/[.,]/g,
		"",
	);
	const value = Number.parseFloat(
		isDecimalSeparator ? `${whole || "0"}.${decimals}` : whole,
	);
	if (!Number.isFinite(value)) return null;
	return negative ? -value : value;
};

/**
 * A line that holds nothing but an amount and its currency marker. Guards the
 * headline-amount scan against lines that merely contain digits — the receipt
 * number (`3364-2064`), the invoice number, the masked card (`- 5637`).
 */
const MONEY_LINE_RE =
	/^[-−(]?\s*[^\p{L}\d\s]{0,3}\s*\d[\d.,\u00a0\u202f ]*\s*(?:[^\p{L}\d\s]{1,3}|[A-Za-z]{2,4})?\s*\)?$/u;

/** The amount on a line, or null when the line is not a bare money cell. */
const moneyLineValue = (line: string): number | null =>
	MONEY_LINE_RE.test(line) ? parseReceiptAmount(line) : null;

/** Flatten the receipt markup to trimmed, non-empty text lines. */
const receiptTextLines = (html: string): string[] => {
	const root = parse(html);
	for (const element of root.querySelectorAll("style,script,head,title")) {
		element.remove();
	}
	return root.structuredText
		.split("\n")
		.map((line) =>
			line
				// Strip the invisible padding characters Stripe uses for the
				// email preheader (soft hyphens, zero-width joiners/spaces).
				.replace(/\u034f/gu, "")
				.replace(/[\u00ad\u200b-\u200d\u2060]/gu, "")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(Boolean);
};

/** Value line following a label line, e.g. "Receipt number" → "3364-2064". */
const valueAfterLabel = (lines: string[], label: string): string | null => {
	const index = lines.findIndex((line) => line.toLowerCase() === label);
	if (index === -1) return null;
	return lines[index + 1] ?? null;
};

/** `Qty -25` → -25. */
const QUANTITY_RE = /^Qty\s+(-?[\d.,]+)$/i;
/** `€3.00 each` → the unit price. */
const UNIT_PRICE_RE = /\seach$/i;
/** Credited lines carry the credit note's number: `(50CAA332-0004-CN-01) 25 …`. */
const CREDIT_NOTE_NUMBER_RE = /^\(([^)]+)\)\s*(.*)$/;
/**
 * The credited block runs from "Amount paid" to the credited totals. "Total
 * refunded (without credit note)" closes it too: that is the shape of a refund
 * taken without a credit note, which has no credited lines to read.
 */
const CREDIT_BLOCK_END_RE =
	/^(Credited (subtotal|total)|Adjusted invoice total|Total refunded)/i;

/**
 * The credit note a refund receipt documents, or null when the merchant refunded
 * without one ("Total refunded without credit note").
 *
 * The credited lines sit between the "Amount paid" row and the "Credited total"
 * row, printed like the invoice's own lines but with negative quantities and
 * amounts, each prefixed with the credit note's number in parentheses. Amounts
 * come back positive, the sign convention credit notes are stored in.
 */
const parseCreditedBlock = (lines: string[]): StripeReceiptCreditNote | null => {
	const paidIndex = lines.findIndex((line) => line.toLowerCase() === "amount paid");
	if (paidIndex === -1) return null;

	const creditLines: StripeReceiptCreditLine[] = [];
	const numbers = new Set<string>();
	let current: (StripeReceiptCreditLine & { seenAmount: boolean }) | null = null;
	let creditedTotal: number | null = null;

	const flush = () => {
		if (current?.seenAmount) creditLines.push(current);
		current = null;
	};

	// Skip the label and its value, then read until the credited totals.
	for (let index = paidIndex + 2; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (CREDIT_BLOCK_END_RE.test(line)) {
			flush();
			if (/^Credited total$/i.test(line)) {
				creditedTotal = Math.abs(moneyLineValue(lines[index + 1] ?? "") ?? 0);
			}
			continue;
		}

		const quantity = QUANTITY_RE.exec(line);
		if (quantity?.[1] && current) {
			current.quantity = Math.abs(parseReceiptAmount(quantity[1]) ?? 1) || 1;
			continue;
		}

		const money = moneyLineValue(line);
		if (money !== null && current) {
			if (UNIT_PRICE_RE.test(line)) current.unitAmount = Math.abs(money);
			// The first bare money line after the description is the line total.
			else if (!current.seenAmount) {
				current.amount = Math.abs(money);
				current.seenAmount = true;
			}
			continue;
		}
		if (money !== null) continue;

		// Anything else starts a new credited line.
		flush();
		const numbered = CREDIT_NOTE_NUMBER_RE.exec(line);
		if (numbered?.[1]) numbers.add(numbered[1].trim());
		current = {
			description: (numbered?.[2] || line).trim(),
			quantity: 1,
			unitAmount: null,
			amount: 0,
			seenAmount: false,
		};
	}
	flush();

	if (creditLines.length === 0 && creditedTotal === null) return null;
	return {
		// Several credit notes on one receipt leave the number ambiguous.
		number: numbers.size === 1 ? (numbers.values().next().value ?? null) : null,
		total: creditedTotal,
		lines: creditLines.map(({ description, quantity, unitAmount, amount }) => ({
			description,
			quantity,
			unitAmount,
			amount,
		})),
	};
};

/**
 * Parse a Stripe hosted receipt page.
 *
 * A refund receipt leads with "Refund from <merchant>", the refunded amount and
 * a "Refunded on <date>" row; a payment receipt leads with the paid amount and
 * a "Paid <date>" row. The headline amount is the money line immediately above
 * that date row, so partial refunds report the amount of *this* refund rather
 * than the invoice total or the cumulative "Total refunded" figure.
 */
export const parseStripeReceiptPage = (html: string): StripeReceiptPage => {
	const lines = receiptTextLines(html);

	const dateIndex = lines.findIndex((line) =>
		/^(Refunded on|Paid on|Paid)\b/i.test(line),
	);
	const dateLine = dateIndex === -1 ? null : (lines[dateIndex] ?? null);
	const kind = dateLine && /^Refunded/i.test(dateLine) ? "refund" : "payment";

	// The money line directly above the date row is this receipt's amount.
	let amount: number | null = null;
	for (let index = dateIndex - 1; index >= 0; index -= 1) {
		const candidate = moneyLineValue(lines[index] ?? "");
		if (candidate !== null) {
			amount = candidate;
			break;
		}
	}

	const heading = lines.find((line) =>
		/^(Refund|Receipt|Payment) from\s+.+/i.test(line),
	);

	return {
		kind,
		merchantName:
			/^(?:Refund|Receipt|Payment) from\s+(.+)$/i
				.exec(heading ?? "")?.[1]
				?.trim() ?? null,
		amount,
		date: dateLine ? parseReceiptDate(dateLine) : null,
		receiptNumber:
			valueAfterLabel(lines, "receipt number") ??
			lines
				.map((line) => /^Receipt #(\S+)/.exec(line)?.[1])
				.find((value) => value != null) ??
			null,
		invoiceNumber: valueAfterLabel(lines, "invoice number"),
		amountPaid: moneyLineValue(valueAfterLabel(lines, "amount paid") ?? ""),
		creditNote: parseCreditedBlock(lines),
	};
};
