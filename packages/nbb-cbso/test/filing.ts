import type { NbbFilingInput, RubricAmounts } from "../src/index.js";

/**
 * A complete micro filing for a company without capital, used as the starting
 * point for tests that vary one thing at a time.
 *
 * The figures satisfy the statutory arithmetic, which is the point: every
 * subtotal is the sum of the components also reported, and total assets equal
 * total liabilities. A fixture that merely looked plausible would let the
 * validator's own bugs pass unnoticed.
 */
export const MICRO_FILING: NbbFilingInput = {
	model: "m87",
	language: "fr",
	entity: {
		enterpriseNumber: "0925590628",
		name: "CALYX WORKS",
		legalForm: "m610",
		address: {
			street: "CHAUSSEE DE TIRLEMONT",
			houseNumber: "22",
			postbox: "7",
			postalCode: "5000",
		},
	},
	identification: {
		exercise: { startDate: "2025-01-01", endDate: "2025-12-31" },
		previousExercise: { startDate: "2024-01-01", endDate: "2024-12-31" },
		generalMeetingDate: "2026-06-15",
		previousPeriodDataUnchanged: true,
		pageCount: 12,
	},
	producer: { name: "Financica" },
	balanceSheet: {
		// Fixed assets. 21/28 is reported without its own breakdown, which the
		// micro model allows.
		"20": { current: 0, previous: 0 },
		"21/28": { current: 40000, previous: 30000 },

		// Current assets: 29/58 = 29 + 3 + 40/41 + 50/53 + 54/58 + 490/1
		"29": { current: 0, previous: 0 },
		"3": { current: 5000, previous: 4000 },
		"30/36": { current: 5000, previous: 4000 },
		"37": { current: 0, previous: 0 },
		"40/41": { current: 15000, previous: 12000 },
		"40": { current: 15000, previous: 12000 },
		"41": { current: 0, previous: 0 },
		"50/53": { current: 0, previous: 0 },
		"54/58": { current: 40000, previous: 34000 },
		"490/1": { current: 0, previous: 0 },
		"29/58": { current: 60000, previous: 50000 },

		// 20/58 = 20 + 21/28 + 29/58
		"20/58": { current: 100000, previous: 80000 },

		// Equity: 10/15 = 10/11 + 12 + 13 + (14) + 15 - 19
		"10/11": { current: 20000, previous: 20000 },
		"12": { current: 0, previous: 0 },
		"13": { current: 5000, previous: 5000 },
		"(14)": { current: 30000, previous: 20000 },
		"15": { current: 0, previous: 0 },
		"19": { current: 0, previous: 0 },
		"10/15": { current: 55000, previous: 45000 },

		"16": { current: 0, previous: 0 },
		"17/49": { current: 45000, previous: 35000 },
		"10/49": { current: 100000, previous: 80000 },
	},
	incomeStatement: {
		"9905": { current: 12000, previous: 9000 },
	},
	appropriation: {
		"9906": { current: 12000, previous: 9000 },
	},
	valuationRules:
		"Les immobilisations sont amorties linéairement sur leur durée d'utilité estimée.",
};

/** The filing with some balance sheet rubrics replaced, for failure cases. */
export function withBalanceSheet(overrides: RubricAmounts): NbbFilingInput {
	return {
		...MICRO_FILING,
		balanceSheet: { ...MICRO_FILING.balanceSheet, ...overrides },
	};
}
