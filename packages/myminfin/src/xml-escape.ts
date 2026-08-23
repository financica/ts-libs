// Minimal XML text/attribute escaping and formatting helpers shared by the
// document generators. Kept internal (not re-exported from the package index):
// the generators own their serialization and callers should never assemble raw
// XML by hand.

/** Namespace of the InputCommon schema shared by every MyMinFin upload format. */
export const COMMON_NS = "http://www.minfin.fgov.be/InputCommon";

export function escapeXmlText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeXmlAttr(value: string): string {
	return escapeXmlText(value).replace(/"/g, "&quot;");
}

/**
 * Format a monetary amount as the schema's fixed two-decimal string.
 *
 * @param label       Used in error messages, e.g. "VAT grid amount".
 * @param nonNegative Reject negative values (PositiveAmount_Type).
 */
export function formatAmount(
	value: number,
	{ label, nonNegative = false }: { label: string; nonNegative?: boolean },
): string {
	if (!Number.isFinite(value)) {
		throw new Error(`${label} must be finite, received ${value}`);
	}
	if (nonNegative && value < 0) {
		throw new Error(
			`${label}s must be non-negative (PositiveAmount_Type), received ${value}`,
		);
	}
	return value.toFixed(2);
}

/** Throw unless `sequenceNumber` is a positive integer. */
export function assertSequenceNumber(sequenceNumber: number): void {
	if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
		throw new Error(
			`sequenceNumber must be a positive integer, received ${sequenceNumber}`,
		);
	}
}
