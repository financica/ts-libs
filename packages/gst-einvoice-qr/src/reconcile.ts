import { isSameLegalEntity, isUnregisteredPerson, isValidGstin } from "./gstin.js";
import type { GstEInvoiceQr } from "./types.js";

/** Fields of an invoice as your own pipeline read them (OCR, an LLM, a supplier feed). */
export interface ExtractedInvoiceFields {
	/** Supplier tax id as extracted. Compared against the QR's seller GSTIN. */
	supplierTaxId?: string | null;
	/** Buyer tax id as extracted. Compared against the QR's buyer GSTIN. */
	customerTaxId?: string | null;
	invoiceNumber?: string | null;
	/** `YYYY-MM-DD`. */
	invoiceDate?: string | null;
	/** Total including tax, in INR. */
	totalAmount?: number | null;
	lineCount?: number | null;
	/** IRN if your pipeline read it from the printed text rather than the QR. */
	irn?: string | null;
}

export type ReconcileStatus =
	/** Both sides present and equal. */
	| "match"
	/** Both sides present and different. */
	| "mismatch"
	/** Nothing extracted for this field, so nothing to compare. */
	| "not_extracted"
	/** Present on both sides, different, but explicably so. See `note`. */
	| "explained";

export interface ReconcileCheck {
	field: keyof ExtractedInvoiceFields;
	/** The attested value from the QR. */
	attested: string | number | null;
	/** What the extraction produced. */
	extracted: string | number | null;
	status: ReconcileStatus;
	/** Why an `explained` or `mismatch` verdict was reached, when it needs saying. */
	note?: string;
}

export interface ReconcileResult {
	checks: ReconcileCheck[];
	/** Checks that came back `mismatch`. Empty means nothing contradicted the QR. */
	mismatches: ReconcileCheck[];
	/** True when no check mismatched **and** at least one actually compared. */
	consistent: boolean;
	/** How many fields could be compared at all. */
	comparedCount: number;
}

/** Invoice numbers get spacing and separators mangled by OCR; compare loosely. */
const normalizeDocumentNumber = (value: string): string =>
	value.toUpperCase().replaceAll(/[\s\-/\\.]/g, "");

const compareStrings = (
	field: keyof ExtractedInvoiceFields,
	attested: string,
	extracted: string | null | undefined,
	equal: (a: string, b: string) => boolean,
	explain?: (a: string, b: string) => string | null,
): ReconcileCheck => {
	if (extracted === null || extracted === undefined || extracted.trim() === "") {
		return { field, attested, extracted: null, status: "not_extracted" };
	}
	const value = extracted.trim();
	if (equal(attested, value)) {
		return { field, attested, extracted: value, status: "match" };
	}
	const note = explain?.(attested, value) ?? null;
	return note === null
		? { field, attested, extracted: value, status: "mismatch" }
		: { field, attested, extracted: value, status: "explained", note };
};

const compareNumbers = (
	field: keyof ExtractedInvoiceFields,
	attested: number,
	extracted: number | null | undefined,
	tolerance: number,
): ReconcileCheck => {
	if (extracted === null || extracted === undefined || !Number.isFinite(extracted)) {
		return { field, attested, extracted: null, status: "not_extracted" };
	}
	return Math.abs(attested - extracted) <= tolerance
		? { field, attested, extracted, status: "match" }
		: { field, attested, extracted, status: "mismatch" };
};

export interface ReconcileOptions {
	/**
	 * Absolute tolerance in INR when comparing the total. Defaults to `0.01`,
	 * which absorbs rounding but not a real discrepancy.
	 */
	amountTolerance?: number;
	/**
	 * Compare invoice numbers after stripping spaces, dashes, slashes and dots.
	 * On by default: Indian invoice numbers are separator-heavy and extraction
	 * mangles them, while a genuine substitution still shows up.
	 */
	loose?: boolean;
}

/**
 * Compare a signed QR against what your own extraction produced for the same
 * document.
 *
 * The QR is an IRP-signed attestation of ten header fields, so once
 * {@link verifySignedQr} has confirmed the signature these values are stronger
 * evidence than anything read off the page. Use this to catch a bad OCR read,
 * a doctored PDF, or a QR lifted from a different invoice.
 *
 * It does **not** decide the outcome for you: a `mismatch` on `customerTaxId`
 * when you are a foreign buyer is expected (the QR will say `URP`), which is
 * why that specific case comes back `explained` rather than `mismatch`.
 */
export const reconcileWithQr = (
	qr: GstEInvoiceQr,
	extracted: ExtractedInvoiceFields,
	options: ReconcileOptions = {},
): ReconcileResult => {
	const { amountTolerance = 0.01, loose = true } = options;

	const documentNumberEqual = (a: string, b: string) =>
		loose ? normalizeDocumentNumber(a) === normalizeDocumentNumber(b) : a === b;

	const checks: ReconcileCheck[] = [
		compareStrings(
			"supplierTaxId",
			qr.sellerGstin,
			extracted.supplierTaxId,
			(a, b) => a === b.toUpperCase(),
			(a, b) => {
				const other = b.toUpperCase();
				return isValidGstin(other) && isSameLegalEntity(a, other)
					? "Same PAN, different state registration. An Indian business holds one GSTIN per state."
					: null;
			},
		),
		compareStrings(
			"customerTaxId",
			qr.buyerGstin,
			extracted.customerTaxId,
			(a, b) => a === b.toUpperCase(),
			(a) =>
				isUnregisteredPerson(a)
					? "The QR reports URP, so the IRP holds no GSTIN for the buyer. Expected for exports and unregistered buyers."
					: null,
		),
		compareStrings(
			"invoiceNumber",
			qr.documentNumber,
			extracted.invoiceNumber,
			documentNumberEqual,
		),
		compareStrings(
			"invoiceDate",
			qr.documentDate,
			extracted.invoiceDate,
			(a, b) => a === b.slice(0, 10),
		),
		compareNumbers(
			"totalAmount",
			qr.totalInvoiceValue,
			extracted.totalAmount,
			amountTolerance,
		),
		compareNumbers("lineCount", qr.itemCount, extracted.lineCount, 0),
		compareStrings("irn", qr.irn, extracted.irn, (a, b) => a === b.toLowerCase()),
	];

	const mismatches = checks.filter((check) => check.status === "mismatch");
	const comparedCount = checks.filter(
		(check) => check.status !== "not_extracted",
	).length;

	return {
		checks,
		mismatches,
		consistent: mismatches.length === 0 && comparedCount > 0,
		comparedCount,
	};
};
