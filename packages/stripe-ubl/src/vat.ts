import type { CompanyInvoiceLineVatType } from "@financica/scrada-client";

const normalizeTaxCategoryId = (value: unknown) => {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toUpperCase();
	return normalized.length > 0 ? normalized : null;
};

/**
 * Map a UBL/Peppol-style VAT category ID, a Stripe Tax `taxability_reason`,
 * and/or a numeric rate into a Scrada `vatType` code.
 *
 *   - Category `E` or any explicit exemption reason → 3 (Exempt)
 *   - Category `Z` → 2 (Zero-rated)
 *   - Otherwise: rate ≤ 0 → 2, rate > 0 → 1 (Standard)
 */
export const vatTypeFromCategoryOrRate = (params: {
	taxCategoryId: string | null;
	taxExemptionReason: string | null;
	rate: number;
}): CompanyInvoiceLineVatType => {
	const taxCategoryId = normalizeTaxCategoryId(params.taxCategoryId);
	if (taxCategoryId === "E") return 3;
	if (taxCategoryId === "Z") return 2;
	if (params.taxExemptionReason) return 3;
	return params.rate <= 0 ? 2 : 1;
};

/**
 * Stripe Tax `taxability_reason` values that correspond to Peppol VAT exempt
 * (category E / Scrada vatType 3). Includes reverse charge, customer/product
 * exemptions, and jurisdictions where Stripe Tax doesn't collect — none of
 * which should be reported as zero-rated (vatType 2).
 */
export const EXEMPT_TAXABILITY_REASONS = new Set([
	"customer_exempt",
	"product_exempt",
	"reverse_charge",
	"not_subject_to_tax",
	"not_collecting",
	"not_supported",
	"portion_product_exempt",
]);

export interface TaxAmountInfo {
	amount: number;
	taxability_reason?: string | null;
	tax_rate_percentage?: number | null;
}

/**
 * Map per-line tax info to a Scrada vatType.
 *
 * - When any tax entry has an exempt-category `taxability_reason`, the line
 *   is exempt (3).
 * - When any tax entry is `zero_rated`, the line is zero-rated (2).
 * - Otherwise falls through to {@link vatTypeFromCategoryOrRate}, which uses
 *   the rate to pick standard (1) vs zero-rated (2).
 */
export const resolveVatTypeFromTaxAmounts = (
	taxAmounts: TaxAmountInfo[],
	rate: number,
): CompanyInvoiceLineVatType => {
	for (const ta of taxAmounts) {
		if (!ta.taxability_reason) continue;
		if (EXEMPT_TAXABILITY_REASONS.has(ta.taxability_reason)) {
			return vatTypeFromCategoryOrRate({
				taxCategoryId: "E",
				taxExemptionReason: ta.taxability_reason,
				rate,
			});
		}
		if (ta.taxability_reason === "zero_rated") {
			return vatTypeFromCategoryOrRate({
				taxCategoryId: "Z",
				taxExemptionReason: null,
				rate,
			});
		}
	}
	return vatTypeFromCategoryOrRate({
		taxCategoryId: null,
		taxExemptionReason: null,
		rate,
	});
};
