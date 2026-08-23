/**
 * Normalizes raw hosted-endpoint bodies into the {@link StripeHostedInvoice} /
 * {@link StripeCreditNote} shapes.
 *
 * This is deliberately not schema validation. The endpoints are undocumented,
 * so rejecting an unexpected shape would break the import for a payload that is
 * merely unfamiliar — and every field a consumer reads is already optional. The
 * one transformation that must happen is money: Stripe sends documented-integer
 * fields as decimal strings often enough that treating them as absent silently
 * understates a total. So every known money field is coerced through
 * {@link optionalAmount}, everything else passes through untouched, and the only
 * rejection is a body that is not an object at all.
 */

import { isRecord, optionalAmount } from "./internal.js";
import type {
	StripeCreditNote,
	StripeCreditNoteLine,
	StripeDiscountAmount,
	StripeHostedInvoice,
	StripeLineItem,
	StripeTaxAmount,
} from "./types.js";

/** Rewrite the listed keys of a record through {@link optionalAmount}. */
const coerceAmounts = <T extends Record<string, unknown>>(
	record: Record<string, unknown>,
	keys: readonly string[],
): T => {
	const out: Record<string, unknown> = { ...record };
	for (const key of keys) {
		if (key in out) out[key] = optionalAmount(out[key]);
	}
	return out as T;
};

/** Map over a value that should be an array, dropping non-object entries. */
const coerceArray = <T>(
	value: unknown,
	map: (entry: Record<string, unknown>) => T,
): T[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	return value.filter(isRecord).map(map);
};

const coerceTaxAmount = (raw: Record<string, unknown>): StripeTaxAmount =>
	coerceAmounts<StripeTaxAmount>(raw, ["amount"]);

const coerceDiscountAmount = (raw: Record<string, unknown>): StripeDiscountAmount =>
	coerceAmounts<StripeDiscountAmount>(raw, ["amount"]);

const LINE_AMOUNT_KEYS = ["amount", "subtotal", "unit_amount"] as const;

const coerceLineItem = (raw: Record<string, unknown>): StripeLineItem => {
	const line = coerceAmounts<StripeLineItem>(raw, LINE_AMOUNT_KEYS);
	const taxAmounts = coerceArray(raw["tax_amounts"], coerceTaxAmount);
	const discountAmounts = coerceArray(raw["discount_amounts"], coerceDiscountAmount);
	if (taxAmounts) line.tax_amounts = taxAmounts;
	if (discountAmounts) line.discount_amounts = discountAmounts;
	return line;
};

const INVOICE_AMOUNT_KEYS = ["subtotal", "tax", "total", "amount_shipping"] as const;

/**
 * Normalize a `/v1/invoices/{id}/hosted` body. Returns null when the body is
 * not an object, which is the only shape this protocol cannot proceed from.
 */
export const coerceHostedInvoice = (raw: unknown): StripeHostedInvoice | null => {
	if (!isRecord(raw)) return null;
	const invoice = coerceAmounts<StripeHostedInvoice>(raw, INVOICE_AMOUNT_KEYS);

	const totalTaxAmounts = coerceArray(raw["total_tax_amounts"], coerceTaxAmount);
	if (totalTaxAmounts) invoice.total_tax_amounts = totalTaxAmounts;

	const totalDiscountAmounts = coerceArray(
		raw["total_discount_amounts"],
		coerceDiscountAmount,
	);
	if (totalDiscountAmounts) invoice.total_discount_amounts = totalDiscountAmounts;

	if (isRecord(raw["shipping_cost"])) {
		invoice.shipping_cost = coerceAmounts(raw["shipping_cost"], ["amount_tax"]);
	}
	if (isRecord(raw["lines"])) {
		const data = coerceArray(raw["lines"]["data"], coerceLineItem);
		invoice.lines = { ...raw["lines"], ...(data ? { data } : {}) };
	}
	return invoice;
};

/** Normalize a page of `/v1/invoices/{id}/lines`. */
export const coerceLinesPage = (
	raw: unknown,
): { data: StripeLineItem[]; has_more: boolean } | null => {
	if (!isRecord(raw)) return null;
	return {
		data: coerceArray(raw["data"], coerceLineItem) ?? [],
		has_more: raw["has_more"] === true,
	};
};

const CREDIT_NOTE_LINE_AMOUNT_KEYS = [
	"amount",
	"amount_excluding_tax",
	"unit_amount",
	"unit_amount_excluding_tax",
] as const;

const coerceCreditNoteLine = (raw: Record<string, unknown>): StripeCreditNoteLine => {
	const line = coerceAmounts<StripeCreditNoteLine>(raw, CREDIT_NOTE_LINE_AMOUNT_KEYS);
	const taxAmounts = coerceArray(raw["tax_amounts"], coerceTaxAmount);
	const taxes = coerceArray(raw["taxes"], coerceTaxAmount);
	const discountAmounts = coerceArray(raw["discount_amounts"], coerceDiscountAmount);
	if (taxAmounts) line.tax_amounts = taxAmounts;
	if (taxes) line.taxes = taxes;
	if (discountAmounts) line.discount_amounts = discountAmounts;
	return line;
};

const CREDIT_NOTE_AMOUNT_KEYS = [
	"subtotal",
	"subtotal_excluding_tax",
	"total",
	"total_excluding_tax",
	"amount_shipping",
	"discount_amount",
	"pre_payment_amount",
	"post_payment_amount",
] as const;

/**
 * Normalize one entry of the credit-note list.
 *
 * Requires a string `id`: it is the document's identity, the dedupe key on
 * import, and the only field with no sensible fallback. Returns null without
 * it, so one unreadable credit note is skipped rather than discarding the rest.
 */
export const coerceCreditNote = (raw: unknown): StripeCreditNote | null => {
	if (!isRecord(raw) || typeof raw["id"] !== "string" || raw["id"].length === 0) {
		return null;
	}
	const creditNote = coerceAmounts<StripeCreditNote>(raw, CREDIT_NOTE_AMOUNT_KEYS);

	const totalTaxes = coerceArray(raw["total_taxes"], coerceTaxAmount);
	const taxAmounts = coerceArray(raw["tax_amounts"], coerceTaxAmount);
	if (totalTaxes) creditNote.total_taxes = totalTaxes;
	if (taxAmounts) creditNote.tax_amounts = taxAmounts;

	const refunds = coerceArray(raw["refunds"], (entry) =>
		coerceAmounts(entry, ["amount_refunded"]),
	);
	if (refunds) creditNote.refunds = refunds;

	if (isRecord(raw["shipping_cost"])) {
		creditNote.shipping_cost = coerceAmounts(raw["shipping_cost"], ["amount_tax"]);
	}
	if (isRecord(raw["lines"])) {
		const data = coerceArray(raw["lines"]["data"], coerceCreditNoteLine);
		creditNote.lines = { ...raw["lines"], ...(data ? { data } : {}) };
	}
	return creditNote;
};

/** Normalize a page of `/v1/credit_notes/{id}/lines`. */
export const coerceCreditNoteLinesPage = (
	raw: unknown,
): { data: StripeCreditNoteLine[]; has_more: boolean } | null => {
	if (!isRecord(raw)) return null;
	return {
		data: coerceArray(raw["data"], coerceCreditNoteLine) ?? [],
		has_more: raw["has_more"] === true,
	};
};
