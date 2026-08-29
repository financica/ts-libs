// ---------------------------------------------------------------------------
// Intervat "probability errors" (business-rule warnings) on the periodic VAT
// return.
//
// Intervat runs nine plausibility checks over the grid. Each one asks whether
// the VAT amounts are consistent with the taxable bases they should follow
// from: a 21% base with 6% of VAT on it, an amount in grid 87 with no VAT
// declared in 56/57, and so on. None of them is an arithmetic error in the
// strict sense — the figures can be perfectly correct and still trip a rule,
// because a real return can legitimately mix rates or carry a correction.
//
// The important part: a tripped rule REJECTS the submission unless the XML
// carries a `<ns2:Justification Code="...">` naming that rule with a comment
// explaining it. So a filer must evaluate these before submitting and collect
// an explanation for each, or the return bounces.
//
// The rules and their wording come from the annex of SPF Finances' Intervat API
// documentation. Everything here is deliberately faithful to that source,
// including the messages, so a user reads the authority's own words rather than
// our paraphrase.
// ---------------------------------------------------------------------------

import type { VatGridNumber, VatReturnGrid } from "./vat-return";

/** The nine rule identifiers Intervat uses, as they appear in the XML and in rejections. */
export const PROBABILITY_WARNING_CODES = [
	"W_TVA_GRID_54O_INCORRECT_VALUE",
	"W_TVA_GRID_5657_INCORRECT_VALUE",
	"W_TVA_GRID_5657_INCORRECT_VALUE_2",
	"W_TVA_GRID_55_INCORRECT_VALUE",
	"W_TVA_GRID_59_INCORRECT_VALUE",
	"W_TVA_GRID_64_INCORRECT_VALUE",
	"W_TVA_GRID_55_INCORRECT_VALUE_3",
	"W_TVA_GRID_5657_INCORRECT_VALUE_3",
	"W_TVA_GRID_55_INCORRECT_VALUE_2",
] as const;

export type ProbabilityWarningCode = (typeof PROBABILITY_WARNING_CODES)[number];

export type ProbabilityWarningLocale = "fr" | "nl" | "de" | "en";

export interface ProbabilityWarning {
	code: ProbabilityWarningCode;
	/** The grids the rule is about, so a UI can point at the offending boxes. */
	grids: VatGridNumber[];
	/** Intervat's own explanation, in each language it publishes. */
	descriptions: Record<ProbabilityWarningLocale, string>;
}

/** A filer's explanation for one tripped rule, carried in the declaration. */
export interface VatReturnJustification {
	code: ProbabilityWarningCode;
	/** Free text shown to the administration. Required — an empty comment justifies nothing. */
	comment: string;
}

type MessageTemplates = Record<ProbabilityWarningLocale, string>;

interface RuleDefinition {
	code: ProbabilityWarningCode;
	grids: VatGridNumber[];
	/** Whether the rule trips for this grid. */
	trips: (grid: VatReturnGrid) => boolean;
	messages: MessageTemplates;
}

/** Grid value, or 0 when the box is absent — the arithmetic treats absence as zero. */
const v = (grid: VatReturnGrid, box: VatGridNumber): number => grid[box] ?? 0;

/** Whether the box carries a value at all. Distinct from a value of 0 in rules 1, 4 and 6. */
const present = (grid: VatReturnGrid, box: VatGridNumber): boolean =>
	grid[box] !== undefined;

const RULES: RuleDefinition[] = [
	{
		code: "W_TVA_GRID_54O_INCORRECT_VALUE",
		grids: [1, 2, 3, 54],
		// Si G54 contient une valeur et que (((G1*0,06)+(G2*0,12)+(G3*0,21))-54) > 62
		// (the source omits a `+` before (G3*0,21); the sum of the three rates is
		// plainly what is meant, and the message says exactly that).
		trips: (g) =>
			present(g, 54) &&
			v(g, 1) * 0.06 + v(g, 2) * 0.12 + v(g, 3) * 0.21 - v(g, 54) > 62,
		messages: {
			fr: "Le montant total de TVA due indiqué dans la grille 54 ne correspond pas aux taux de TVA appliqués respectivement sur les bases imposables indiquées dans les grilles 01, 02 et 03. Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het totale verschuldigde BTW-bedrag dat in rooster 54 is vermeld, komt niet overeen met de BTW-tarieven die respectievelijk worden toegepast op de in de roosters 01, 02 en 03 vermelde bedragen. Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der in Raster 54 eingetragene Gesamtbetrag der zu zahlenden Mehrwertsteuer entspricht nicht den Mehrwertsteuersätzen, die jeweils auf die in den Rastern 01, 02 und 03 eingetragenen Beträge angewendet werden. Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The total amount of VAT due entered in grid 54 does not correspond to the VAT rates applied respectively to the amounts entered in grids 01, 02 and 03. Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_5657_INCORRECT_VALUE",
		grids: [56, 57, 87],
		// Si G87 différent de 0 et G56 = 0 et G57 = 0 et G87 > 250
		trips: (g) =>
			v(g, 87) !== 0 && v(g, 56) === 0 && v(g, 57) === 0 && v(g, 87) > 250,
		messages: {
			fr: "Vous avez introduit un montant dans la grille 87 (montant hors TVA). Vous devez en principe indiquez la TVA due dans les grilles 56 et/ou 57. Merci de justifier ou de compléter au moins une de ces deux grilles (déclarant {0}).",
			nl: "U heeft een bedrag ingevuld in rooster 87 (bedrag exclusief BTW). In principe moet u de verschuldigde BTW in de roosters 56 en/of 57 invoeren. Gelieve minstens één van deze twee rasters te verantwoorden of in te vullen (BTW nr {0}).",
			de: "Sie haben einen Betrag im Raster 87 eingegeben (Betrag ohne Mehrwertsteuer). Im Prinzip müssen Sie die geschuldete Mehrwertsteuer im Raster 56 und/oder 57 eintragen. Bitte begründen Sie mindestens eines dieser beiden Raster oder füllen Sie mindestens eines dieser beiden Raster aus (MwSt.-Nr. {0}).",
			en: "You have entered an amount in grid 87 (amount excluding VAT). In principle, you must enter the VAT due in grid 56 and/or 57. Please justify or fill in at least one of these two grids (VAT no. {0}).",
		},
	},
	{
		code: "W_TVA_GRID_5657_INCORRECT_VALUE_2",
		grids: [56, 57, 85, 87],
		// Si (G56+G57)-((G85+G87)*0,21) > 150
		trips: (g) => v(g, 56) + v(g, 57) - (v(g, 85) + v(g, 87)) * 0.21 > 150,
		messages: {
			fr: "Le montant des grilles 56 et/ou 57 (TVA due à l'Etat) est supérieur à 21% de la somme introduite dans les grilles 85 et/ou 87 (montant hors TVA). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag in de roosters 56 en/of 57 (aan de Staat verschuldigde BTW) is groter dan 21% van het bedrag dat in de roosters 85 en/of 87 (bedrag exclusief BTW) is opgenomen. Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der Betrag in den Rastern 56 und/oder 57 (dem Staat geschuldete Mehrwertsteuer) ist größer als 21% des in den Rastern 85 und/oder 87 enthaltenen Betrags (Betrag ohne Mehrwertsteuer). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount in grids 56 and/or 57 (VAT due to the State) is greater than 21% of the amount included in grids 85 and/or 87 (amount excluding VAT). Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_55_INCORRECT_VALUE",
		grids: [55, 86, 88],
		// Si G55 = null et (G86 différent de null ou G88 différent de null) et (G86+G88) > 250
		trips: (g) =>
			!present(g, 55) &&
			(present(g, 86) || present(g, 88)) &&
			v(g, 86) + v(g, 88) > 250,
		messages: {
			fr: "Vous avez introduit un montant dans la grille 86 et/ou 88 (montant hors TVA). Vous devez en principe indiquez la TVA due dans la grille 55. Merci de justifier ou de compléter cette grille (déclarant {0}).",
			nl: "U heeft een bedrag ingevuld in rooster 86 en/of 88 (bedrag exclusief BTW). In principe moet u de verschuldigde BTW in rooster 55 invoeren. Gelieve dit rooster te verantwoorden of aan te vullen (BTW nr {0}).",
			de: "Sie haben einen Betrag im Raster 86 und/oder 88 eingegeben (Betrag ohne Mehrwertsteuer). Im Prinzip müssen Sie die fällige Mehrwertsteuer im Raster 55 eintragen. Bitte begründen oder ergänzen Sie dieses Raster (MwSt.-Nr. {0}).",
			en: "You have entered an amount in grid 86 and/or 88 (amount excluding VAT). In principle, you must enter the VAT due in grid 55. Please justify or complete this grid (VAT no. {0}).",
		},
	},
	{
		code: "W_TVA_GRID_59_INCORRECT_VALUE",
		grids: [59, 81, 82, 83, 84, 85],
		// Si G59-((G81+G82+G83+G84+G85)*0,21) >= 100000 OU (le même >= 300000 et
		// le rapport à la base >= 0,05).
		//
		// As published, the second branch is subsumed by the first (any excess
		// >= 300000 is already >= 100000), so the rule reduces to the first
		// threshold. Kept in both halves rather than "simplified" away: the
		// source is what SPF validate against, and if the thresholds are a
		// transcription slip the shape here is the one to correct.
		trips: (g) => {
			const base = v(g, 81) + v(g, 82) + v(g, 83) + v(g, 84) + v(g, 85);
			const excess = v(g, 59) - base * 0.21;
			if (excess >= 100000) return true;
			return excess >= 300000 && base !== 0 && excess / base >= 0.05;
		},
		messages: {
			fr: "Le montant de la grille 59 (TVA déductible) est supérieur à 21% du montant total des grilles 81 à 85 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag van rooster 59 (Aftrek) is hoger dan 21% van het totale bedrag van de roosters 81 tot 85 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Die Menge des Raster 59 (Abzug) ist höher als 21% der Gesamtmenge der Raster 81 bis 85 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount of grid 59 (Deduction) is higher than 21% of the total amount of grids 81 to 85 (taxe base). Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_64_INCORRECT_VALUE",
		grids: [49, 64],
		// Si G64 contient une donnée et (G64-(G49*0,21)) > 62
		trips: (g) => present(g, 64) && v(g, 64) - v(g, 49) * 0.21 > 62,
		messages: {
			fr: "Le montant de la grille 64 (TVA déductible) est supérieur à 21% du montant introduit dans la grille 49 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag in rooster 64 (aftrekbare BTW) is hoger dan 21% van het bedrag in rooster 49 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der Betrag in Raster 64 (abzugsfähige MwSt.) ist höher als 21% des Betrags in Raster 49 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount in grid 64 (deductible VAT) is higher than 21% of the amount in grid 49 (tax base). Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_55_INCORRECT_VALUE_3",
		grids: [55, 86, 88],
		// Si (((G86+G88)*0,06)-G55) > 150
		trips: (g) => (v(g, 86) + v(g, 88)) * 0.06 - v(g, 55) > 150,
		messages: {
			fr: "Le montant de la grille 55 (TVA due) est inférieur à 6% du montant total des grilles 86 et 88 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag van rooster 55 (verschuldigde BTW) is kleiner dan 6% van het totale bedrag van de roosters 86 en 88 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der Betrag des Raster 55 (geschuldete Mehrwertsteuer) ist kleiner als 6% des Gesamtbetrags der Raster 86 und 88 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount of grid 55 (VAT due) is lower than 6% of the total amount of grids 86 and 88 (tax base). Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_5657_INCORRECT_VALUE_3",
		grids: [56, 57, 87],
		// Si ((G87*0,06)-(G56+G57)) > 150
		trips: (g) => v(g, 87) * 0.06 - (v(g, 56) + v(g, 57)) > 150,
		messages: {
			fr: "Le montant des grilles 56 et/ou 57 (TVA due à l'Etat) est inférieur à 6% de la somme introduite dans la grille 87 (montant hors TVA). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag in de roosters 56 en/of 57 (aan de Staat verschuldigde BTW) is kleiner dan 6% van het bedrag dat in de rooster 87 (bedrag exclusief BTW) is opgenomen. Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der Betrag in den Rastern 56 und/oder 57 (dem Staat geschuldete Mehrwertsteuer) ist kleiner als 6% des in den Raster 87 enthaltenen Betrags (Betrag ohne Mehrwertsteuer). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount in grids 56 and/or 57 (VAT due to the State) is lower than 6% of the amount included in grid 87 (amount excluding VAT). Please correct or justify your calculation (VAT No {0}).",
		},
	},
	{
		code: "W_TVA_GRID_55_INCORRECT_VALUE_2",
		grids: [55, 84, 86, 88],
		// Si (G55-((G84+G86+G88)*0,21)) > 150
		trips: (g) => v(g, 55) - (v(g, 84) + v(g, 86) + v(g, 88)) * 0.21 > 150,
		messages: {
			fr: "Le montant de la grille 55 (TVA due) est supérieur à 21% du montant total des grilles 84, 86 et 88 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant {0}).",
			nl: "Het bedrag van rooster 55 (verschuldigde BTW) is hoger dan 21% van het totale bedrag van de roosters 84, 86 en 88 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr {0}).",
			de: "Der Betrag des Raster 55 (geschuldete Mehrwertsteuer) ist höher als 21% des Gesamtbetrags der Raster 84, 86 und 88 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. {0}).",
			en: "The amount of grid 55 (VAT due) is higher than 21% of the total amount of grids 84, 86 and 88 (tax base). Please correct or justify your calculation (VAT No {0}).",
		},
	},
];

/**
 * Every message ends with a parenthetical naming the declarant, e.g.
 * `(déclarant {0}).` — worth keeping when we know the number and worth removing
 * cleanly when we do not, rather than showing a raw `{0}` to a user.
 */
const fillDeclarant = (template: string, vatNumber: string | undefined): string => {
	if (vatNumber) return template.replace("{0}", vatNumber);
	return template.replace(/\s*\([^)]*\{0\}\)(\.?)$/, "$1");
};

/**
 * The rules this grid trips, in the order Intervat publishes them.
 *
 * A tripped rule is not necessarily a mistake — it is Intervat asking for an
 * explanation. Each one returned here needs a {@link VatReturnJustification}
 * in the submitted declaration or the submission is rejected.
 */
export function evaluateProbabilityWarnings(
	grid: VatReturnGrid,
	options?: { vatNumber?: string },
): ProbabilityWarning[] {
	const warnings: ProbabilityWarning[] = [];
	for (const rule of RULES) {
		if (!rule.trips(grid)) continue;
		warnings.push({
			code: rule.code,
			grids: rule.grids,
			descriptions: {
				fr: fillDeclarant(rule.messages.fr, options?.vatNumber),
				nl: fillDeclarant(rule.messages.nl, options?.vatNumber),
				de: fillDeclarant(rule.messages.de, options?.vatNumber),
				en: fillDeclarant(rule.messages.en, options?.vatNumber),
			},
		});
	}
	return warnings;
}

/**
 * The tripped rules that carry no justification. Empty means the declaration is
 * safe to submit as far as these checks go.
 *
 * Intervat is the authority on which rules fire, so this is an early warning,
 * not a guarantee: a rejection can still name a rule we did not predict, and
 * the answer then is to justify that one and resubmit.
 */
export function findUnjustifiedWarnings(
	grid: VatReturnGrid,
	justifications: readonly VatReturnJustification[] = [],
	options?: { vatNumber?: string },
): ProbabilityWarning[] {
	const justified = new Set(
		justifications.filter((j) => j.comment.trim() !== "").map((j) => j.code),
	);
	return evaluateProbabilityWarnings(grid, options).filter(
		(warning) => !justified.has(warning.code),
	);
}
