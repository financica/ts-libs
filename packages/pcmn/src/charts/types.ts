/**
 * The Belgian minimum chart of accounts, as the CNC publishes it.
 *
 * This is the statutory annexe verbatim, not a usable working chart: it stops
 * where the law stops. Accounts the law leaves to the entity to subdivide (610
 * to 616, say) appear with no wording, and a range like 643-648 is one entry,
 * not six. An application seeds its own chart from this and adds what it needs.
 */

/** The four languages the CNC serves the annexe in. */
export const PCMN_LANGUAGES = ["fr", "nl", "de", "en"] as const;

export type PcmnLanguage = (typeof PCMN_LANGUAGES)[number];

export interface PcmnAccount {
	/** The account number. For a range entry, its lower bound. */
	code: string;
	/** Upper bound, when the annexe gives a range ("643 à 648"). */
	codeTo?: string;
	/** Digits in `code`: 1 for a class, 2 for a rubric, and so on. */
	depth: number;
	/**
	 * The matching heading in the NBB annual-accounts model ("VII.A.5").
	 * The associations annexe carries these; the enterprises annexe does not.
	 */
	rubric?: string;
	/** Numbers of the annexe's own footnotes attached to this account. */
	footnotes?: string[];
	/**
	 * Wording per language.
	 *
	 * A language is **absent** when that language's source does not contain the
	 * account at all — the French page omits the number of the 550-559 range,
	 * and the Dutch page prints 6701 twice where 6702 belongs. Both are defects
	 * in the CNC's own text, and are left as gaps rather than filled in from
	 * another language.
	 *
	 * A language maps to the **empty string** when the annexe shows the account
	 * with no wording, which it does for accounts the entity is meant to name
	 * itself. That is not a gap; it is what the law says.
	 */
	label: Partial<Record<PcmnLanguage, string>>;
}

export interface PcmnChart {
	id: PcmnChartId;
	title: string;
	legalBasis: string;
	accounts: readonly PcmnAccount[];
}

export type PcmnChartId = "be-pcmn-entreprises" | "be-pcmn-associations";

/**
 * The account's wording in `language`, falling back through the remaining
 * languages in order. Returns `undefined` only if no language has it.
 *
 * An account the annexe leaves unnamed returns the empty string, which is
 * distinct from a missing account and is why this does not fall back on it.
 */
export function labelFor(
	account: PcmnAccount,
	language: PcmnLanguage,
	fallbacks: readonly PcmnLanguage[] = PCMN_LANGUAGES,
): string | undefined {
	const own = account.label[language];
	if (own !== undefined) return own;
	for (const next of fallbacks) {
		const value = account.label[next];
		if (value) return value;
	}
	return undefined;
}

/** Exact lookup by account number. Range entries answer to their lower bound. */
export function accountByCode(chart: PcmnChart, code: string): PcmnAccount | undefined {
	return chart.accounts.find((a) => a.code === code);
}

/**
 * Whether `code` falls inside `account`, which for a range entry means anywhere
 * between its bounds. Both bounds are inclusive.
 */
export function coversCode(account: PcmnAccount, code: string): boolean {
	if (account.code === code) return true;
	if (!account.codeTo) return false;
	if (code.length !== account.code.length) return false;
	return code >= account.code && code <= account.codeTo;
}

/**
 * The entry of `chart` that governs `code`, including through a range. Falls
 * back to the nearest ancestor, so `620100` resolves to `6201` and `55123` to
 * the 550-559 range. Returns `undefined` if nothing in the chart covers it.
 */
export function resolveCode(chart: PcmnChart, code: string): PcmnAccount | undefined {
	for (let end = code.length; end > 0; end--) {
		const prefix = code.slice(0, end);
		const hit = chart.accounts.find((a) => coversCode(a, prefix));
		if (hit) return hit;
	}
	return undefined;
}
