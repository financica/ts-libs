import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
	buildBelgianVatReturn,
	computeBelgianVatGrid,
	isDecemberAdvancePeriod,
	normalizeBelgianVatNumber,
	serializeVatReturn,
	type VatReturnDeclarant,
} from "../src/vat-return";

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	// Keep amounts and grid numbers as strings so "1000.00" survives intact.
	parseTagValue: false,
	parseAttributeValue: false,
});

/** Cast a parsed value to an addressable node without reaching for `any`. */
const node = (value: unknown): Record<string, unknown> =>
	value as Record<string, unknown>;

const parse = (xml: string): Record<string, unknown> => node(parser.parse(xml));

const declaration = (xml: string): Record<string, unknown> =>
	node(node(parse(xml)["ns2:VATConsignment"])["ns2:VATDeclaration"]);

const declarant: VatReturnDeclarant = {
	vatNumber: "BE0806.153.934",
	name: "Acme BV",
	street: "Nieuwstraat 1",
	postCode: "1000",
	city: "Brussel",
	countryCode: "BE",
	email: "vat@acme.example",
};

describe("normalizeBelgianVatNumber", () => {
	it("strips prefix, dots and spaces", () => {
		expect(normalizeBelgianVatNumber("BE 0806.153.934")).toBe("0806153934");
	});

	it("zero-pads a legacy 9-digit number", () => {
		expect(normalizeBelgianVatNumber("806153934")).toBe("0806153934");
	});

	it("rejects a number that is not 9 or 10 digits", () => {
		expect(() => normalizeBelgianVatNumber("12345")).toThrow();
	});
});

describe("serializeVatReturn", () => {
	const xml = serializeVatReturn({
		declarant,
		period: { year: 2026, quarter: 2 },
		grid: { 3: 1000, 54: 210, 59: 50, 71: 160 },
	});
	const consignment = node(parse(xml)["ns2:VATConsignment"]);
	const decl = declaration(xml);

	it("declares both namespaces on the root", () => {
		expect(consignment["@_xmlns"]).toBe("http://www.minfin.fgov.be/InputCommon");
		expect(consignment["@_xmlns:ns2"]).toBe(
			"http://www.minfin.fgov.be/VATConsignment",
		);
		expect(consignment["@_VATDeclarationsNbr"]).toBe("1");
	});

	it("defaults the declaration sequence number to 1", () => {
		expect(decl["@_SequenceNumber"]).toBe("1");
	});

	it("writes the declarant with a normalized VAT number and address", () => {
		const dec = node(decl["ns2:Declarant"]);
		expect(dec["VATNumber"]).toBe("0806153934");
		expect(dec["Name"]).toBe("Acme BV");
		expect(dec["PostCode"]).toBe("1000");
		expect(dec["CountryCode"]).toBe("BE");
		expect(dec["EmailAddress"]).toBe("vat@acme.example");
	});

	it("writes a quarter period", () => {
		const period = node(decl["ns2:Period"]);
		expect(period["ns2:Quarter"]).toBe("2");
		expect(period["ns2:Year"]).toBe("2026");
	});

	it("writes each grid box as an Amount with a GridNumber and 2 decimals", () => {
		const amounts = node(decl["ns2:Data"])["ns2:Amount"] as {
			"@_GridNumber": string;
			"#text": string;
		}[];
		const byGrid = new Map(amounts.map((a) => [a["@_GridNumber"], a["#text"]]));
		expect(byGrid.get("3")).toBe("1000.00");
		expect(byGrid.get("54")).toBe("210.00");
		expect(byGrid.get("59")).toBe("50.00");
		expect(byGrid.get("71")).toBe("160.00");
	});

	it("always emits ClientListingNihil and Ask", () => {
		expect(decl["ns2:ClientListingNihil"]).toBe("NO");
		const ask = node(decl["ns2:Ask"]);
		expect(ask["@_Restitution"]).toBe("NO");
		expect(ask["@_Payment"]).toBe("NO");
	});

	it("emits a Month period when given a month", () => {
		const period = node(
			declaration(
				serializeVatReturn({
					declarant,
					period: { year: 2026, month: 4 },
					grid: { 71: 0 },
				}),
			)["ns2:Period"],
		);
		expect(period["ns2:Month"]).toBe("4");
		expect(period["ns2:Year"]).toBe("2026");
	});

	it("escapes special characters in text and attributes", () => {
		const out = serializeVatReturn({
			declarant: { ...declarant, name: "A & B <Ltd>" },
			period: { year: 2026, quarter: 1 },
			grid: { 71: 0 },
			declarantReference: 'ref"1',
		});
		expect(out).toContain("<Name>A &amp; B &lt;Ltd&gt;</Name>");
		expect(out).toContain('DeclarantReference="ref&quot;1"');
	});

	it("rejects a negative grid amount", () => {
		expect(() =>
			serializeVatReturn({
				declarant,
				period: { year: 2026, quarter: 1 },
				grid: { 71: -5 },
			}),
		).toThrow();
	});

	it("rejects an empty grid", () => {
		expect(() =>
			serializeVatReturn({
				declarant,
				period: { year: 2026, quarter: 1 },
				grid: {},
			}),
		).toThrow();
	});

	it("rejects an out-of-range quarter", () => {
		expect(() =>
			serializeVatReturn({
				declarant,
				period: { year: 2026, quarter: 5 },
				grid: { 71: 0 },
			}),
		).toThrow();
	});
});

describe("computeBelgianVatGrid", () => {
	it("maps rates to base boxes and sums output VAT into box 54", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [
				{ rate: 21, base: 1000, vat: 210 },
				{ rate: 6, base: 500, vat: 30 },
				{ rate: 21, base: 200, vat: 42 },
			],
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[3]).toBe(1200); // 1000 + 200 at 21%
		expect(grid[1]).toBe(500); // 6%
		expect(grid[54]).toBe(282); // 210 + 30 + 42
	});

	it("puts purchases in box 82 / 59 and a payable balance in box 71", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
			purchaseBase: 400,
			deductibleVat: 84,
		});
		expect(grid[82]).toBe(400);
		expect(grid[59]).toBe(84);
		expect(grid[71]).toBe(126); // 210 - 84
		expect(grid[72]).toBeUndefined();
	});

	it("puts a refundable balance in box 72", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 100, vat: 21 }],
			purchaseBase: 1000,
			deductibleVat: 210,
		});
		expect(grid[72]).toBe(189); // 210 - 21
		expect(grid[71]).toBeUndefined();
	});

	it("warns and omits a non-standard rate", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 9, base: 100, vat: 9 }],
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[1]).toBeUndefined();
		expect(grid[54]).toBeUndefined();
		expect(warnings.some((w) => w.includes("9%"))).toBe(true);
	});

	it("clamps a net-negative base to zero with a warning", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: -50, vat: -10 }],
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[3]).toBeUndefined();
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("always emits box 71 for a nihil period", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [],
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[71]).toBe(0);
	});

	it("maps special sales regimes to boxes 00/44/45/46/47", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [],
			zeroRatedSales: 100,
			icServicesSales: 200,
			domesticReverseChargeSales: 300,
			icGoodsSales: 400,
			exportSales: 500,
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(warnings).toHaveLength(0);
		expect(grid[0]).toBe(100);
		expect(grid[44]).toBe(200);
		expect(grid[45]).toBe(300);
		expect(grid[46]).toBe(400);
		expect(grid[47]).toBe(500);
		expect(grid[54]).toBeUndefined();
		expect(grid[71]).toBe(0); // no VAT due on any of these
	});

	it("maps reverse-charge purchases to 86/88/87 with VAT in 55/56/57", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [],
			purchaseBase: 600, // 100 + 200 + 300, also reported in 82
			deductibleVat: 126,
			icGoodsPurchaseBase: 100,
			icServicesPurchaseBase: 200,
			otherReverseChargePurchaseBase: 300,
			icOutputVat: 63, // 21% of 100 + 200
			domesticReverseChargeOutputVat: 42,
			importOutputVat: 21,
		});
		expect(warnings).toHaveLength(0);
		expect(grid[82]).toBe(600);
		expect(grid[86]).toBe(100);
		expect(grid[88]).toBe(200);
		expect(grid[87]).toBe(300);
		expect(grid[55]).toBe(63);
		expect(grid[56]).toBe(42);
		expect(grid[57]).toBe(21);
		expect(grid[59]).toBe(126);
		// 55 + 56 + 57 = 126 self-assessed, fully deducted in 59
		expect(grid[71]).toBe(0);
	});

	it("includes self-assessed VAT in the payable balance", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
			purchaseBase: 100,
			deductibleVat: 10, // partial deduction of the self-assessed VAT
			icServicesPurchaseBase: 100,
			icOutputVat: 21,
		});
		expect(grid[71]).toBe(221); // 210 + 21 - 10
	});

	it("maps credit-note corrections to 48/49/84/85 with the VAT in 63/64", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
			icSalesCreditNoteBase: 150,
			otherSalesCreditNoteBase: 300,
			salesCreditNoteVat: 63,
			purchaseBase: 400,
			deductibleVat: 84,
			icPurchaseCreditNoteBase: 120,
			otherPurchaseCreditNoteBase: 200,
			purchaseCreditNoteVat: 42,
		});
		expect(warnings).toHaveLength(0);
		expect(grid[48]).toBe(150);
		expect(grid[49]).toBe(300);
		expect(grid[64]).toBe(63);
		expect(grid[84]).toBe(120);
		expect(grid[85]).toBe(200);
		expect(grid[63]).toBe(42);
		// (210 + 42) - (84 + 63)
		expect(grid[71]).toBe(105);
	});

	it("includes regularisations 61/62 in the balance", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
			purchaseBase: 0,
			deductibleVat: 0,
			vatCorrectionsDue: 30,
			vatCorrectionsRecoverable: 50,
		});
		expect(grid[61]).toBe(30);
		expect(grid[62]).toBe(50);
		expect(grid[71]).toBe(190); // 210 + 30 - 50
	});

	it("puts a credit-note-driven refund in box 72", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [],
			otherSalesCreditNoteBase: 1000,
			salesCreditNoteVat: 210,
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[49]).toBe(1000);
		expect(grid[64]).toBe(210);
		expect(grid[71]).toBeUndefined();
		expect(grid[72]).toBe(210);
	});

	it("puts the December advance in box 91 without touching the balance", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
			purchaseBase: 0,
			deductibleVat: 0,
			prepayment: 150.5,
		});
		expect(grid[91]).toBe(150.5);
		expect(grid[71]).toBe(210);
	});

	it("emits a zero grid 91 when the prepayment is set to 0", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [],
			purchaseBase: 0,
			deductibleVat: 0,
			prepayment: 0,
		});
		expect(grid[91]).toBe(0);
	});

	it("omits grid 91 when no prepayment is set", () => {
		const { grid } = computeBelgianVatGrid({
			standardRatedSales: [],
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[91]).toBeUndefined();
	});

	it("clamps a negative prepayment to 0.00 with a warning", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [],
			purchaseBase: 0,
			deductibleVat: 0,
			prepayment: -10,
		});
		expect(grid[91]).toBe(0);
		expect(warnings.some((w) => w.includes("grid 91"))).toBe(true);
	});

	it("clamps a negative special-regime box with a warning", () => {
		const { grid, warnings } = computeBelgianVatGrid({
			standardRatedSales: [],
			icGoodsSales: -250,
			purchaseBase: 0,
			deductibleVat: 0,
		});
		expect(grid[46]).toBeUndefined();
		expect(warnings.some((w) => w.includes("grid 46"))).toBe(true);
	});
});

// Eligibility, not emission: the grid-91 cases above assert whether the box is
// EMITTED for a given prepayment; these assert which periods may carry it at all.
describe("isDecemberAdvancePeriod", () => {
	it("makes the year's last period eligible for grid 91", () => {
		expect(isDecemberAdvancePeriod({ year: 2025, month: 12 })).toBe(true);
		expect(isDecemberAdvancePeriod({ year: 2025, quarter: 4 })).toBe(true);
	});

	it("leaves every other period ineligible for grid 91", () => {
		expect(isDecemberAdvancePeriod({ year: 2025, month: 11 })).toBe(false);
		expect(isDecemberAdvancePeriod({ year: 2025, quarter: 3 })).toBe(false);
	});
});

describe("buildBelgianVatReturn", () => {
	it("produces XML and asks for restitution when in credit", () => {
		const { xml, grid, warnings } = buildBelgianVatReturn({
			declarant,
			period: { year: 2026, quarter: 2 },
			figures: {
				standardRatedSales: [{ rate: 21, base: 100, vat: 21 }],
				purchaseBase: 1000,
				deductibleVat: 210,
			},
		});
		expect(warnings).toHaveLength(0);
		expect(grid[72]).toBe(189);
		const ask = node(declaration(xml)["ns2:Ask"]);
		expect(ask["@_Restitution"]).toBe("YES");
	});

	it("serializes a zero December advance as an explicit 0.00 in grid 91", () => {
		const { xml } = buildBelgianVatReturn({
			declarant,
			period: { year: 2026, month: 12 },
			figures: {
				standardRatedSales: [],
				purchaseBase: 0,
				deductibleVat: 0,
				prepayment: 0,
			},
		});
		const data = node(declaration(xml)["ns2:Data"]);
		const amounts = [data["ns2:Amount"]].flat().map(node);
		const box91 = amounts.find((a) => a["@_GridNumber"] === "91");
		expect(box91?.["#text"]).toBe("0.00");
	});
});
