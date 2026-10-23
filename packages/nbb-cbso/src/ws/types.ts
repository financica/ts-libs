/** A deposit's postal address as the CBSO records it. */
export interface DepositAddress {
	street?: string | undefined;
	number?: string | undefined;
	box?: string | undefined;
	postalCode?: string | undefined;
	city?: string | undefined;
	/** ISO 3166-1 alpha-2. */
	countryCode?: string | undefined;
}

/**
 * One filing accepted and published by the Central Balance Sheet Office: the
 * reference the web services return for a legal entity or a reference number.
 */
export interface DepositReference {
	/** The NBB's filing reference, `YYYY-NNNNNNNN`. */
	referenceNumber: string;
	/** ISO date the filing was deposited. */
	depositDate: string;
	/** ISO dates of the exercise the accounts cover. */
	exercise: { start: string; end: string };
	/**
	 * The model filed, as the NBB names it: `m87-f` for an XBRL filing of the
	 * micro without-capital model, a `-p` suffix for a filing deposited as PDF.
	 */
	model: string;
	/** `true` when the filing was deposited as PDF rather than XBRL. */
	pdfFiling: boolean;
	/** `Correction` replaces an earlier deposit for the same exercise. */
	depositType: "Initial" | "Correction" | undefined;
	/** Filing language: `NL`, `FR`, `DE` or `EN`. */
	language: string;
	/** ISO 4217 currency of the amounts (`BEF` on old filings). */
	currency: string;
	/** Ten-digit enterprise number, no separators. */
	enterpriseNumber: string;
	enterpriseName: string;
	address: DepositAddress;
	/** NBB legal-form code (`610` for an SRL/BV). */
	legalForm?: string | undefined;
	legalSituation?: string | undefined;
	/** NACE-BEL activity code. */
	activityCode?: string | undefined;
	/** ISO date of the general meeting that approved the accounts. */
	generalAssemblyDate?: string | undefined;
	/** Whether the filing passed the NBB's legal validation. */
	fulfillsLegalValidation: boolean;
}

/** The representations of a deposit the Authentic Data Query product serves. */
export type DepositFormat = "pdf" | "xbrl" | "json";
