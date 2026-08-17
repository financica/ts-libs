import { describe, expect, it } from "vitest";
import { detectStripeTaxInclusive } from "../src/tax.js";

const inclusive = { amount: 2100, inclusive: true };
const exclusive = { amount: 600, inclusive: false };
const zero = { amount: 0, inclusive: false };
const withLines = (...taxAmountsPerLine: Array<Array<typeof inclusive>>) => ({
	total_tax_amounts: [],
	lines: { data: taxAmountsPerLine.map((tax_amounts) => ({ tax_amounts })) },
});

describe("detectStripeTaxInclusive", () => {
	it.each([
		[
			"all invoice-level entries inclusive",
			{ total_tax_amounts: [inclusive, inclusive] },
			true,
		],
		["invoice-level entries exclusive", { total_tax_amounts: [exclusive] }, false],
		[
			"a mix of inclusive and exclusive at invoice level",
			{ total_tax_amounts: [inclusive, exclusive] },
			false,
		],
		// Zero-amount entries carry no signal (exempt / reverse-charge lines);
		// the lines decide instead.
		[
			"only zero-amount invoice-level entries, inclusive lines",
			{
				total_tax_amounts: [zero],
				lines: { data: [{ tax_amounts: [inclusive] }] },
			},
			true,
		],
		[
			"no invoice-level entries, all lines inclusive",
			withLines([inclusive], [inclusive]),
			true,
		],
		[
			"no invoice-level entries, one line exclusive",
			withLines([inclusive], [exclusive]),
			false,
		],
		["no tax entries at all", {}, null],
		["empty entries and empty lines", withLines(), null],
		[
			"only zero-amount entries and no lines",
			{ total_tax_amounts: [zero], lines: { data: [] } },
			null,
		],
	])("%s → %s", (_label, invoice, expected) => {
		expect(detectStripeTaxInclusive(invoice)).toBe(expected);
	});

	it("reads a non-zero entry with no `inclusive` flag as exclusive", () => {
		// Pins CURRENT behaviour. The module doc says `null` means "the payload
		// did not say", yet an entry that omits `inclusive` (rather than one
		// that says `false`) is judged exclusive, which books a possibly
		// VAT-inclusive invoice at its gross amount. Flagged, not changed here.
		expect(
			detectStripeTaxInclusive({ total_tax_amounts: [{ amount: 2100 }] }),
		).toBe(false);
	});
});
