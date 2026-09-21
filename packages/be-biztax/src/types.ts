import type { QualifiedName, TaxonomyModule } from "./taxonomy.js";

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

/** The language the return is filed in, which decides how it names itself. */
export type ReturnLanguage = "nl" | "fr" | "de";

export interface Address {
	street: string;
	houseNumber: string;
	box?: string;
	/** Belgian postal code, from the taxonomy's list. */
	postalCode: string;
	/** ISO 3166-1 alpha-2. Defaults to `BE`. */
	country?: string;
}

export interface Entity {
	/** KBO/BCE enterprise number: ten digits, with or without `BE`, dots or spaces. */
	enterpriseNumber: string;
	name: string;
	/** Legal form code from the NBB list, like `610` for an SRL/BV. */
	legalForm?: string;
	address?: Address;
}

/** Who FPS Finance may contact about the file. */
export interface Contact {
	name: string;
	firstName?: string;
	function?: string;
	email?: string;
	phone?: string;
}

/**
 * One reported value.
 *
 * A line of the return is a concept; this says which one, what it is worth,
 * and, where the concept allows more than one, which.
 */
export interface FactInput {
	/** Concept name. A bare name is read in the core namespace, `tax-inc`. */
	concept: string;
	/**
	 * Numbers for amounts, counts and rates (a rate is a fraction: 0.31);
	 * booleans for checkboxes; bytes for a PDF annex; text otherwise. Dates are
	 * `YYYY-MM-DD` text.
	 */
	value: number | boolean | string | Uint8Array;
	/**
	 * For a concept measured at a moment: the opening or the closing balance of
	 * the taxable period. Defaults to `end`. Ignored for concepts that cover
	 * the whole period.
	 */
	at?: "start" | "end";
	/**
	 * Dimension to member. An explicit dimension takes one of the taxonomy's
	 * members (`d-br:ForeignBranchMember`); a typed dimension takes the row's
	 * own identifier, which the filer chooses ("Other reserve 1").
	 */
	dimensions?: Readonly<Record<QualifiedName, string>>;
}

export interface BiztaxReturnInput {
	/** The entry point filed against, from `@financica/be-biztax/taxonomies/*`. */
	taxonomy: TaxonomyModule;
	language: ReturnLanguage;
	entity: Entity;
	/** The taxable period: first and last day, both included. */
	period: { startDate: IsoDate; endDate: IsoDate };
	contact?: Contact;
	/** The name of the software that produced the file. */
	softwareVendor?: string;
	facts: readonly FactInput[];
}

export type FindingSeverity = "error" | "warning";

/** Something `validateBiztaxReturn` found. An `error` means Biztax will refuse the file. */
export interface Finding {
	severity: FindingSeverity;
	/** Stable identifier of the rule, for a caller that presents findings itself. */
	rule: string;
	message: string;
	/** The concept the finding is about, where it is about one. */
	concept?: QualifiedName;
}
