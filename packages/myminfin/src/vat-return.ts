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

import { escapeXmlAttr, escapeXmlText } from "./xml-escape";

const VAT_NS = "http://www.minfin.fgov.be/VATConsignment";
const COMMON_NS = "http://www.minfin.fgov.be/InputCommon";

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

function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		throw new Error(`VAT grid amount must be finite, received ${value}`);
	}
	if (value < 0) {
		throw new Error(
			`VAT grid amounts must be non-negative (PositiveAmount_Type), received ${value}`,
		);
	}
	return value.toFixed(2);
}

function declarantChildren(declarant: VatReturnDeclarant): string[] {
	const el = (name: string, text: string) =>
		`<${name}>${escapeXmlText(text)}</${name}>`;
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

	if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
		throw new Error(
			`sequenceNumber must be a positive integer, received ${sequenceNumber}`,
		);
	}

	const yesNo = (value: boolean) => (value ? "YES" : "NO");
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
 * The figures this library maps onto the Belgian grid today. Deliberately
 * narrow: it covers domestic standard-rated sales and deductible domestic
 * purchases. Intra-community, exports, reverse charge, corrections, investment
 * goods and prepayments are not modelled yet.
 */
export interface BelgianVatReturnFigures {
	/** Domestic standard-rated sales, one entry per rate (6/12/21). */
	standardRatedSales: BelgianStandardRatedSale[];
	/** Total net base of purchases carrying deductible VAT. */
	purchaseBase: number;
	/** Total deductible input VAT. */
	deductibleVat: number;
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
 * - Sales bases land in boxes 01/02/03 by rate; output VAT sums into box 54.
 * - Purchase base lands in box 82 (services & misc goods — the goods/investment
 *   split across 81/83 is not modelled) and deductible VAT in box 59.
 * - The balance goes to box 71 (payable) or 72 (refundable). One of the two is
 *   always emitted, so a nihil period still produces a valid declaration.
 *
 * Amounts must be non-negative; a net-negative box (e.g. credit notes exceeding
 * invoices in the period) is clamped to 0 with a warning, since Intervat has no
 * negative grids and the dedicated correction boxes are not modelled yet.
 */
export function computeBelgianVatGrid(
	figures: BelgianVatReturnFigures,
): BelgianVatGridResult {
	const warnings: string[] = [];
	const grid: VatReturnGrid = {};

	const baseByBox = new Map<VatGridNumber, number>();
	let outputVat = 0;
	for (const sale of figures.standardRatedSales) {
		const box = RATE_TO_BASE_GRID[sale.rate];
		if (box === undefined) {
			warnings.push(
				`Sales at ${sale.rate}% VAT are not a standard Belgian rate (6/12/21) and were omitted from the declaration.`,
			);
			continue;
		}
		baseByBox.set(box, (baseByBox.get(box) ?? 0) + sale.base);
		outputVat += sale.vat;
	}

	const clampNonNegative = (value: number, label: string): number => {
		if (value < 0) {
			warnings.push(
				`${label} netted to a negative amount (${round2(value).toFixed(2)}); clamped to 0.00. Credit-note correction boxes are not modelled yet.`,
			);
			return 0;
		}
		return round2(value);
	};

	for (const [box, base] of baseByBox) {
		const rounded = clampNonNegative(base, `Grid ${box} base`);
		if (rounded > 0) grid[box] = rounded;
	}

	outputVat = clampNonNegative(outputVat, "Output VAT (grid 54)");
	if (outputVat > 0) grid[54] = outputVat;

	const purchaseBase = clampNonNegative(
		figures.purchaseBase,
		"Purchase base (grid 82)",
	);
	if (purchaseBase > 0) grid[82] = purchaseBase;

	const deductibleVat = clampNonNegative(
		figures.deductibleVat,
		"Deductible VAT (grid 59)",
	);
	if (deductibleVat > 0) grid[59] = deductibleVat;

	const balance = round2(outputVat - deductibleVat);
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
	const { grid, warnings } = computeBelgianVatGrid(input.figures);
	const xml = serializeVatReturn({
		declarant: input.declarant,
		period: input.period,
		grid,
		sequenceNumber: input.sequenceNumber,
		declarantReference: input.declarantReference,
		clientListingNihil: input.clientListingNihil,
		askRestitution: input.askRestitution ?? grid[72] !== undefined,
		askPayment: input.askPayment,
		replacedDeclaration: input.replacedDeclaration,
	});
	return { xml, grid, warnings };
}
