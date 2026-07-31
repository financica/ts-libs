/**
 * Input contract for an NBB/CBSO annual-accounts filing.
 *
 * This is the shape callers build; the package turns it into a `.xbrl`
 * instance document and validates it against the NBB's published checks. It is
 * deliberately expressed in statutory rubric codes rather than in taxonomy
 * element names: the NBB taxonomy is dimensional, so a figure is not an
 * element but a metric plus a set of dimension members, and resolving that is
 * this package's job rather than the caller's.
 */

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

/**
 * A statutory rubric code as printed in the NBB model, e.g. `"20/58"`,
 * `"9905"`, `"8051P"`. Codes ending in `P` denote a prior-period figure in the
 * model's own notation; prefer expressing those through {@link RubricAmount}.
 */
export type RubricCode = string;

/** Which annual-accounts model is being filed. */
export type NbbModel =
	/** Full, company with capital. */
	| "m02"
	/** Abbreviated, company with capital. */
	| "m01"
	/** Micro, company with capital. */
	| "m07"
	/** Full, company without capital. */
	| "m82"
	/** Abbreviated, company without capital. */
	| "m81"
	/** Micro, company without capital. */
	| "m87"
	/** Full, association or foundation. */
	| "m05"
	/** Abbreviated, association or foundation. */
	| "m04"
	/** Micro, association or foundation. */
	| "m08";

/**
 * Which part of the filing this document carries. The NBB allows a filing to
 * be split into two deposits; `"full"` is the single-file, unsplit form.
 *
 * Maps to the `-f` / `-a` / `-o` entry-point suffixes. Associations
 * (`m04`, `m05`, `m08`) only support `"full"`.
 */
export type NbbFilingPart =
	/** Annual accounts and other documents in one file (`-f`). */
	| "full"
	/** Annual accounts only (`-a`). */
	| "annual-accounts"
	/** Other documents only (`-o`). */
	| "other-documents";

/** Language the filing is drawn up in. Written as `xml:lang` on the root. */
export type FilingLanguage = "fr" | "nl" | "de" | "en";

/**
 * A figure reported for one rubric.
 *
 * Amounts are in EUR. Use a negative number for a negative figure; do not use
 * parentheses or thousands separators. Two decimal places are accepted.
 * `null` distinguishes "reported as nil" from a rubric that is simply absent.
 */
export interface RubricAmount {
	/** Value for the exercise being filed. */
	current?: number | null;
	/** Value for the preceding exercise. */
	previous?: number | null;
}

/** Figures for a section of the model, keyed by statutory rubric code. */
export type RubricAmounts = Record<RubricCode, RubricAmount>;

/** A Belgian postal address as the taxonomy models it. */
export interface Address {
	street: string;
	houseNumber: string;
	postbox?: string;
	/** Belgian postal code, e.g. `"1000"`. */
	postalCode: string;
	/** ISO 3166-1 alpha-2 country code. Defaults to `"BE"`. */
	country?: string;
}

/** The filing entity. */
export interface Entity {
	/**
	 * KBO/BCE enterprise number as ten digits, no `BE` prefix and no
	 * punctuation, e.g. `"0766280697"`.
	 */
	enterpriseNumber: string;
	/** Legal name, as registered. */
	name: string;
	/** Legal-form code from the taxonomy's legal-form enumeration. */
	legalForm: string;
	address: Address;
	/** Business court the entity is registered with. */
	businessCourt?: string;
	/** Date of the entity's articles of association. */
	statutesDate?: IsoDate;
}

/** The exercise being filed and the one it is compared against. */
export interface Exercise {
	startDate: IsoDate;
	endDate: IsoDate;
}

/**
 * The identification section (section 1) of the model.
 *
 * These fields are mandatory and easy to forget; they are modelled explicitly
 * rather than left to a loose record.
 */
export interface Identification {
	/** Exercise being filed. */
	exercise: Exercise;
	/** Preceding exercise, whose figures form the comparative column. */
	previousExercise: Exercise;
	/** Date the general meeting approved the accounts. */
	generalMeetingDate: IsoDate;
	/**
	 * Whether the prior-period figures reproduce what was previously filed
	 * and published unchanged.
	 */
	previousPeriodDataUnchanged: boolean;
	/** Whether this filing corrects an earlier one. */
	isCorrection?: boolean;
	/** Whether the entity is in liquidation. */
	inLiquidation?: boolean;
	/**
	 * Total number of pages in the filing.
	 *
	 * Only meaningful when filing on paper or as a PDF. The XBRL taxonomy has no
	 * datapoint for it, so it is never reported in an instance document.
	 */
	pageCount?: number;
	/**
	 * Sections of the model that are not filed because they do not apply.
	 * Section numbers as printed in the model, e.g. `["6.6", "9"]`.
	 */
	sectionsNotFiled?: readonly string[];
}

/** A director, manager or commissaire listed in section 2.1. */
export interface Director {
	/** A natural person's given name, or omitted for a legal person. */
	firstName?: string;
	/** A natural person's surname, or a legal person's name. */
	lastName: string;
	/** Enterprise number, when the mandate holder is a legal person. */
	enterpriseNumber?: string;
	address?: Address;
	/** Mandate code from the taxonomy's function enumeration. */
	mandate: string;
	/** Mandate start and end, where the model asks for them. */
	mandateStart?: IsoDate;
	mandateEnd?: IsoDate;
}

/**
 * The nature of an accountant's mission, as declared in section 2.2. A
 * declaration may carry more than one.
 */
export type MissionNature = "A" | "B" | "C" | "D";

/** Section 2.2: declaration on verification or correction of the accounts. */
export interface AccountantDeclaration {
	/** Firm or practitioner name. */
	name: string;
	/** Their enterprise number. */
	enterpriseNumber: string;
	/** ITAA/ICE member number, as printed, e.g. `"10.498.733"`. */
	memberNumber: string;
	address?: Address;
	/** Which missions were carried out. */
	missions: readonly MissionNature[];
}

/**
 * Identifies the software that generated the instance. The NBB models this as
 * a single free-text field; no registration or vendor identifier is involved.
 */
export interface ApplicationProducer {
	name: string;
}

/**
 * A complete filing, ready to be validated and rendered.
 *
 * The balance sheet must be given **after appropriation** (après répartition /
 * na resultaatverwerking), which is what the NBB model expects. Callers
 * holding a pre-appropriation trial balance must apply the appropriation first
 * and pass the result here alongside {@link NbbFilingInput.appropriation}.
 */
export interface NbbFilingInput {
	/** Taxonomy version to file against. Defaults to the current one. */
	taxonomy?: string;
	model: NbbModel;
	/** Defaults to `"full"`. */
	part?: NbbFilingPart;
	language: FilingLanguage;
	entity: Entity;
	identification: Identification;
	producer: ApplicationProducer;

	/** Section 2.1. */
	directors?: readonly Director[];
	/** Section 2.2. */
	accountantDeclaration?: AccountantDeclaration;

	/** Sections 3.1 and 3.2, after appropriation. */
	balanceSheet: RubricAmounts;
	/** Section 4. */
	incomeStatement: RubricAmounts;
	/** Section 5. */
	appropriation: RubricAmounts;
	/** Sections 6 through 8, keyed by rubric code. */
	notes?: RubricAmounts;

	/** Section 6.5, mandatory free text. */
	valuationRules: string;
}

/** Severity of a validation finding. */
export type FindingSeverity =
	/** Disqualifying: the NBB will refuse the filing. */
	| "error"
	/** Non-disqualifying: the filing is accepted but flagged. */
	| "warning";

/** A single validation result. */
export interface Finding {
	severity: FindingSeverity;
	/**
	 * Identifier of the check, as published by the NBB, e.g.
	 * `"va_03.01.0_0014"`.
	 */
	check: string;
	/** Human-readable statement of the rule, e.g. `"20/58 = 20 + 21/28 + 29/58"`. */
	rule: string;
	/** Rubric codes the check reads. */
	codes: readonly RubricCode[];
	/** What the rule requires. */
	expected?: number;
	/** What the filing reports. */
	actual?: number;
	message: string;
}

/** Outcome of validating a filing. */
export interface ValidationResult {
	errors: readonly Finding[];
	warnings: readonly Finding[];
}
