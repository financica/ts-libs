// ---------------------------------------------------------------------------
// Intervat periodic VAT return (VATConsignment) generation.
//
// Two layers:
//   - serializeVatReturn(): low-level. Takes explicit grid box amounts and
//     renders the VATConsignment XML that Intervat accepts. Pure serialization,
//     no tax logic.
//   - computeBelgianVatGrid() / buildBelgianVatReturn(): map a semantic set of
//     figures (standard-rated sales by rate, deductible purchase VAT) onto the
//     Belgian grid boxes, then serialize. This is where the Belgian box rules
//     live so consumers never hardcode "box 3 = 21% base".
//
// XML schema: http://www.minfin.fgov.be/VATConsignment (imports InputCommon).
// The VATConsignment namespace is bound to the `ns2` prefix; InputCommon is the
// default namespace (so the Declarant's child elements are unprefixed), matching
// the shape Intervat's own examples use.
// ---------------------------------------------------------------------------

import {
	assertSequenceNumber,
	COMMON_NS,
	escapeXmlAttr,
	escapeXmlText,
	formatAmount as formatSharedAmount,
} from "./xml-escape";

const VAT_NS = "http://www.minfin.fgov.be/VATConsignment";

/**
 * Every grid ("case"/"vak") number the Intervat periodic-declaration XSD
 * accepts, in ascending order. Boxes with a leading zero in the paper form
 * (00, 01, 02, 03) are plain integers here (0, 1, 2, 3).
 */
export const VAT_GRID_NUMBERS = [
	0, 1, 2, 3, 44, 45, 46, 47, 48, 49, 54, 55, 56, 57, 59, 61, 62, 63, 64, 71, 72, 81,
	82, 83, 84, 85, 86, 87, 88, 91,
] as const;

export type VatGridNumber = (typeof VAT_GRID_NUMBERS)[number];

/** Explicit grid box amounts. Boxes left undefined are omitted from the XML. */
export type VatReturnGrid = Partial<Record<VatGridNumber, number>>;

export interface VatReturnDeclarant {
	/** Belgian VAT / enterprise number. Dots, spaces and a `BE` prefix are stripped; 9-digit numbers are zero-padded to 10. */
	vatNumber: string;
	name?: string;
	street?: string;
	postCode?: string;
	city?: string;
	/** ISO country code, e.g. "BE". */
	countryCode?: string;
	email?: string;
	phone?: string;
}

/** Either a single month (1-12) or a quarter (1-4), plus the 4-digit year. */
export type VatReturnPeriod =
	| { year: number; month: number }
	| { year: number; quarter: number };

/**
 * Whether a period may carry the December advance (grid 91) at all.
 *
 * The advance settles the year, so only the last period of it declares one: the
 * December return for a monthly filer, the Q4 return for a quarterly one. This
 * is eligibility, not emission — whether grid 91 is actually filled depends on
 * `prepayment` being set, which is the filer's election of the actual-figures
 * method.
 */
export const isDecemberAdvancePeriod = (period: VatReturnPeriod): boolean =>
	"month" in period ? period.month === 12 : period.quarter === 4;

export interface SerializeVatReturnOptions {
	declarant: VatReturnDeclarant;
	period: VatReturnPeriod;
	grid: VatReturnGrid;
	/** Position within the consignment. Defaults to 1. */
	sequenceNumber?: number;
	/** Optional filer-side reference echoed back in the submission proof. */
	declarantReference?: string;
	/** Declares that no annual client listing is due (typically on the Q4/Dec return). Defaults to false. */
	clientListingNihil?: boolean;
	/** Request a refund of a VAT credit. Defaults to false. */
	askRestitution?: boolean;
	/** Request payment forms. Defaults to false. */
	askPayment?: boolean;
	/** UUID of a prior declaration this one replaces. */
	replacedDeclaration?: string;
}

/**
 * Normalise a Belgian VAT number to the 10 bare digits Intervat expects.
 * Accepts `BE0123.456.789`, `0123456789`, or a legacy 9-digit number.
 */
export function normalizeBelgianVatNumber(raw: string): string {
	const digits = raw.replace(/[^0-9]/g, "");
	if (digits.length === 9) return `0${digits}`;
	if (digits.length !== 10) {
		throw new Error(`Belgian VAT number must be 10 digits, received "${raw}"`);
	}
	return digits;
}

const formatAmount = (value: number): string =>
	formatSharedAmount(value, { label: "VAT grid amount", nonNegative: true });

/** An unprefixed element, i.e. one in the InputCommon default namespace. */
const el = (name: string, text: string) => `<${name}>${escapeXmlText(text)}</${name}>`;

/** Intervat spells its booleans out. */
const yesNo = (value: boolean) => (value ? "YES" : "NO");

function declarantChildren(declarant: VatReturnDeclarant): string[] {
	// Order and namespace (unprefixed = InputCommon) follow Declarant_Type.
	const children: string[] = [
		el("VATNumber", normalizeBelgianVatNumber(declarant.vatNumber)),
	];
	if (declarant.name) children.push(el("Name", declarant.name));
	if (declarant.street) children.push(el("Street", declarant.street));
	if (declarant.postCode) children.push(el("PostCode", declarant.postCode));
	if (declarant.city) children.push(el("City", declarant.city));
	if (declarant.countryCode) {
		children.push(el("CountryCode", declarant.countryCode));
	}
	if (declarant.email) children.push(el("EmailAddress", declarant.email));
	if (declarant.phone) children.push(el("Phone", declarant.phone));
	return children;
}

function periodChildren(period: VatReturnPeriod): string[] {
	const { year } = period;
	if (!Number.isInteger(year) || year < 1000 || year > 9999) {
		throw new Error(`VAT period year must be a 4-digit year, received ${year}`);
	}
	if ("month" in period) {
		if (!Number.isInteger(period.month) || period.month < 1 || period.month > 12) {
			throw new Error(`VAT period month must be 1-12, received ${period.month}`);
		}
		return [
			`<ns2:Month>${period.month}</ns2:Month>`,
			`<ns2:Year>${year}</ns2:Year>`,
		];
	}
	if (!Number.isInteger(period.quarter) || period.quarter < 1 || period.quarter > 4) {
		throw new Error(`VAT period quarter must be 1-4, received ${period.quarter}`);
	}
	return [
		`<ns2:Quarter>${period.quarter}</ns2:Quarter>`,
		`<ns2:Year>${year}</ns2:Year>`,
	];
}

function dataChildren(grid: VatReturnGrid): string[] {
	const children: string[] = [];
	for (const gridNumber of VAT_GRID_NUMBERS) {
		const amount = grid[gridNumber];
		if (amount === undefined) continue;
		children.push(
			`<ns2:Amount GridNumber="${gridNumber}">${formatAmount(amount)}</ns2:Amount>`,
		);
	}
	if (children.length === 0) {
		throw new Error("VAT return grid must contain at least one amount");
	}
	return children;
}

/**
 * Render a periodic VAT return (single declaration) to Intervat VATConsignment
 * XML from explicit grid box amounts.
 */
export function serializeVatReturn(options: SerializeVatReturnOptions): string {
	const {
		declarant,
		period,
		grid,
		sequenceNumber = 1,
		declarantReference,
		clientListingNihil = false,
		askRestitution = false,
		askPayment = false,
		replacedDeclaration,
	} = options;

	assertSequenceNumber(sequenceNumber);

	const declarationAttrs =
		declarantReference !== undefined
			? `SequenceNumber="${sequenceNumber}" DeclarantReference="${escapeXmlAttr(declarantReference)}"`
			: `SequenceNumber="${sequenceNumber}"`;

	const lines: string[] = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<ns2:VATConsignment VATDeclarationsNbr="1" xmlns="${COMMON_NS}" xmlns:ns2="${VAT_NS}">`,
		`\t<ns2:VATDeclaration ${declarationAttrs}>`,
	];
	if (replacedDeclaration !== undefined) {
		lines.push(
			`\t\t<ns2:ReplacedVATDeclaration>${escapeXmlText(replacedDeclaration)}</ns2:ReplacedVATDeclaration>`,
		);
	}
	lines.push(`\t\t<ns2:Declarant>`);
	for (const child of declarantChildren(declarant)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</ns2:Declarant>`);
	lines.push(`\t\t<ns2:Period>`);
	for (const child of periodChildren(period)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</ns2:Period>`);
	lines.push(`\t\t<ns2:Data>`);
	for (const child of dataChildren(grid)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</ns2:Data>`);
	lines.push(
		`\t\t<ns2:ClientListingNihil>${yesNo(clientListingNihil)}</ns2:ClientListingNihil>`,
	);
	lines.push(
		`\t\t<ns2:Ask Restitution="${yesNo(askRestitution)}" Payment="${yesNo(askPayment)}" />`,
	);
	lines.push(`\t</ns2:VATDeclaration>`);
	lines.push(`</ns2:VATConsignment>`);
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Belgian grid mapping (semantic figures -> boxes)
// ---------------------------------------------------------------------------

export interface BelgianStandardRatedSale {
	/** VAT rate as a percentage: 6, 12 or 21. */
	rate: number;
	/** Net taxable base (excl. VAT). */
	base: number;
	/** VAT charged. */
	vat: number;
}

/**
 * The figures this library maps onto the Belgian grid. Covers domestic
 * standard-rated sales, deductible purchases, intra-community supplies and
 * acquisitions, exports, domestic reverse charge and imports with postponed
 * accounting, credit-note corrections (48/49/84/85 with the VAT in 63/64) and
 * miscellaneous VAT regularisations (61/62) and the December advance (91).
 * The goods/investment purchase split (81/83) is not modelled yet.
 */
export interface BelgianVatReturnFigures {
	/** Domestic standard-rated sales, one entry per rate (6/12/21). */
	standardRatedSales: BelgianStandardRatedSale[];
	/** Net base of zero-rated or otherwise 0% domestic sales (grid 00). */
	zeroRatedSales?: number;
	/** Net base of intra-community services supplied, VAT due by the EU customer (grid 44). */
	icServicesSales?: number;
	/** Net base of domestic reverse-charge sales, VAT due by the Belgian co-contractor (grid 45). */
	domesticReverseChargeSales?: number;
	/** Net base of exempt intra-community supplies of goods (grid 46). */
	icGoodsSales?: number;
	/** Net base of exports outside the EU and other exempt sales (grid 47). */
	exportSales?: number;
	/** Net base of credit notes issued relating to grids 44 and 46 (grid 48). */
	icSalesCreditNoteBase?: number;
	/** Net base of credit notes issued relating to the other frame II operations (grid 49). */
	otherSalesCreditNoteBase?: number;
	/** Total net base of purchases carrying deductible VAT. */
	purchaseBase: number;
	/** Total deductible input VAT. */
	deductibleVat: number;
	/** Net base of intra-community acquisitions of goods (grid 86). */
	icGoodsPurchaseBase?: number;
	/** Net base of intra-community services received (grid 88). */
	icServicesPurchaseBase?: number;
	/** Net base of other reverse-charge purchases: imports with postponed accounting and domestic reverse charge (grid 87). */
	otherReverseChargePurchaseBase?: number;
	/** Net base of credit notes received relating to grids 86 and 88 (grid 84). */
	icPurchaseCreditNoteBase?: number;
	/** Net base of credit notes received relating to the other frame III operations (grid 85). */
	otherPurchaseCreditNoteBase?: number;
	/** Self-assessed VAT due on intra-community acquisitions and services (grid 55). */
	icOutputVat?: number;
	/** Self-assessed VAT due on domestic reverse-charge purchases (grid 56). */
	domesticReverseChargeOutputVat?: number;
	/** Self-assessed VAT due on imports with postponed accounting (grid 57). */
	importOutputVat?: number;
	/** Miscellaneous VAT regularisations in favour of the State (grid 61). */
	vatCorrectionsDue?: number;
	/** Miscellaneous VAT regularisations in favour of the declarant (grid 62). */
	vatCorrectionsRecoverable?: number;
	/** VAT to pay back on credit notes received (grid 63). */
	purchaseCreditNoteVat?: number;
	/** VAT to recover on credit notes issued (grid 64). */
	salesCreditNoteVat?: number;
	/**
	 * December advance paid under the actual-figures method (grid 91). Only
	 * valid on the December or Q4 declaration. Set it (even to 0.00 — a zero is
	 * meaningful and emitted) only when electing that method; a filled grid 91
	 * tells Intervat the advance was computed from the Dec 1-20 (or Oct 1-Dec
	 * 20) actuals rather than the previous period's amount. Not part of the
	 * 71/72 balance.
	 */
	prepayment?: number;
}

export interface BelgianVatGridResult {
	grid: VatReturnGrid;
	/** Non-fatal issues: unmappable rates, clamped negatives, etc. */
	warnings: string[];
}

/** Base-amount grid box for each standard Belgian VAT rate. */
const RATE_TO_BASE_GRID: Record<number, VatGridNumber> = { 6: 1, 12: 2, 21: 3 };

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Map semantic Belgian VAT figures onto grid boxes.
 *
 * - Sales bases land in boxes 00/01/02/03 by rate; output VAT sums into box 54.
 *   Special sales regimes land in their own boxes: intra-community services in
 *   44, domestic reverse charge (co-contractor) in 45, intra-community goods in
 *   46, exports and other exempt sales in 47.
 * - Purchase base lands in box 82 (services & misc goods — the goods/investment
 *   split across 81/83 is not modelled) and deductible VAT in box 59.
 *   Reverse-charge purchase bases additionally land in 86 (IC goods), 88 (IC
 *   services) and 87 (imports + domestic reverse charge), with the self-assessed
 *   VAT in 55/56/57.
 * - Credit-note bases land in the dedicated correction boxes: issued in 48
 *   (relating to 44/46) or 49 (other frame II), received in 84 (relating to
 *   86/88) or 85 (other frame III). The VAT on received credit notes goes to
 *   63 (to pay back) and on issued credit notes to 64 (to recover);
 *   miscellaneous regularisations go to 61/62.
 * - The balance (54+55+56+57+61+63 minus 59+62+64) goes to box 71 (payable) or
 *   72 (refundable). One of the two is always emitted, so a nihil period still
 *   produces a valid declaration.
 * - The December advance (`prepayment`) goes to box 91 whenever it is set,
 *   including at 0.00 (a zero grid 91 declares "actual-figures method, nothing
 *   due"). It does not enter the 71/72 balance.
 *
 * Amounts must be non-negative; a net-negative box (e.g. credit notes exceeding
 * invoices in the period) is clamped to 0 with a warning — Intervat accepts no
 * negative grids, so the excess must be carried into the next period manually.
 */
export function computeBelgianVatGrid(
	figures: BelgianVatReturnFigures,
): BelgianVatGridResult {
	const warnings: string[] = [];
	const grid: VatReturnGrid = {};

	const baseByBox = new Map<VatGridNumber, number>();
	let standardOutputVat = 0;
	for (const sale of figures.standardRatedSales) {
		const box = RATE_TO_BASE_GRID[sale.rate];
		if (box === undefined) {
			warnings.push(
				`Sales at ${sale.rate}% VAT are not a standard Belgian rate (6/12/21) and were omitted from the declaration.`,
			);
			continue;
		}
		baseByBox.set(box, (baseByBox.get(box) ?? 0) + sale.base);
		standardOutputVat += sale.vat;
	}

	const clampNonNegative = (value: number, label: string): number => {
		if (value < 0) {
			warnings.push(
				`${label} netted to a negative amount (${round2(value).toFixed(2)}); clamped to 0.00. Intervat accepts no negative grids — carry the excess into the next period.`,
			);
			return 0;
		}
		return round2(value);
	};

	const setBox = (
		box: VatGridNumber,
		value: number | undefined,
		label: string,
	): number => {
		if (value === undefined) return 0;
		const rounded = clampNonNegative(value, label);
		if (rounded > 0) grid[box] = rounded;
		return rounded;
	};

	for (const [box, base] of baseByBox) {
		const rounded = clampNonNegative(base, `Grid ${box} base`);
		if (rounded > 0) grid[box] = rounded;
	}

	setBox(0, figures.zeroRatedSales, "Zero-rated sales (grid 00)");
	setBox(44, figures.icServicesSales, "Intra-community services (grid 44)");
	setBox(
		45,
		figures.domesticReverseChargeSales,
		"Domestic reverse-charge sales (grid 45)",
	);
	setBox(46, figures.icGoodsSales, "Intra-community goods (grid 46)");
	setBox(47, figures.exportSales, "Exports and other exempt sales (grid 47)");
	setBox(
		48,
		figures.icSalesCreditNoteBase,
		"Credit notes issued on IC supplies (grid 48)",
	);
	setBox(
		49,
		figures.otherSalesCreditNoteBase,
		"Credit notes issued on other sales (grid 49)",
	);

	const outputVat = setBox(54, standardOutputVat, "Output VAT (grid 54)");

	setBox(82, figures.purchaseBase, "Purchase base (grid 82)");
	const deductibleVat = setBox(59, figures.deductibleVat, "Deductible VAT (grid 59)");

	setBox(86, figures.icGoodsPurchaseBase, "IC goods acquisitions (grid 86)");
	setBox(88, figures.icServicesPurchaseBase, "IC services received (grid 88)");
	setBox(
		87,
		figures.otherReverseChargePurchaseBase,
		"Other reverse-charge purchases (grid 87)",
	);
	setBox(
		84,
		figures.icPurchaseCreditNoteBase,
		"Credit notes received on IC acquisitions (grid 84)",
	);
	setBox(
		85,
		figures.otherPurchaseCreditNoteBase,
		"Credit notes received on other purchases (grid 85)",
	);
	const icOutputVat = setBox(55, figures.icOutputVat, "IC acquisition VAT (grid 55)");
	const rcOutputVat = setBox(
		56,
		figures.domesticReverseChargeOutputVat,
		"Domestic reverse-charge VAT (grid 56)",
	);
	const importVat = setBox(57, figures.importOutputVat, "Import VAT (grid 57)");
	const correctionsDue = setBox(
		61,
		figures.vatCorrectionsDue,
		"VAT regularisations in favour of the State (grid 61)",
	);
	const correctionsRecoverable = setBox(
		62,
		figures.vatCorrectionsRecoverable,
		"VAT regularisations in favour of the declarant (grid 62)",
	);
	const purchaseCreditNoteVat = setBox(
		63,
		figures.purchaseCreditNoteVat,
		"VAT on credit notes received (grid 63)",
	);
	const salesCreditNoteVat = setBox(
		64,
		figures.salesCreditNoteVat,
		"VAT on credit notes issued (grid 64)",
	);

	// Grid 91 is emitted even at 0.00 (unlike every other box): a zero declares
	// the actual-figures method with nothing due, while omission means the
	// advance was based on the previous period (or no advance applies).
	if (figures.prepayment !== undefined) {
		grid[91] = clampNonNegative(figures.prepayment, "December advance (grid 91)");
	}

	const balance = round2(
		outputVat +
			icOutputVat +
			rcOutputVat +
			importVat +
			correctionsDue +
			purchaseCreditNoteVat -
			deductibleVat -
			correctionsRecoverable -
			salesCreditNoteVat,
	);
	if (balance >= 0) {
		grid[71] = balance;
	} else {
		grid[72] = round2(-balance);
	}

	return { grid, warnings };
}

export interface BuildBelgianVatReturnInput {
	declarant: VatReturnDeclarant;
	period: VatReturnPeriod;
	figures: BelgianVatReturnFigures;
	sequenceNumber?: number;
	declarantReference?: string;
	clientListingNihil?: boolean;
	askRestitution?: boolean;
	askPayment?: boolean;
	replacedDeclaration?: string;
}

export interface BuildBelgianVatReturnResult {
	xml: string;
	grid: VatReturnGrid;
	warnings: string[];
}

/**
 * Convenience: map Belgian figures onto the grid and serialize in one call.
 * A refund is requested automatically when the period is in credit (box 72),
 * unless `askRestitution` is set explicitly.
 */
export function buildBelgianVatReturn(
	input: BuildBelgianVatReturnInput,
): BuildBelgianVatReturnResult {
	const { figures, askRestitution, ...options } = input;
	const { grid, warnings } = computeBelgianVatGrid(figures);
	const xml = serializeVatReturn({
		...options,
		grid,
		askRestitution: askRestitution ?? grid[72] !== undefined,
	});
	return { xml, grid, warnings };
}
