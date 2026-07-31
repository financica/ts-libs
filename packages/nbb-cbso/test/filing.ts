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
		// Fixed assets: 21/28 = 21 + 22/27 + 28. The face of the balance sheet
		// carries these; the statement of fixed assets repeats the closing
		// figures under `(22/27)` and the like, and a filing reports the face.
		"20": { current: 0, previous: 0 },
		"21/28": { current: 40000, previous: 30000 },
		"21": { current: 0, previous: 0 },
		// 22/27 = 22 + 23 + 24 + 25 + 26 + 27, all of it furniture.
		"22/27": { current: 40000, previous: 30000 },
		"22": { current: 0, previous: 0 },
		"23": { current: 0, previous: 0 },
		"24": { current: 40000, previous: 30000 },
		"25": { current: 0, previous: 0 },
		"26": { current: 0, previous: 0 },
		"27": { current: 0, previous: 0 },
		"28": { current: 0, previous: 0 },

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
		// 10/11 = 110 + 111, and 13 = 130/1 + 132 + 133. The micro model prints
		// only the totals, but its own checks read the detail beneath them, so a
		// filing that reports the total alone fails at the NBB.
		"110": { current: 20000, previous: 20000 },
		"111": { current: 0, previous: 0 },
		"12": { current: 0, previous: 0 },
		"13": { current: 5000, previous: 5000 },
		// On 133, so that 130/1 = 1311 + 1312 + 1313 + 1319 holds at nil: the
		// checks run all the way down the breakdown, not just one level.
		"130/1": { current: 0, previous: 0 },
		"132": { current: 0, previous: 0 },
		"133": { current: 5000, previous: 5000 },
		// Last year's 20000 carried forward plus this year's 12000 result.
		"(14)": { current: 32000, previous: 20000 },
		"15": { current: 0, previous: 0 },
		"19": { current: 0, previous: 0 },
		"10/15": { current: 57000, previous: 45000 },

		"16": { current: 0, previous: 0 },
		// 17/49 = 17 + 42/48 + 492/3, and 42/48 down to its own components.
		"17/49": { current: 43000, previous: 35000 },
		"17": { current: 0, previous: 0 },
		"42/48": { current: 43000, previous: 35000 },
		"42": { current: 0, previous: 0 },
		"43": { current: 0, previous: 0 },
		"44": { current: 43000, previous: 35000 },
		"440/4": { current: 43000, previous: 35000 },
		"441": { current: 0, previous: 0 },
		"45": { current: 0, previous: 0 },
		"46": { current: 0, previous: 0 },
		"47/48": { current: 0, previous: 0 },
		"492/3": { current: 0, previous: 0 },
		"10/49": { current: 100000, previous: 80000 },
	},
	incomeStatement: {
		// 9900 = 70 - 60/61, then 9901 = 9900 less the operating charges, and
		// nothing financial or exceptional, so the result falls straight
		// through to 9905.
		"70": { current: 100000, previous: 84000 },
		"60/61": { current: 80000, previous: 67000 },
		"9900": { current: 20000, previous: 17000 },
		"62": { current: 8000, previous: 8000 },
		"630": { current: 0, previous: 0 },
		"631/4": { current: 0, previous: 0 },
		"635/8": { current: 0, previous: 0 },
		"640/8": { current: 0, previous: 0 },
		"649": { current: 0, previous: 0 },
		"66A": { current: 0, previous: 0 },
		"9901": { current: 12000, previous: 9000 },
		"75/76B": { current: 0, previous: 0 },
		"65/66B": { current: 0, previous: 0 },
		"9903": { current: 12000, previous: 9000 },
		"780": { current: 0, previous: 0 },
		"680": { current: 0, previous: 0 },
		"67/77": { current: 0, previous: 0 },
		"9904": { current: 12000, previous: 9000 },
		"789": { current: 0, previous: 0 },
		"689": { current: 0, previous: 0 },
		"9905": { current: 12000, previous: 9000 },
	},
	appropriation: {
		// 9906 = 9905 + last year's carried-forward result, all of it carried
		// forward again: no reserve movement and no distribution.
		"9906": { current: 32000, previous: 29000 },
		// The result carried forward into the exercise, which is its own rubric
		// in the appropriation account rather than last year's column of 14.
		"14P": { current: 20000, previous: 20000 },
		"791/2": { current: 0, previous: 0 },
		"691/2": { current: 0, previous: 0 },
		"794": { current: 0, previous: 0 },
		"694/7": { current: 0, previous: 0 },
	},
	notes: {
		// The statement of fixed assets foots to the face: 22/27 = 8199 + 8259
		// - 8329, and the closing cost is the opening cost plus the year's
		// acquisitions.
		"8199P": { current: 30000 },
		"8169": { current: 10000 },
		"8179": { current: 0 },
		"8199": { current: 40000 },
		"8259": { current: 0 },
		"8329": { current: 0 },
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
