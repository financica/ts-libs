/**
 * Every literal the statement is recognised by, in French and Dutch.
 *
 * The administration prints the same document in both languages with the same
 * geometry, so language only ever selects which of a pair of patterns applies —
 * never a different parsing strategy.
 */
import type { BalanceType } from "./types.js";

/** Present on every statement issued from Q4 2022 onwards. */
export const PFORM671_MARKER = "PFORM671";

/** Document titles, which also decide the language. */
export const TITLE_FR = "Extrait de compte TVA";
export const TITLE_NL = "Uittreksel btw-rekening";

export const PATTERNS = {
	formReference: /BE\d{10}\/PFORM671\/\d{8}\/\d{6,}/,
	vatNumber: /BE(\d{10})\/PFORM671/,
	// Legacy statements print the number dotted: "Numéro de TVA : 0766.280.697".
	vatNumberLegacy:
		/Num[ée]ro de TVA\s*:\s*(\d{4}\.\d{3}\.\d{3})|Btw-nummer\s*:\s*(\d{4}\.\d{3}\.\d{3})/i,
	documentUuid: /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
	structuredCommunication: /\+{3}\d{3}\/\d{4}\/\d{5}\+{3}/,

	// "le 7 février 2025" / "op 7 februari 2025". `[^\s\d]+` rather than `\w+`
	// because `\w` does not match the accented month names.
	statementDateFr: /le\s+(\d{1,2}\s+[^\s\d]+\s+\d{4})/i,
	statementDateNl: /op\s+(\d{1,2}\s+[^\s\d]+\s+\d{4})/i,
	// Legacy: "Bruxelles, 20/05/2021" / "Brussel, 20/05/2021".
	statementDateLegacy: /(?:Bruxelles|Brussel),\s*(\d{2}\/\d{2}\/\d{4})/i,

	// "situation au 31.01.2025" / "situatie op 31.01.2025".
	situationDate: /(?:situation au|situatie op)\s+(\d{2}\.\d{2}\.\d{4})/i,
	situationDateLegacy: /(?:situation au|situatie op)\s+(\d{2}\/\d{2}\/\d{4})/i,

	// "à la date du : 31.10.2024" / "op datum van : 31.10.2024".
	periodStartDate: /(?:à la date du|op datum van)\s*:\s*(\d{2}\.\d{2}\.\d{4})/i,
	periodStartDateLegacy: /(?:à la date du|op datum van)\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,

	// "Situation fin novembre 2024" / "Situatie einde november 2024".
	situationLineFr: /Situation fin\s+([^\s\d]+)\s+(\d{4})/i,
	situationLineNl: /Situatie einde\s+([^\s\d]+)\s+(\d{4})/i,
	// Legacy prints the month numerically: "Situation fin 02/2021".
	situationLineLegacyFr: /Situation fin\s+(\d{2})\/(\d{4})/i,
	situationLineLegacyNl: /Situatie einde\s+(\d{2})\/(\d{4})/i,

	previousBalance: /Solde précédent|Vorig saldo/i,
	tableStart: /Aperçu détaillé|Gedetailleerd overzicht/i,
	operationsHeading: /Opérations et soldes|Verrichtingen en saldi/i,
	tableEnd: /Voir notice importante|Zie belangrijke opmerking/i,

	/** A date in either separator, anywhere in a line. */
	anyDate: /(\d{2}[./]\d{2}[./]\d{4})/,
} as const;

/**
 * Column-label rows, which sit inside the table but carry no data. The last
 * entry catches the second line of the wrapped "Date de prise d'effet" label,
 * which arrives on its own row.
 */
export const COLUMN_LABEL_PATTERNS: readonly RegExp[] = [
	/Date d'inscription|Datum van inschrijving/i,
	/Date de prise|Datum van uitwerking/i,
	/Objet de l'inscription|Voorwerp/i,
	/Montant en votre|Bedrag in uw/i,
	/Montant dû|Bedrag verschuldigd/i,
];

/** Length below which a bare "d'effet" fragment is a wrapped label, not data. */
export const WRAPPED_LABEL_MAX_LENGTH = 15;

/**
 * The closing-balance labels, in the order they are tried. A statement prints
 * exactly one of them; `zero` is the absence of all three.
 */
export const BALANCE_LABELS: readonly { type: BalanceType; pattern: RegExp }[] = [
	{ type: "to_pay", pattern: /Solde à payer|Te betalen saldo/i },
	{ type: "to_reimburse", pattern: /À rembourser|Terug te betalen/i },
	{ type: "to_carry_forward", pattern: /À reporter|Over te dragen/i },
];
