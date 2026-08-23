/** Why a document could not be read as a Stripe tax invoice. */
export type ParseErrorCode =
	/** No `Tax Invoice` title, no `acct_…` account number, no fee table. */
	| "not_a_stripe_tax_invoice"
	/** The document is recognisably one, but a required field is missing. */
	| "missing_field";

/**
 * The error this package raises when a document is not a readable Stripe tax
 * invoice. Failures in the PDF reader itself (unpdf) are not wrapped and
 * propagate as thrown.
 */
export class StripeTaxInvoiceParseError extends Error {
	readonly code: ParseErrorCode;
	override readonly cause?: unknown;

	constructor(code: ParseErrorCode, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "StripeTaxInvoiceParseError";
		this.code = code;
		this.cause = options?.cause;
	}
}
