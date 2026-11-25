import type { TaxonomyModule } from "./taxonomy.js";

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
 * Which part of the filing a taxonomy module carries. The NBB allows a filing
 * to be split into two deposits; `"f"` is the single-file, unsplit form.
 *
 * These are the entry-point suffixes: `m87-f`, `m87-a`, `m87-o`. Associations
 * and foundations (`m04`, `m05`, `m08`) publish only `-f`, so there is no
 * module to import for anything else.
 */
export type NbbFilingPart =
	/** Annual accounts and other documents in one file. */
	| "f"
	/** Annual accounts only. */
	| "a"
	/** Other documents only. */
	| "o";

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

/**
 * A postal address as the taxonomy models it.
 *
 * A Belgian postal code is reported as a member of the taxonomy's postal-code
 * list; any other country's goes out as free text in the same cell. The
 * filing entity's own address must be Belgian.
 */
export interface Address {
	street: string;
	houseNumber: string;
	postbox?: string;
	/** Postal code, e.g. `"1000"`. */
	postalCode: string;
	/**
	 * Municipality. The entity's own address has no cell for it (the postal
	 * code determines it); a person's or investee's address does, and a
	 * foreign one should carry it.
	 */
	city?: string;
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
	/**
	 * Preceding exercise, whose figures form the comparative column.
	 *
	 * Absent for a first exercise. A company has no comparative column before it
	 * has a year behind it, and stating one it never had is a misstatement the
	 * date checks are there to catch.
	 */
	previousExercise?: Exercise;
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

/**
 * A natural person named in sections 2.1 or 2.2.
 *
 * The taxonomy keys every fact about a person on their name, as typed
 * dimension members, so the name is what groups a person's facts into one
 * row: two people with the same name in the same role cannot both be filed.
 */
export interface NaturalPerson {
	kind: "natural";
	firstName: string;
	lastName: string;
	/** Profession, as printed. */
	profession?: string;
	/**
	 * ITAA or IBR-IRE membership number, as printed (`"10.498.733"`). Only an
	 * auditor or an external accountant has a cell for it.
	 */
	memberNumber?: string;
	address?: Address;
}

/** A legal person named in sections 2.1 or 2.2. */
export interface LegalPerson {
	kind: "legal";
	name: string;
	/** Enterprise number, ten digits, for a Belgian entity. */
	enterpriseNumber?: string;
	/** Membership number, for an auditing or accounting firm. */
	memberNumber?: string;
	address?: Address;
	/** The natural persons who represent it in the mandate or mission. */
	representatives?: readonly Representative[];
}

/** A legal person's permanent representative. */
export interface Representative {
	firstName: string;
	lastName: string;
	profession?: string;
	memberNumber?: string;
	address?: Address;
}

/** One mandate a section 2.1 holder exercised during the exercise. */
export interface Mandate {
	/**
	 * Function code from the taxonomy's `fct` list, with or without the `m`:
	 * `"m13"` director, `"m30"` manager, `"m61"` auditor. See
	 * {@link MANDATE_FUNCTIONS}.
	 */
	function: string;
	/** Start of the mandate, where the model prints it. */
	start?: IsoDate;
	/** End of the mandate. */
	end?: IsoDate;
}

/** A director, manager or statutory auditor listed in section 2.1. */
export interface Director {
	/**
	 * Which block of the section the holder belongs in. Directors and managers
	 * are one block, statutory auditors another; the model has no membership
	 * number for the first. Defaults to `"director"`.
	 */
	role?: "director" | "auditor";
	holder: NaturalPerson | LegalPerson;
	/** At least one. */
	mandates: readonly Mandate[];
}

/**
 * The nature of an accountant's mission, as declared in section 2.2: A
 * bookkeeping, B preparing the accounts, C verifying them, D correcting them.
 */
export type MissionNature = "A" | "B" | "C" | "D";

/** An external accountant or auditor listed in section 2.2. */
export interface Practitioner {
	holder: NaturalPerson | LegalPerson;
	/** At least one. A firm with several assignments lists each. */
	missions: readonly MissionNature[];
}

/** Section 2.2: declaration on verification or correction of the accounts. */
export interface AccountantDeclaration {
	/**
	 * The management body's answer to whether a verification or correction
	 * mission was entrusted to an external accountant or a registered auditor
	 * who is not the statutory auditor.
	 */
	missionEntrusted: boolean;
	/**
	 * The practitioners, with their missions. A and B are optional mentions in
	 * the micro and abbreviated models; C and D must be listed when entrusted.
	 */
	practitioners?: readonly Practitioner[];
}

/** One line of a section 6.3 list: a commitment described, with its amount. */
export interface CommitmentLine {
	description: string;
	/** In EUR. Absent for a commitment that cannot be quantified. */
	amount?: number;
}

/**
 * The narrative parts of section 6.3, rights and commitments not on the
 * balance sheet. Its amounts (`9149` … `9220`) are rubrics and go in
 * {@link NbbFilingInput.notes}.
 */
export interface OffBalanceSheet {
	/** Amount, nature and form of significant litigation and other commitments. */
	litigationAndCommitments?: readonly CommitmentLine[];
	/** Of those, the significant commitments to affiliated or associated enterprises. */
	commitmentsToAffiliates?: readonly CommitmentLine[];
	/** Supplementary retirement or survivors' pension plans: a short description. */
	pensionPlans?: string;
	/** The measures taken to cover their cost. */
	pensionCoverage?: string;
	/** Basis and method of the estimate reported in `9220`. */
	pensionEstimateBasis?: string;
	/**
	 * Other rights and commitments not on the balance sheet, including those
	 * that cannot be quantified. The amount is signed.
	 */
	other?: readonly CommitmentLine[];
}

/** One class of social rights held in a section 7.1 participation. */
export interface ParticipationRights {
	/** Nature of the rights, e.g. `"Parts"`, `"Actions"`. */
	nature: string;
	/** Number held directly. */
	heldDirectly?: number;
	/** Share held directly, as a fraction: 0.25 for 25 %. */
	percentageDirect?: number;
	/** Share held through subsidiaries, as a fraction. */
	percentageThroughSubsidiaries?: number;
}

/**
 * Figures from an investee's last available annual accounts, in the currency
 * they were drawn up in.
 */
export interface InvesteeAccounts {
	/** Closing date of those accounts. */
	closingDate: IsoDate;
	/** ISO 4217 code. */
	currency: string;
	/** Equity, signed, in units of {@link currency}. */
	equity: number;
	/** Net result, signed. */
	netResult: number;
}

/** An entity identified in section 7.1 or 7.2. */
export interface RelatedEntity {
	/** Name, as registered. Also what groups the entity's facts into one row. */
	name: string;
	/** Enterprise number, for an entity under Belgian law. */
	enterpriseNumber?: string;
	/** Legal-form code from the taxonomy's `lgf` list. */
	legalForm?: string;
	/** Legal form as text, for a form the list does not have. */
	legalFormOther?: string;
	address?: Address;
}

/** Section 7.1: an entity in which the company holds a participation. */
export interface Participation extends RelatedEntity {
	rights: readonly ParticipationRights[];
	lastAccounts?: InvesteeAccounts;
}

/** Section 7.2: an entity for which the company is unlimitedly liable. */
export interface UnlimitedLiabilityEntity extends RelatedEntity {
	/**
	 * How that entity's accounts are published: A filed with the NBB, B
	 * published in another member state, D a limited partnership. Absent when
	 * none applies, in which case its accounts must accompany this filing.
	 */
	publicationCode?: "A" | "B" | "D";
}

/**
 * The annex and other statutory disclosures that are text or rows rather than
 * rubric amounts. Amounts with a rubric (`9500`, `9072`, …) stay in
 * {@link NbbFilingInput.notes}.
 */
export interface Disclosures {
	/** Section 6.3. */
	offBalanceSheet?: OffBalanceSheet;
	/**
	 * Section 6.4: the main conditions of receivables from directors and
	 * managers (rate, term, amounts repaid, written off or waived).
	 */
	directorReceivableTerms?: string;
	/** Section 6.6: other information the annex must give. */
	otherInformation?: string;
	/** Section 7.1. */
	participations?: readonly Participation[];
	/** Section 7.2. */
	unlimitedLiabilityEntities?: readonly UnlimitedLiabilityEntity[];
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
	/**
	 * The model and taxonomy release to file against, imported from
	 * `@financica/nbb-cbso/taxonomies/<release>/<model>-<part>`. The filing
	 * application validates against the release valid for the closing date:
	 *
	 * ```typescript
	 * import m04f from "@financica/nbb-cbso/taxonomies/26.0/m04-f";
	 * ```
	 *
	 * The module carries its own {@link TaxonomyModule.model | model},
	 * {@link TaxonomyModule.part | part} and
	 * {@link TaxonomyModule.version | version}, so those are not repeated here.
	 * Passing the module rather than naming it is what lets a bundler leave
	 * every other model out.
	 */
	taxonomy: TaxonomyModule;
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
	/** Sections 6.3, 6.4, 6.6, 7.1 and 7.2: what is text or rows, not rubrics. */
	disclosures?: Disclosures;

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
	/**
	 * Path of the input field the finding is about, for a disclosure, e.g.
	 * `"directors[0].mandates[1].function"`.
	 */
	field?: string;
	message: string;
}

/** Outcome of validating a filing. */
export interface ValidationResult {
	errors: readonly Finding[];
	warnings: readonly Finding[];
}
