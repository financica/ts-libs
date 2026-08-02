/**
 * Belgian PCMN contra accounts: the rubrics the statutory chart itself prints
 * with a trailing "(–)".
 *
 * A contra account carries its balance on the opposite side from the rest of
 * its class, and the NBB annual-accounts model subtracts it from the rubric it
 * belongs to. Uncalled capital is debit-side equity, amounts written down are
 * credit-side assets, write-backs are credit-side charges. Any check that
 * derives an expected balance side from the account class has to know about
 * them, or it reports the chart's own design as an error.
 *
 * Listed rather than derived: the "(–)" lines share no positional pattern —
 * 2801 (uncalled amounts) sits beside 2809 (amounts written down), and 561
 * (cheques issued) beside 560. Matching on the account name is not an option
 * either, since the chart is published in four languages.
 */

/** Where an account of this kind normally carries its balance. */
export type ContraSide = "debit" | "credit";

/**
 * The statutory contra rubrics, by the side their balance actually sits on
 * (which is the opposite of their class's natural side).
 *
 * Codes are the PCMN rubric, so a sub-account inherits by prefix — 1010 is as
 * much uncalled capital as 101.
 */
const CONTRA_CODES: Readonly<Record<string, ContraSide>> = {
	// Class 1 — equity, normally credit
	"101": "debit", // Capital non appelé
	// A company without capital has the same thing and no rubric for it: the
	// scheme stops at 110/111 and the part of a contribution not yet called is
	// a debit sub-account the company numbers itself. CNC/CBN advice 2019/14
	// illustrates it as `111901`, but that is the advice's own numbering and
	// not a rubric of the chart, which goes no deeper than `1119`. It is not
	// listed here: this table is the statutory rubrics, which is what makes
	// prefix inheritance sound. An account that is a contra by choice rather
	// than by rubric has to say so itself.
	// Bénéfice (Perte) reporté(e). The whole rubric is listed, not just 141: a
	// result carried forward is legitimately credit when it is a profit and
	// debit when it is a loss, so neither side is an anomaly.
	"14": "debit",
	"19": "debit", // Avance aux associés sur la répartition de l'actif net
	// Classes 2/3/4/5 — assets, normally debit
	"2801": "credit", // Montants non appelés
	"2821": "credit",
	"2841": "credit",
	"309": "credit", // Réductions de valeur actées
	"319": "credit",
	"329": "credit",
	"339": "credit",
	"349": "credit",
	"359": "credit",
	"379": "credit",
	"409": "credit",
	"419": "credit",
	"511": "credit", // Montants non appelés
	"519": "credit",
	"529": "credit",
	"539": "credit",
	"561": "credit", // Chèques émis
	// Classes 6/7 — charges normally debit, income normally credit
	"608": "credit", // Remises, ristournes et rabais obtenus
	"649": "credit", // Charges d'exploitation portées à l'actif
	"659": "credit", // Charges financières portées à l'actif
	"6311": "credit", // Reprises de réductions de valeur
	"6321": "credit",
	"6331": "credit",
	"6341": "credit",
	"6351": "credit", // Utilisations et reprises de provisions
	"6361": "credit",
	"6371": "credit",
	"6381": "credit",
	"6502": "credit", // Intérêts portés à l'actif
	"6503": "credit",
	"6511": "credit",
	"6561": "credit",
	"6690": "credit",
	"6691": "credit",
	"6701": "credit", // Excédent de versements d'impôts porté à l'actif
	"66201": "credit",
	"66211": "credit",
	"708": "debit", // Remises, ristournes et rabais accordés
};

/**
 * Accumulated depreciation and amounts written down on fixed assets: the PCMN
 * convention appends 9 to the cost rubric, so 2409 is the contra of 240 and
 * 2209 of 220. Applied as a rule rather than a list because an organization's
 * own cost sub-accounts get the same treatment — the register mints the
 * matching …9 account when an asset is first depreciated.
 */
const ACCUMULATED_DEPRECIATION_RE = /^2\d{2}9(\d*)$/;

/**
 * The side a PCMN contra account's balance sits on, or null when the code is
 * not a contra rubric.
 *
 * Resolves by longest matching prefix, so a sub-account of a contra rubric is
 * itself contra.
 */
export function contraSideForCode(code: string): ContraSide | null {
	const trimmed = code.trim();
	if (!trimmed) return null;
	if (ACCUMULATED_DEPRECIATION_RE.test(trimmed)) return "credit";
	for (let length = trimmed.length; length > 0; length -= 1) {
		const side = CONTRA_CODES[trimmed.slice(0, length)];
		if (side) return side;
	}
	return null;
}

/** Whether a PCMN account code is a contra rubric of its class. */
export function isContraCode(code: string): boolean {
	return contraSideForCode(code) !== null;
}
