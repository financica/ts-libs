import type { BiztaxReturnInput, FactInput } from "../../src/types.js";
import ay2026 from "../../src/taxonomies/ay2026-rcorp.js";

/**
 * The return of a small SRL for the year 2025, complete enough to pass every
 * formula assertion of be-tax 2026-04-30 in Arelle (`scripts/arelle-check.sh`).
 *
 * This is the contract of the mandatory chain: every subtotal the rules
 * recompute is stated, in the order the form reads. A mapping from a ledger
 * onto the return reproduces exactly this list of concepts.
 */

/** A PDF header is enough for the validator; Biztax wants a real document. */
export const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

const BELGIUM = { "d-origin:OriginDimension": "d-origin:BelgiumMember" };

export const FACTS: readonly FactInput[] = [
	// Taxable reserves, opening and closing (form 275.1, section I).
	{ concept: "LegalReserve", at: "start", value: 1860 },
	{ concept: "LegalReserve", at: "end", value: 1860 },
	{ concept: "AccumulatedProfitsLosses", at: "start", value: 12_400.5 },
	{ concept: "AccumulatedProfitsLosses", at: "end", value: 31_900.75 },
	{
		concept: "OtherReserves",
		at: "end",
		value: 5000,
		dimensions: { "d-ty:DescriptionTypedDimension": "Réserve de liquidation 2025" },
	},
	{ concept: "TaxableReserves", at: "start", value: 14_260.5 },
	{ concept: "TaxableReserves", at: "end", value: 38_760.75 },
	{ concept: "TaxableReservesAfterAdjustments", at: "start", value: 14_260.5 },
	{ concept: "TaxableReservedProfit", value: 24_500.25 },

	// Disallowed expenses (section II).
	{ concept: "NonDeductibleTaxes", value: 8000 },
	{ concept: "NonDeductibleRestaurantExpenses", value: 418.5 },
	{ concept: "DisallowedExpenses", value: 8418.5 },

	// Dividends paid (section III).
	{ concept: "OrdinaryDividends", value: 10_000 },
	{ concept: "TaxableDividendsPaid", value: 10_000 },
	{ concept: "MandatoryWithholdingTaxReturn", value: true },

	// Breakdown of the profit (section IV).
	{ concept: "FiscalResult", value: 42_918.75 },
	{ concept: "ShippingResultNotTonnageBased", value: 42_918.75 },
	{ concept: "RemainingFiscalResultAfterDeductionLimit", value: 42_918.75 },
	{ concept: "RemainingFiscalResultBeforeOriginDistribution", value: 42_918.75 },
	{ concept: "RemainingFiscalResultCITRN", value: 42_918.75, dimensions: BELGIUM },
	{
		concept: "CorrectedRemainingFiscalResultCITRN",
		value: 42_918.75,
		dimensions: BELGIUM,
	},
	{ concept: "BasketCalculationBasisCITRN", value: 42_918.75, dimensions: BELGIUM },
	{ concept: "CompensatedTaxLossesCITRN", value: 5000, dimensions: BELGIUM },
	{
		concept: "RemainingFiscalProfitCommonRateCITRN",
		value: 37_918.75,
		dimensions: BELGIUM,
	},
	{ concept: "RemainingFiscalProfitCommonRateCITRN", value: 37_918.75 },
	{ concept: "BasicTaxableAmountCommonRateCITRN", value: 37_918.75 },

	// Losses (section VIII).
	{ concept: "CompensableTaxLosses", value: -5000 },
	{ concept: "CompensatedTaxLossesIncludingTaxTreaty", value: 5000 },

	// Rate, prepayments, size of the company.
	{ concept: "FirstBracketReducedRate2000", value: true },
	{ concept: "Prepayments", value: 4000 },
	{ concept: "AssociatedCompanyCorporationCodeCurrentTaxPeriod", value: false },
	{ concept: "AnnualWorkForceAverageCorporationCodeCurrentTaxPeriod", value: 1 },
	{
		concept: "AnnualTurnoverExcludingVATCorporationCodeCurrentTaxPeriod",
		value: 182_000,
	},
	{ concept: "BalanceSheetTotalCorporationCodeCurrentTaxPeriod", value: 96_000 },

	// Documents.
	{ concept: "StatutoryAccounts", value: PDF },
	{ concept: "GeneralMeetingMinutesDecisions", value: PDF },
];

export const srl2025Return = (
	overrides: Partial<BiztaxReturnInput> = {},
): BiztaxReturnInput => ({
	taxonomy: ay2026,
	language: "fr",
	entity: {
		enterpriseNumber: "0766.280.697",
		name: "EXEMPLE SRL",
		legalForm: "610",
		address: { street: "Rue Haute", houseNumber: "16", postalCode: "1000" },
	},
	period: { startDate: "2025-01-01", endDate: "2025-12-31" },
	contact: { name: "Dupont", firstName: "Anne", email: "anne@example.be" },
	softwareVendor: "Financica",
	facts: FACTS,
	...overrides,
});
