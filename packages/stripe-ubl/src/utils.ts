export const normalizeString = (value: unknown): string | null => {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
};

/**
 * A Stripe invoice's freeform text as one note: the memo (`description`) and
 * the `footer`, joined. UBL has a single document-level note (BT-22), so both
 * travel in it; consumers importing Stripe invoices use the same join so the
 * stored description matches what a Peppol receiver would see.
 */
export const stripeInvoiceNote = (invoice: {
	description?: string | null;
	footer?: string | null;
}): string | null => {
	const parts = [
		normalizeString(invoice.description),
		normalizeString(invoice.footer),
	];
	const joined = parts.filter((part): part is string => part !== null).join("\n\n");
	return joined.length > 0 ? joined : null;
};

/**
 * Coerce a Stripe amount to a number.
 *
 * Stripe's JSON is not consistent about the type of its documented-integer
 * fields: some arrive as decimal strings (`unit_amount_excluding_tax`, every
 * `*_decimal`). The SDK's TypeScript types say `number` and do not coerce, so
 * a string reaches this code typed as a number. Reading such a field with a
 * `typeof === "number"` guard would silently yield 0 — on a tax amount that
 * means a UBL document that understates the VAT due, which is worse than
 * failing outright. Anything unparseable still falls back to 0.
 */
export const toNumber = (value: unknown): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
};
