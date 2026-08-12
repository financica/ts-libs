/**
 * Invoices built the way the PDF prints them: absolute positions, page by page.
 *
 * The coordinates are lifted from real invoices; the identities are not. Both
 * amount columns are right-aligned, at x=471 and x=557, and the tests depend on
 * that far more than on where a number starts.
 */
import { groupIntoRows } from "../src/layout.js";
import type { TextItem, TextRow } from "../src/types.js";

/** One run of text: where it starts, what it says, where it ends. */
export type Cell = [x: number, text: string, right?: number];

/** One printed line: a baseline and the runs sitting on it. */
export type Line = [y: number, cells: Cell[]];

const toItem = ([x, str, right]: Cell): TextItem => ({
	str,
	x,
	// Roughly the width the real font gives a run, when it does not matter.
	right: right ?? Math.round(x + str.length * 4.3),
	y: 0,
});

/**
 * Lay out pages exactly as the PDF reader hands them over: items in document
 * order, rows grouped per page and concatenated.
 */
export const layout = (...pages: Line[][]): { items: TextItem[]; rows: TextRow[] } => {
	const items: TextItem[] = [];
	const rows: TextRow[] = [];
	for (const page of pages) {
		const pageItems = page.flatMap(([y, cells]) =>
			cells.map((cell) => ({ ...toItem(cell), y })),
		);
		items.push(...pageItems);
		rows.push(...groupIntoRows(pageItems));
	}
	return { items, rows };
};

/** The identity block, which every invoice prints in the same place. */
export const HEADER: Line[] = [
	[723, [[458, "Tax Invoice", 558]]],
	[
		697,
		[
			[54, "Stripe Payments Europe, Limited"],
			[316, "Account Number"],
			[450, "acct_1EXAMPLE0000000000", 558],
		],
	],
	[
		684,
		[
			[54, "One Wilton Park"],
			[316, "Invoice Number"],
			[477, "EXAMPLE0-2025-08", 558],
		],
	],
	[
		670,
		[
			[54, "Wilton Place"],
			[316, "Invoice Date"],
			[512, "Sep 1, 2025", 558],
		],
	],
	[
		657,
		[
			[54, "Dublin 2"],
			[316, "Service Month"],
			[520, "Aug 2025", 558],
		],
	],
	[
		643,
		[
			[54, "D02FX04"],
			[316, "Stripe VAT Number"],
			[502, "IE 3206488LH", 558],
		],
	],
	[
		630,
		[
			[54, "Ireland"],
			[316, "Customer VAT Number"],
			[497, "BE0123456789", 558],
		],
	],
	[
		602,
		[
			[54, "Bill to Example Trading BV"],
			[316, "Reverse Charge VAT may be applicable.", 472],
		],
	],
	[589, [[54, "Rue Example 1"]]],
	[575, [[54, "Bruxelles"]]],
	[562, [[54, "1000"]]],
	[548, [[54, "BE"]]],
	[535, [[54, "billing@example.test"]]],
];

/** The prose and page furniture printed under a fee table. */
export const FOOTER: Line[] = [
	[230, [[54, "The total above has been debited from your Stripe balance."]]],
	[
		203,
		[
			[
				54,
				"It is the responsibility of the customer to determine the correct local treatment",
			],
		],
	],
	[
		32,
		[
			[54, "Questions? We're here to help. Contact us at support.stripe.com."],
			[456, "Aug 2025 — Page 1 of 1", 558],
		],
	],
];

/** The `Transfer Currency:` heading, with the two column headings on it. */
export const currencyHeading = (y: number, currency: string): Line => [
	y,
	[
		[55, `Transfer Currency: ${currency}`],
		[428, "Fee Amount", 471],
		[541, "VAT", 556],
	],
];

/** A fee row: description on the left, the two amounts right-aligned. */
export const feeLine = (
	y: number,
	description: string,
	fee: string,
	vat: string,
): Line => [
	y,
	[
		[55, description],
		[471 - fee.length * 4.6, fee, 471],
		[557 - vat.length * 4.6, vat, 557],
	],
];

/** A totals row: label in the indented column, amount right-aligned. */
export const totalLine = (y: number, label: string, amount: string): Line => [
	y,
	[
		[316, label],
		[557 - amount.length * 4.6, amount, 557],
	],
];
