/**
 * The block above the fee table: the two parties on the left, and a column of
 * label/value pairs on the right.
 */
import { longDateToIso, monthYearToIso } from "./dates.js";
import { StripeTaxInvoiceParseError } from "./errors.js";
import { indentedText, LABEL_COLUMN_SPLIT_X, leftText } from "./layout.js";
import { CURRENCY_HEADING_RE, REVERSE_CHARGE_RE } from "./patterns.js";
import type { InvoiceParty, TextRow } from "./types.js";

/** The right-hand label/value pairs, keyed by label as printed. */
export type HeaderFields = ReadonlyMap<string, string>;

const BILL_TO_RE = /^Bill to\s+(.*)$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Read the label/value column. The label is one run of text in the indented
 * column and the value is right-aligned after it, so everything past the first
 * run is the value.
 */
export const parseHeaderFields = (rows: readonly TextRow[]): HeaderFields => {
	const fields = new Map<string, string>();
	for (const row of rows) {
		const indented = row.items.filter((item) => item.x >= LABEL_COLUMN_SPLIT_X);
		const [label, ...rest] = indented;
		if (!label || rest.length === 0) continue;
		const value = rest
			.map((item) => item.str)
			.join(" ")
			.trim();
		if (value && !fields.has(label.str)) fields.set(label.str, value);
	}
	return fields;
};

/**
 * The tax registration printed for a party, with the label the invoice used.
 *
 * Which label appears depends on the Stripe entity and on where the customer is
 * registered — `Stripe VAT Number` in the EU, `Stripe GST Number` elsewhere —
 * so the prefix is matched rather than the whole label.
 */
const findTaxNumber = (
	fields: HeaderFields,
	prefix: string,
): { taxNumber: string | null; taxNumberLabel: string | null } => {
	for (const [label, value] of fields) {
		if (label.startsWith(`${prefix} `) && label.endsWith("Number")) {
			return { taxNumber: value, taxNumberLabel: label };
		}
	}
	return { taxNumber: null, taxNumberLabel: null };
};

/**
 * The reverse-charge note, printed beside the customer block.
 *
 * Two wordings are in circulation, and the legal paragraph at the foot of every
 * invoice mentions reverse charge whether or not the note applies — so this
 * looks only at the indented column above the fee table, where the note is.
 */
export const parseReverseChargeNote = (rows: readonly TextRow[]): string | null => {
	for (const row of rows) {
		const text = indentedText(row);
		if (REVERSE_CHARGE_RE.test(text)) return text;
	}
	return null;
};

/**
 * The two party blocks, both printed against the left margin: the issuing
 * Stripe entity first, then the customer under a `Bill to` line.
 */
export const parseParties = (
	rows: readonly TextRow[],
	fields: HeaderFields,
): { supplier: InvoiceParty; customer: InvoiceParty } => {
	const lines: string[] = [];
	for (const row of rows) {
		const text = leftText(row);
		// The fee table starts here; everything above it is the party blocks.
		if (CURRENCY_HEADING_RE.test(text)) break;
		if (text) lines.push(text);
	}

	const billToIndex = lines.findIndex((line) => BILL_TO_RE.test(line));
	const supplierLines = billToIndex === -1 ? lines : lines.slice(0, billToIndex);
	const customerLines = billToIndex === -1 ? [] : lines.slice(billToIndex);

	const toParty = (
		partyLines: readonly string[],
		name: string,
		taxPrefix: string,
	): InvoiceParty => {
		const addressLines = partyLines.filter((line) => !EMAIL_RE.test(line));
		const email = partyLines.find((line) => EMAIL_RE.test(line)) ?? null;
		return { name, addressLines, email, ...findTaxNumber(fields, taxPrefix) };
	};

	const supplierName = supplierLines[0] ?? "";
	const customerName = customerLines[0]?.match(BILL_TO_RE)?.[1]?.trim() ?? "";

	return {
		supplier: toParty(supplierLines.slice(1), supplierName, "Stripe"),
		customer: toParty(customerLines.slice(1), customerName, "Customer"),
	};
};

const requireField = (fields: HeaderFields, label: string): string => {
	const value = fields.get(label);
	if (!value) {
		throw new StripeTaxInvoiceParseError(
			"missing_field",
			`Stripe tax invoice has no ${label}`,
		);
	}
	return value;
};

const requireDate = (fields: HeaderFields, label: string): string => {
	const raw = requireField(fields, label);
	const iso = longDateToIso(raw);
	if (!iso) {
		throw new StripeTaxInvoiceParseError(
			"missing_field",
			`Stripe tax invoice has an unreadable ${label}: ${raw}`,
		);
	}
	return iso;
};

const requireMonth = (fields: HeaderFields, label: string): string => {
	const raw = requireField(fields, label);
	const iso = monthYearToIso(raw);
	if (!iso) {
		throw new StripeTaxInvoiceParseError(
			"missing_field",
			`Stripe tax invoice has an unreadable ${label}: ${raw}`,
		);
	}
	return iso;
};

/** The identifying fields, all of which a tax invoice always prints. */
export const parseIdentity = (fields: HeaderFields) => ({
	accountId: requireField(fields, "Account Number"),
	invoiceNumber: requireField(fields, "Invoice Number"),
	invoiceDate: requireDate(fields, "Invoice Date"),
	serviceMonth: requireMonth(fields, "Service Month"),
});
