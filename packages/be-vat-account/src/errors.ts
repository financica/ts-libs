/** Why a document could not be read as a VAT account statement. */
export type ParseErrorCode =
	/** No `PFORM671` marker and no `Extrait de compte TVA` / `Uittreksel btw-rekening` title. */
	| "not_a_vat_statement"
	/** The document is recognisably a statement, but a required field is missing. */
	| "missing_field";

/** Every error this package throws. */
export class VatAccountParseError extends Error {
	readonly code: ParseErrorCode;

	constructor(code: ParseErrorCode, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "VatAccountParseError";
		this.code = code;
	}
}
