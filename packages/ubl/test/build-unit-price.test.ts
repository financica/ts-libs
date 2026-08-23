import { describe, expect, it } from "vitest";
import {
	deriveUnitPrice,
	reconcileLinesToExclTotal,
	roundCurrency,
	serializeUblDocument,
	type UblDocument,
	type UblLine,
	type UblParty,
} from "../src/build/index.js";

/**
 * PEPPOL-EN16931-R120, as the validator states it: the line net amount must
 * equal `quantity × (priceAmount ÷ baseQuantity)` (plus charges, less
 * allowances) within a 0.02 tolerance, with `baseQuantity` defaulting to 1.
 */
const r120Residual = (line: {
	quantity: number;
	priceAmount: number;
	baseQuantity?: number | undefined;
	lineExtensionAmount: number;
}): number =>
	Math.abs(
		line.quantity * (line.priceAmount / (line.baseQuantity ?? 1)) -
			line.lineExtensionAmount,
	);

// The residual is exact up to IEEE-754 noise, so assert it is many orders of
// magnitude below the 0.02 tolerance rather than bit-equal to zero. The
// regression this guards produced 0.04 — it would fail this by 11 decades.
const NEGLIGIBLE = 1e-9;

describe("deriveUnitPrice", () => {
	it("uses a plain cent unit price when the net divides evenly", () => {
		expect(deriveUnitPrice(56, 14)).toEqual({ priceAmount: 4 });
		expect(deriveUnitPrice(100, 1)).toEqual({ priceAmount: 100 });
		expect(deriveUnitPrice(30, 4)).toEqual({ priceAmount: 7.5 });
	});

	it("prices via BT-149 when the net does not divide into cents", () => {
		// The MALINAMORE-0075-CN-01 regression: 940.00 over 14 units. Rounding
		// 67.142857… to 67.14 gives 939.96 — off by 0.04, double the tolerance,
		// and Scrada rejected the credit note as a fatal validation error.
		expect(deriveUnitPrice(940, 14)).toEqual({
			priceAmount: 940,
			baseQuantity: 14,
		});
	});

	it("keeps the R120 residual negligible across awkward divisions", () => {
		for (let quantity = 1; quantity <= 60; quantity++) {
			for (const cents of [1, 7, 99, 5600, 94000, 99600, 123457]) {
				const netTotal = roundCurrency(cents / 100);
				const price = deriveUnitPrice(netTotal, quantity);
				expect(
					r120Residual({ quantity, lineExtensionAmount: netTotal, ...price }),
					`net ${netTotal} over ${quantity} units`,
				).toBeLessThan(NEGLIGIBLE);
			}
		}
	});

	it("stays exact at large quantities, where a fixed-precision price would drift", () => {
		// A rounded unit price accumulates error with quantity; a base quantity
		// does not. 1000000 units is far past where any 2-decimal price survives.
		const price = deriveUnitPrice(940, 1_000_000);
		expect(
			r120Residual({ quantity: 1_000_000, lineExtensionAmount: 940, ...price }),
		).toBeLessThan(NEGLIGIBLE);
	});

	it("floors the base quantity at 1 so BT-149 stays positive (R121)", () => {
		// A zero quantity still has to price something, and BT-149 must be > 0.
		expect(deriveUnitPrice(940, 0)).toEqual({ priceAmount: 940 });
		expect(deriveUnitPrice(0, 0)).toEqual({ priceAmount: 0 });
	});
});

const line = (overrides: Partial<UblLine> = {}): UblLine => ({
	id: "1",
	name: "Item",
	quantity: 1,
	unitCode: "C62",
	lineExtensionAmount: 100,
	priceAmount: 100,
	taxCategory: { id: "S", percent: 21 },
	...overrides,
});

describe("reconcileLinesToExclTotal", () => {
	it("re-derives the price after nudging the net, keeping R120 satisfied", () => {
		// Adjusting the net without re-deriving the price is itself an R120
		// violation — the old code re-divided at cent precision and reintroduced it.
		const [adjusted] = reconcileLinesToExclTotal(
			[line({ quantity: 14, lineExtensionAmount: 939.96, priceAmount: 67.14 })],
			940,
		);

		expect(adjusted?.lineExtensionAmount).toBe(940);
		expect(r120Residual(adjusted as UblLine)).toBeLessThan(NEGLIGIBLE);
	});

	it("clears a stale base quantity when the adjusted net divides evenly", () => {
		const [adjusted] = reconcileLinesToExclTotal(
			[
				line({
					quantity: 14,
					lineExtensionAmount: 940,
					priceAmount: 940,
					baseQuantity: 14,
				}),
			],
			56,
		);

		expect(adjusted?.lineExtensionAmount).toBe(56);
		expect(adjusted?.priceAmount).toBe(4);
		expect(adjusted?.baseQuantity).toBeUndefined();
	});
});

const party = (overrides: Partial<UblParty> = {}): UblParty => ({
	endpoint: { scheme: "0208", value: "0800279001" },
	name: "Acme BE",
	address: {
		street: "Rue de la Loi 16",
		additionalStreet: null,
		city: "Brussels",
		postalZone: "1000",
		countrySubentity: null,
		countryCode: "BE",
	},
	vatNumber: "BE0800279001",
	legalName: "Acme BE",
	companyId: { value: "0800279001", scheme: "0208" },
	...overrides,
});

describe("serializeUblDocument — cac:Price", () => {
	const docWithLine = (priced: UblLine): UblDocument => ({
		documentType: "creditNote",
		id: "CN-001",
		issueDate: "2026-07-30",
		dueDate: null,
		note: null,
		currency: "EUR",
		buyerReference: "CN-001",
		precedingInvoiceId: null,
		supplier: party(),
		customer: party({ name: "Customer", endpoint: null, companyId: null }),
		lines: [priced],
		taxTotal: { taxAmount: 0, subtotals: [] },
		monetaryTotal: {
			lineExtensionAmount: priced.lineExtensionAmount,
			taxExclusiveAmount: priced.lineExtensionAmount,
			taxInclusiveAmount: priced.lineExtensionAmount,
			payableAmount: priced.lineExtensionAmount,
		},
		attachments: [],
	});

	const baseLine: UblLine = {
		id: "1",
		name: "Ceramics Team Building",
		quantity: 14,
		unitCode: "C62",
		lineExtensionAmount: 940,
		priceAmount: 940,
		taxCategory: { id: "S", percent: 0 },
	};

	it("emits cbc:BaseQuantity with the quantity's unit code (R130)", () => {
		const xml = serializeUblDocument(
			docWithLine({ ...baseLine, baseQuantity: 14 }),
		);

		expect(xml).toContain('<cbc:BaseQuantity unitCode="C62">14</cbc:BaseQuantity>');
		// BT-149 follows BT-146 inside cac:Price — UBL element order is fixed.
		expect(xml.indexOf("<cbc:PriceAmount")).toBeLessThan(
			xml.indexOf("<cbc:BaseQuantity"),
		);
	});

	it("omits cbc:BaseQuantity when the price needs no base quantity", () => {
		const xml = serializeUblDocument(
			docWithLine({ ...baseLine, lineExtensionAmount: 56, priceAmount: 4 }),
		);

		expect(xml).not.toContain("cbc:BaseQuantity");
	});
});
