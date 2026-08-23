import type { SupplierVatStatus } from "./party";
import type { UblLine, UblTaxCategory } from "./ubl/types";
import { normalizeString } from "./utils";

/**
 * Stripe Tax `taxability_reason` values that map to a VAT-exempt UBL category
 * (`E`). Reverse charge is handled separately (category `AE`).
 */
export const EXEMPT_TAXABILITY_REASONS = new Set([
	"customer_exempt",
	"product_exempt",
	"not_subject_to_tax",
	"not_collecting",
	"not_supported",
	"portion_product_exempt",
]);

/** Human-readable EN 16931 exemption reasons (BR-E-10 / BR-AE-10 / …). */
const EXEMPTION_REASON_TEXT: Record<string, string> = {
	reverse_charge: "Reverse charge",
	intra_community: "Intra-community supply",
	export: "Export outside the EU",
	customer_exempt: "Exempt based on customer status",
	product_exempt: "Exempt based on the supplied goods or services",
	portion_product_exempt: "Exempt based on the supplied goods or services",
	not_subject_to_tax: "Not subject to VAT",
	not_collecting: "VAT not collected",
	not_supported: "VAT not applicable",
};

export interface TaxAmountInfo {
	amount: number;
	taxability_reason?: string | null;
	tax_rate_percentage?: number | null;
}

const normalizeTaxCategoryId = (value: string | null | undefined): string | null =>
	normalizeString(value)?.toUpperCase() ?? null;

/**
 * Map an explicit UBL category hint, a Stripe `taxability_reason`, and/or a
 * numeric rate into a {@link UblTaxCategory}.
 *
 *   - Reverse charge          → `AE` (0%, with exemption reason)
 *   - Intra-community supply  → `K`  (0%, with exemption reason)
 *   - Export outside the EU   → `G`  (0%, with exemption reason)
 *   - Any other exempt reason → `E`  (0%, with exemption reason)
 *   - Category `Z` / rate ≤ 0 → `Z`  (zero-rated, 0%)
 *   - Otherwise               → `S`  (standard, the line's rate)
 */
export const taxCategoryFromReasonOrRate = (params: {
	taxCategoryId?: string | null;
	taxabilityReason: string | null;
	rate: number;
}): UblTaxCategory => {
	const categoryHint = normalizeTaxCategoryId(params.taxCategoryId);
	const reason = params.taxabilityReason;

	if (categoryHint === "AE" || reason === "reverse_charge") {
		return {
			id: "AE",
			percent: 0,
			exemptionReason: EXEMPTION_REASON_TEXT["reverse_charge"],
		};
	}
	if (categoryHint === "K" || reason === "intra_community") {
		return {
			id: "K",
			percent: 0,
			exemptionReason: EXEMPTION_REASON_TEXT["intra_community"],
		};
	}
	if (categoryHint === "G" || reason === "export") {
		return {
			id: "G",
			percent: 0,
			exemptionReason: EXEMPTION_REASON_TEXT["export"],
		};
	}
	if (categoryHint === "E" || (reason && EXEMPT_TAXABILITY_REASONS.has(reason))) {
		return {
			id: "E",
			percent: 0,
			exemptionReason:
				(reason ? EXEMPTION_REASON_TEXT[reason] : null) ?? "Exempt from VAT",
		};
	}
	if (categoryHint === "Z" || reason === "zero_rated" || params.rate <= 0) {
		return { id: "Z", percent: 0 };
	}
	return { id: "S", percent: params.rate };
};

/**
 * Resolve a {@link UblTaxCategory} from a line's Stripe tax info.
 *
 * Exempt / reverse-charge / zero-rated reasons take precedence over the rate;
 * otherwise the rate decides standard (`S`) vs zero-rated (`Z`).
 */
export const resolveTaxCategoryFromTaxAmounts = (
	taxAmounts: TaxAmountInfo[],
	rate: number,
): UblTaxCategory => {
	for (const ta of taxAmounts) {
		if (!ta.taxability_reason) continue;
		if (
			ta.taxability_reason === "reverse_charge" ||
			ta.taxability_reason === "zero_rated" ||
			EXEMPT_TAXABILITY_REASONS.has(ta.taxability_reason)
		) {
			return taxCategoryFromReasonOrRate({
				taxabilityReason: ta.taxability_reason,
				rate,
			});
		}
	}
	return taxCategoryFromReasonOrRate({ taxabilityReason: null, rate });
};

/**
 * BT-120 text for a small-business/franchise exemption, by supplier country.
 * Countries without a specific legal reference fall back to the generic text.
 */
const SMALL_BUSINESS_EXEMPTION_REASON_BY_COUNTRY: Record<string, string> = {
	BE: "Exempt — small business scheme (Article 56bis)",
};
const SMALL_BUSINESS_EXEMPTION_REASON = "Exempt — small business scheme";
const NOT_SUBJECT_EXEMPTION_REASON = "Seller not subject to VAT";

/**
 * When the supplier does not charge VAT, coerce every line to a non-charging
 * exempt category (`E`, 0%) with the appropriate BT-120 reason, so the document
 * reports no VAT regardless of what the upstream line tax data implied. Lines
 * are returned untouched for a `subject` supplier.
 */
export const coerceLinesForSupplierVatStatus = (
	lines: UblLine[],
	vatStatus: SupplierVatStatus,
	supplierCountryCode?: string | null,
): UblLine[] => {
	if (vatStatus === "subject") return lines;
	const country = normalizeString(supplierCountryCode)?.toUpperCase();
	const exemptionReason =
		vatStatus === "small_business"
			? ((country && SMALL_BUSINESS_EXEMPTION_REASON_BY_COUNTRY[country]) ??
				SMALL_BUSINESS_EXEMPTION_REASON)
			: NOT_SUBJECT_EXEMPTION_REASON;
	return lines.map((line) => ({
		...line,
		taxCategory: { id: "E", percent: 0, exemptionReason },
	}));
};
