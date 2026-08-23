import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUblInvoice, type UblParty, type UblTaxCategory } from "../src/index.js";
import {
	buildCustomerParty,
	buildPdfAttachment,
	buildSupplierParty,
	buildTaxTotals,
	deriveUnitPrice,
	normalizeAddress,
	serializeUblInvoice,
	UBL_CUSTOMIZATION_ID,
	UBL_PROFILE_ID,
	type UblInvoice,
	type UblLine,
} from "../src/build/index.js";

const readFixture = (name: string): string =>
	readFileSync(join(__dirname, "fixtures", name), "utf-8");

const withVatScheme = (category: UblTaxCategory | undefined) =>
	category ? { schemeId: "VAT", ...category } : undefined;

const partyWithVatScheme = (party: UblParty): UblParty =>
	party.vatId !== undefined ? { taxSchemeId: "VAT", ...party } : party;

/**
 * What the parser adds on top of what the serializer was given: the header
 * defaults the serializer fills in (customization, profile, type code, the
 * `VAT` tax scheme on parties and categories), the per-line VAT amount it
 * derives from the rate, `itemName` (BT-153 is written from `description`
 * when the line has no name) and the always-present document
 * `allowanceCharges` array.
 */
const expectedAfterRoundTrip = (built: UblInvoice): UblInvoice => ({
	customizationId: UBL_CUSTOMIZATION_ID,
	profileId: UBL_PROFILE_ID,
	invoiceTypeCode: built.documentType === "CreditNote" ? "381" : "380",
	...built,
	seller: partyWithVatScheme(built.seller),
	buyer: partyWithVatScheme(built.buyer),
	lines: built.lines.map((line) => ({
		itemName: line.description,
		taxAmount: Number(
			(
				((line.lineExtensionAmount ?? 0) * (line.taxCategory?.percent ?? 0)) /
				100
			).toFixed(2),
		),
		...line,
		taxCategory: withVatScheme(line.taxCategory),
	})),
	taxTotal: {
		...built.taxTotal,
		subtotals: built.taxTotal.subtotals.map((subtotal) => ({
			...subtotal,
			category: withVatScheme(subtotal.category),
		})),
	},
	allowanceCharges: [],
});

const pricedLine = (
	id: string,
	description: string,
	quantity: number,
	net: number,
	taxCategory: UblLine["taxCategory"],
): UblLine => ({
	id,
	description,
	quantity,
	unitCode: "C62",
	lineExtensionAmount: net,
	...deriveUnitPrice(net, quantity),
	taxCategory,
});

describe("build → serialize → parse", () => {
	const lines: UblLine[] = [
		pricedLine("1", "Consulting", 2, 100, { id: "S", percent: 21 }),
		// 940 over 14 units does not divide into cents: priced via BT-149.
		pricedLine("2", "Ceramics workshop", 14, 940, { id: "S", percent: 21 }),
		pricedLine("3", "Export goods", 1, 50, {
			id: "G",
			percent: 0,
			exemptionReason: "Export outside the EU",
		}),
	];
	const { taxTotal, monetaryTotal } = buildTaxTotals(lines, { prepaidAmount: 100 });

	const built: UblInvoice = {
		documentType: "Invoice",
		id: "INV-2026-001",
		issueDate: "2026-04-30",
		dueDate: "2026-05-30",
		currency: "EUR",
		note: "Thanks for your business",
		buyerReference: "PO-42",
		invoicePeriod: { startDate: "2026-04-01", endDate: "2026-04-30" },
		paymentTermsNote: "Payable within 30 days",
		seller: buildSupplierParty({
			name: "Acme BV",
			countryCode: "BE",
			address: {
				line1: "Rue de la Loi 16",
				city: "Brussels",
				postal_code: "1000",
			},
			companyNumber: "0800.279.001",
			vatNumber: "BE0800279001",
			vatStatus: "subject",
			peppolID: "0208:0800279001",
		}),
		buyer: buildCustomerParty({
			name: "Globex SA",
			address: normalizeAddress(
				{ line1: "Avenue Louise 50", city: "Brussels", postal_code: "1050" },
				"BE",
			),
			countryCode: "BE",
			vatNumber: "BE0123456789",
			taxNumber: "0123456789",
		}),
		lines,
		taxTotal,
		monetaryTotal,
		attachments: [
			buildPdfAttachment({
				filename: "INV-2026-001.pdf",
				bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			}),
		],
	};

	it("parses back to the model it was built from", () => {
		const xml = serializeUblInvoice(built);
		const parsed = parseUblInvoice(xml);
		expect(parsed).toEqual(expectedAfterRoundTrip(built));
	});

	it("round-trips a credit note with its billing reference", () => {
		const { dueDate: _dueDate, ...invoice } = built;
		const creditNote: UblInvoice = {
			...invoice,
			documentType: "CreditNote",
			id: "CN-2026-001",
			billingReference: { invoiceId: "INV-2026-001" },
		};
		const parsed = parseUblInvoice(serializeUblInvoice(creditNote));
		expect(parsed).toEqual(expectedAfterRoundTrip(creditNote));
	});
});

const omitPath = (value: unknown, path: string[]): void => {
	const [head, ...rest] = path;
	if (head === undefined || typeof value !== "object" || value === null) return;
	if (head === "*") {
		for (const entry of value as unknown[]) omitPath(entry, rest);
		return;
	}
	const record = value as Record<string, unknown>;
	if (rest.length === 0) delete record[head];
	else omitPath(record[head], rest);
};

describe("fixture → parse → serialize → parse", () => {
	/**
	 * Fixtures the serializer refuses outright: they lack something EN 16931
	 * makes mandatory on the wire and exist to exercise the parser alone.
	 */
	const unserializable: Record<string, string> = {
		"ubl-invoice-base-quantity.xml": "no cac:ClassifiedTaxCategory on the line",
		"ubl-invoice-price-discount.xml": "no cac:ClassifiedTaxCategory on the line",
		"ubl-invoice-with-attachment.xml": "no cac:ClassifiedTaxCategory on the line",
		"ubl-invoice-extended.xml": "no cac:PartyName on the seller",
	};

	/**
	 * Model paths the serializer does not write (it emits no PaymentMeans,
	 * Delivery, Contact, PartyIdentification, OrderReference, TaxPointDate,
	 * allowances/charges, line TaxTotal, item identifiers/properties, document
	 * descriptions or BT-26). After removing them from the first parse the
	 * second parse must be identical. `*` matches every array element.
	 */
	const dropped: Record<string, string[]> = {
		"ubl-credit-note.xml": [
			// UBL's CreditNote sequence has no cbc:DueDate; the fixture is lax.
			"dueDate",
			"billingReference.invoiceIssueDate",
			"lines.*.sellersItemId",
		],
		"ubl-invoice.xml": [
			"orderReference",
			"lines.*.sellersItemId",
			"paymentMeans",
			"paymentMeansList",
		],
		"ubl-invoice-allowance-charge.xml": [
			"lines.*.taxSubtotals",
			"lines.*.allowanceCharges",
			"lines.*.discountAmount",
			"monetaryTotal.allowanceTotalAmount",
		],
		"ubl-invoice-efff.xml": [
			"taxPointDate",
			"seller.partyIdentifications",
			"buyer.partyIdentifications",
			"buyer.contact",
			"lines.*.taxSubtotals",
			"paymentMeans",
			"paymentMeansList",
		],
		"ubl-invoice-proximus.xml": [
			"seller.companyLegalForm",
			"seller.partyIdentifications",
			"seller.contact",
			"buyer.partyIdentifications",
			"buyer.contact",
			"lines.*.sellersItemId",
			"lines.*.additionalItemProperties",
			"paymentMeans",
			"paymentMeansList",
			"attachments.*.description",
			"documentReferences",
		],
	};

	/** The first parse, minus the dropped paths, plus the serializer defaults. */
	const expected = (first: UblInvoice, paths: string[]): UblInvoice => {
		const copy = structuredClone(first);
		for (const path of paths) omitPath(copy, path.split("."));
		const partyDefaults = (party: UblParty): UblParty =>
			partyWithVatScheme({ registrationName: party.name, ...party });
		// The parser only derives a line VAT amount; the fixtures already state
		// one where it matters, so the lines stay as parsed (plus the scheme).
		for (const line of copy.lines)
			line.taxCategory = withVatScheme(line.taxCategory);
		return {
			...expectedAfterRoundTrip(copy),
			seller: partyDefaults(copy.seller),
			buyer: partyDefaults(copy.buyer),
			lines: copy.lines,
		};
	};

	const fixtures = readdirSync(join(__dirname, "fixtures")).filter((name) =>
		name.startsWith("ubl-"),
	);

	for (const fixture of fixtures) {
		const reason = unserializable[fixture];
		it.skipIf(reason !== undefined)(
			`${fixture} re-serializes to the same model${reason ? ` (skipped: ${reason})` : ""}`,
			() => {
				const first = parseUblInvoice(readFixture(fixture));
				expect(first).not.toBeNull();
				const second = parseUblInvoice(serializeUblInvoice(first!));
				expect(second).toEqual(expected(first!, dropped[fixture] ?? []));
			},
		);
	}
});
