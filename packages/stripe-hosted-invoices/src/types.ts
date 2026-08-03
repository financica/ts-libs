/**
 * Shapes returned by the hosted endpoints.
 *
 * These are intentionally permissive. The endpoints are undocumented, pinned to
 * a 2020 API version, and their bodies are third-party input: every field is
 * optional, money fields are normalized to `number | null` on the way out (see
 * `coerce.ts`), and unknown fields survive under the index signature rather
 * than being stripped. Consumers should treat a missing field as "the payload
 * did not say", never as zero.
 */

/** Fields Stripe may add or move; always preserved, never depended on. */
type Passthrough = { [key: string]: unknown };

/** A tax entry in `total_tax_amounts` / `total_taxes` or a line's `tax_amounts`. */
export type StripeTaxAmount = Passthrough & {
	amount?: number | null;
	inclusive?: boolean | null;
	tax_rate?:
		| string
		| (Passthrough & {
				id?: string | null;
				percentage?: number | null;
				display_name?: string | null;
		  })
		| null;
};

/**
 * One entry of a `discount_amounts` breakdown: how much a given discount took
 * off. `hosted_invoice_source` is Stripe's own classification of where the
 * discount applied (`item` for line-level, `invoice` for a document coupon),
 * which decides whether the amount is a line discount or a document allowance.
 */
export type StripeDiscountAmount = Passthrough & {
	amount?: number | null;
	discount?: string | (Passthrough & { id?: string | null }) | null;
	hosted_invoice_source?: string | null;
};

/** A reference Stripe sends either as a bare id or as an expanded object. */
export type StripeRef = string | (Passthrough & { id?: string | null }) | null;

/** A single invoice line item. */
export type StripeLineItem = Passthrough & {
	id?: string | null;
	description?: string | null;
	quantity?: number | null;
	amount?: number | null;
	/** Line total before its discounts; falls back to `amount` when absent. */
	subtotal?: number | null;
	unit_amount?: number | null;
	unit_amount_decimal?: string | null;
	type?: string | null;
	period?: (Passthrough & { start?: number | null; end?: number | null }) | null;
	tax_amounts?: StripeTaxAmount[] | null;
	discount_amounts?: StripeDiscountAmount[] | null;
};

/** Customer address block on an invoice. */
export type StripeAddress = Passthrough & {
	line1?: string | null;
	line2?: string | null;
	city?: string | null;
	state?: string | null;
	postal_code?: string | null;
	country?: string | null;
};

/** The `/v1/invoices/{id}/hosted` response. */
export type StripeHostedInvoice = Passthrough & {
	id?: string | null;
	number?: string | null;
	currency?: string | null;
	status?: string | null;
	description?: string | null;
	account_name?: string | null;
	account_country?: string | null;
	subtotal?: number | null;
	tax?: number | null;
	total?: number | null;
	created?: number | null;
	due_date?: number | null;
	customer?: StripeRef;
	customer_name?: string | null;
	customer_email?: string | null;
	customer_phone?: string | null;
	customer_address?: StripeAddress | null;
	invoice_pdf?: string | null;
	status_transitions?: (Passthrough & { finalized_at?: number | null }) | null;
	lines?:
		| (Passthrough & {
				data?: StripeLineItem[];
				has_more?: boolean | null;
				url?: string | null;
		  })
		| null;
	/** Document-level shipping charge, tax-inclusive when the rate is. */
	amount_shipping?: number | null;
	shipping_cost?: (Passthrough & { amount_tax?: number | null }) | null;
	total_tax_amounts?: StripeTaxAmount[] | null;
	total_discount_amounts?: StripeDiscountAmount[] | null;
	/** Document-level coupons. The hosted payload names it `discount_objects`. */
	discounts?: StripeRef[] | null;
	discount_objects?: StripeRef[] | null;
};

/** A single credit-note line. */
export type StripeCreditNoteLine = Passthrough & {
	id?: string | null;
	description?: string | null;
	quantity?: number | null;
	amount?: number | null;
	amount_excluding_tax?: number | null;
	unit_amount?: number | null;
	unit_amount_decimal?: string | null;
	unit_amount_excluding_tax?: number | null;
	type?: string | null;
	tax_amounts?: StripeTaxAmount[] | null;
	taxes?: StripeTaxAmount[] | null;
	discount_amounts?: StripeDiscountAmount[] | null;
};

/**
 * One entry of a credit note's `refunds[]`: which Stripe refund paid it out and
 * the slice of that refund belonging here. Reconciliation joins refund bank
 * transactions to credit notes on exactly this id, so it is preserved.
 */
export type StripeCreditNoteRefund = Passthrough & {
	refund?: StripeRef;
	amount_refunded?: number | null;
};

/** A credit note as returned by `/v1/invoices/{id}/credit_notes`. */
export type StripeCreditNote = Passthrough & {
	id: string;
	number?: string | null;
	currency?: string | null;
	status?: string | null;
	/** `pre_payment` reduces the amount due; `post_payment` is a refund. */
	type?: string | null;
	reason?: string | null;
	memo?: string | null;
	created?: number | null;
	effective_at?: number | null;
	subtotal?: number | null;
	subtotal_excluding_tax?: number | null;
	total?: number | null;
	total_excluding_tax?: number | null;
	amount_shipping?: number | null;
	shipping_cost?: (Passthrough & { amount_tax?: number | null }) | null;
	discount_amount?: number | null;
	/** Newer API versions name the breakdown `total_taxes`; older ones `tax_amounts`. */
	total_taxes?: StripeTaxAmount[] | null;
	tax_amounts?: StripeTaxAmount[] | null;
	pre_payment_amount?: number | null;
	post_payment_amount?: number | null;
	refund?: StripeRef;
	refunds?: StripeCreditNoteRefund[] | null;
	/** The credit note's own PDF. */
	pdf?: string | null;
	invoice?: StripeRef;
	lines?:
		| (Passthrough & { data?: StripeCreditNoteLine[]; has_more?: boolean | null })
		| null;
};

/** A credit note plus its fully-paginated lines. */
export type StripeCreditNoteWithLines = {
	creditNote: StripeCreditNote;
	lines: StripeCreditNoteLine[];
};

/** Why a hosted read failed. */
export type StripeHostedError =
	/** The URL is not a Stripe hosted invoice or receipt URL. */
	| { kind: "invalid_url" }
	/** `fetch` threw — DNS, TLS, timeout, offline. */
	| { kind: "network_error"; cause?: unknown }
	/** Stripe answered with a non-OK status. */
	| { kind: "http_error"; status: number; url: string }
	/** Stripe answered, but the body was not the shape this protocol requires. */
	| { kind: "invalid_response"; detail: string };

/** Standard result envelope. */
export type StripeHostedResult<T> =
	| ({ ok: true } & T)
	| { ok: false; error: StripeHostedError };
