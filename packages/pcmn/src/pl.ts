/**
 * Belgian PCMN (Plan Comptable Minimum Normalisé) profit-and-loss taxonomy: the
 * 2-digit account classes of the statutory income statement and the economic
 * categories the Financica suite groups them into. This is the single shared
 * definition: financica aggregates its real ledger through it, and
 * financica-plan projects the same categories, so a plan and its actuals
 * reconcile line for line.
 */

/** Economic P&L buckets, aligned to the Belgian statutory income statement. */
export type PlCategory =
	| "revenue"
	| "goods"
	| "services"
	| "personnel"
	| "depreciation"
	| "otherCharges"
	| "otherIncome"
	| "financialCharges"
	| "financialIncome"
	| "exceptionalCharges"
	| "exceptionalIncome";

/** Natural balance side: charges (6x) are debit, income (7x) is credit. */
export type PlSide = "debit" | "credit";

export interface PcmnPlClass {
	/** 2-digit PCMN class, e.g. "60". */
	readonly code: string;
	readonly category: PlCategory;
	readonly side: PlSide;
	/** French rubric of the Belgian income statement. */
	readonly label: string;
}

/**
 * The compared P&L classes (charges 60-66, income 70-76). Classes outside this
 * set (71 stock variation, 72 own work capitalised, 73 subsidies, ...) are not
 * mapped: both apps leave them out of the compared categories.
 */
export const PCMN_PL_CLASSES: Readonly<Record<string, PcmnPlClass>> = {
	"60": {
		code: "60",
		category: "goods",
		side: "debit",
		label: "Approvisionnements et marchandises",
	},
	"61": {
		code: "61",
		category: "services",
		side: "debit",
		label: "Services et biens divers",
	},
	"62": {
		code: "62",
		category: "personnel",
		side: "debit",
		label: "Rémunérations, charges sociales et pensions",
	},
	"63": {
		code: "63",
		category: "depreciation",
		side: "debit",
		label: "Amortissements, réductions de valeur et provisions",
	},
	"64": {
		code: "64",
		category: "otherCharges",
		side: "debit",
		label: "Autres charges d'exploitation",
	},
	"65": {
		code: "65",
		category: "financialCharges",
		side: "debit",
		label: "Charges financières",
	},
	"66": {
		code: "66",
		category: "exceptionalCharges",
		side: "debit",
		label: "Charges exceptionnelles",
	},
	"70": {
		code: "70",
		category: "revenue",
		side: "credit",
		label: "Chiffre d'affaires",
	},
	"74": {
		code: "74",
		category: "otherIncome",
		side: "credit",
		label: "Autres produits d'exploitation",
	},
	"75": {
		code: "75",
		category: "financialIncome",
		side: "credit",
		label: "Produits financiers",
	},
	"76": {
		code: "76",
		category: "exceptionalIncome",
		side: "credit",
		label: "Produits exceptionnels",
	},
};

/**
 * PCMN 618 — remuneration and benefits of company directors/managers who are
 * NOT employed under a contract of employment (dirigeants d'entreprise
 * indépendants). It belongs to class 61 "Services et biens divers", NOT class
 * 62 "Rémunérations". This is the one PCMN subtlety that both apps must get
 * right so an owner's own pay reconciles between a plan and its actuals.
 */
export const DIRECTOR_REMUNERATION_ACCOUNT = "618";

/**
 * The P&L category for a PCMN account code of any length (2-digit class up to a
 * full leaf code), or null when the code is not one of the compared P&L
 * classes. Applies the 618 rule explicitly before falling back to the class, so
 * self-employed director remuneration is never miscounted as personnel.
 */
export function plCategoryForCode(code: string): PlCategory | null {
	const trimmed = code.trim();
	if (trimmed.startsWith(DIRECTOR_REMUNERATION_ACCOUNT)) return "services";
	return PCMN_PL_CLASSES[trimmed.slice(0, 2)]?.category ?? null;
}

/**
 * PCMN liquidity classes (valeurs disponibles): 54 term deposits, 55 banks, 57
 * cash on hand. Their net movement is the treasury / cash position. (50-53
 * current investments and 56 are excluded, matching the suite's cash view.)
 */
export const CASH_CLASSES = ["54", "55", "57"] as const;
export type CashClass = (typeof CASH_CLASSES)[number];

/** Whether an account code belongs to a liquidity (cash) class. */
export function isCashClass(code: string): boolean {
	return (CASH_CLASSES as readonly string[]).includes(code.trim().slice(0, 2));
}
