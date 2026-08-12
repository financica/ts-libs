/**
 * The fee tables. One per transfer currency, each a list of fee lines followed
 * by its own totals block.
 *
 * The table has no rules or borders to key off, so its extent is inferred:
 * a `Transfer Currency:` heading opens it, the first indented totals row ends
 * the lines, and the first left-margin row after that (the settlement note, the
 * legal paragraph) ends the section.
 *
 * A section billed in a currency other than the one Stripe reports the invoice
 * in restates its totals in a second column, under `in USD` / `in EUR`
 * headings. Only the totals are restated; the fee lines stay in the section's
 * own currency.
 */
import { parseAmount } from "./amount.js";
import { indentedItems, leftText } from "./layout.js";
import {
	CONVERSION_HEADING_RE,
	CURRENCY_HEADING_RE,
	resolveTotalKey,
	VOLUME_RE,
} from "./patterns.js";
import type {
	FeeSection,
	FeeVolume,
	SectionTotals,
	TextItem,
	TextRow,
} from "./types.js";

/**
 * Right edges of the two amount columns when the headings cannot be measured,
 * from real invoices. Both columns are right-aligned, so these are the only
 * coordinates that stay put as the numbers change width.
 */
const FALLBACK_FEE_COLUMN_RIGHT = 471;
const FALLBACK_VAT_COLUMN_RIGHT = 557;

/**
 * How far below its fee line a description line may sit, in points. Printed
 * gaps are ~15; the limit exists so that page furniture below a table that
 * breaks across pages is not read as a description.
 */
const DETAIL_MAX_GAP = 25;

/** `1 other refund totaling –€29.75` read as a count and a volume. */
export const parseVolume = (detail: string): FeeVolume | null => {
	const match = detail.trim().match(VOLUME_RE);
	if (!match) return null;
	const count = Number.parseInt((match[1] ?? "").replace(/,/g, ""), 10);
	const amount = parseAmount(match[3]);
	if (!Number.isFinite(count) || amount === null) return null;
	return { count, kind: (match[2] ?? "").trim(), amount };
};

const emptyTotals = (): SectionTotals => ({
	stripeFees: null,
	totalVat: null,
	total: null,
	debitedFromBalance: null,
	amountDue: null,
});

const emptySection = (currency: string): FeeSection => ({
	currency,
	lines: [],
	totals: emptyTotals(),
	convertedCurrency: null,
	convertedTotals: null,
});

/** The column headings, when the currency heading row prints them. */
const columnEdges = (row: TextRow) => {
	const heading = (text: string) =>
		row.items.find((item) => item.str === text)?.right ?? null;
	return {
		fee: heading("Fee Amount") ?? FALLBACK_FEE_COLUMN_RIGHT,
		vat: heading("VAT") ?? FALLBACK_VAT_COLUMN_RIGHT,
	};
};

/** Every amount printed in the indented columns, left to right. */
const amountsOf = (row: TextRow): { item: TextItem; value: number }[] =>
	indentedItems(row)
		.map((item) => ({ item, value: parseAmount(item.str) }))
		.filter(
			(entry): entry is { item: TextItem; value: number } => entry.value !== null,
		);

/** Everything on a row that is not an amount, which is its label. */
const labelOf = (row: TextRow): string =>
	indentedItems(row)
		.filter((item) => parseAmount(item.str) === null)
		.map((item) => item.str)
		.join(" ")
		.trim();

/**
 * Split a fee row's amounts across the fee and VAT columns. Order settles a row
 * that prints both; a row that prints only one is placed by which heading it
 * ends closest to.
 */
const splitAmounts = (
	amounts: readonly { item: TextItem; value: number }[],
	edges: { fee: number; vat: number },
): { feeAmount: number; vatAmount: number | null } | null => {
	const [first, second] = amounts;
	if (!first) return null;
	if (second) return { feeAmount: first.value, vatAmount: second.value };

	const toFee = Math.abs(first.item.right - edges.fee);
	const toVat = Math.abs(first.item.right - edges.vat);
	return toVat < toFee
		? { feeAmount: 0, vatAmount: first.value }
		: { feeAmount: first.value, vatAmount: null };
};

/** `in USD` / `in EUR`, the headings over a restated totals block. */
const conversionHeadings = (row: TextRow): string[] | null => {
	const items = indentedItems(row);
	if (items.length !== 2) return null;
	const codes = items.map((item) => item.str.match(CONVERSION_HEADING_RE)?.[1]);
	return codes.every((code): code is string => Boolean(code)) ? codes : null;
};

/** Every fee table in the document, in printed order. */
export const parseSections = (rows: readonly TextRow[]): FeeSection[] => {
	const sections: FeeSection[] = [];
	let section: FeeSection | null = null;
	let edges = { fee: FALLBACK_FEE_COLUMN_RIGHT, vat: FALLBACK_VAT_COLUMN_RIGHT };
	let inTotals = false;
	/** The row the last description was read from, for the wrap test. */
	let lineRow: TextRow | null = null;

	for (const row of rows) {
		const left = leftText(row);

		const currency = left.match(CURRENCY_HEADING_RE)?.[1];
		if (currency) {
			section = emptySection(currency);
			sections.push(section);
			edges = columnEdges(row);
			inTotals = false;
			lineRow = null;
			continue;
		}

		if (!section) continue;

		if (left) {
			// A left-margin row once the totals have started is the prose under the
			// table, not part of it.
			if (inTotals) {
				section = null;
				continue;
			}

			const split = splitAmounts(amountsOf(row), edges);
			if (split) {
				section.lines.push({
					description: left,
					detail: null,
					volume: null,
					lineOrder: section.lines.length,
					...split,
				});
				lineRow = row;
				continue;
			}

			// No amounts: the description line printed under the fee above.
			const previous = section.lines.at(-1);
			const gap = lineRow ? lineRow.y - row.y : Number.POSITIVE_INFINITY;
			if (previous && gap > 0 && gap <= DETAIL_MAX_GAP) {
				previous.detail = previous.detail ? `${previous.detail} ${left}` : left;
				previous.volume = parseVolume(previous.detail);
				// Chain, so a description that wraps onto a third row still attaches.
				lineRow = row;
			}
			continue;
		}

		const conversion = conversionHeadings(row);
		if (conversion) {
			// The first heading restates the section's own currency; the second is
			// what it is being converted to.
			section.convertedCurrency = conversion[1] ?? null;
			section.convertedTotals = emptyTotals();
			continue;
		}

		const key = resolveTotalKey(labelOf(row));
		if (!key) continue;
		const [own, converted] = amountsOf(row);
		if (!own) continue;
		inTotals = true;
		section.totals[key] = own.value;
		if (converted && section.convertedTotals) {
			section.convertedTotals[key] = converted.value;
		}
	}

	return sections;
};
