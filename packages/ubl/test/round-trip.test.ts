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
const sumOf = (line: UblLine, charges: boolean) =>
	(line.allowanceCharges ?? [])
		.filter((item) => item.chargeIndicator === charges)
		.reduce((sum, item) => sum + (item.amount ?? 0), 0);

const expectedAfterRoundTrip = (built: UblInvoice): UblInvoice => {
	return {
		customizationId: UBL_CUSTOMIZATION_ID,
		profileId: UBL_PROFILE_ID,
		invoiceTypeCode: built.documentType === "CreditNote" ? "381" : "380",
		...built,
		seller: partyWithVatScheme(built.seller),
		buyer: partyWithVatScheme(built.buyer),
		...(built.taxRepresentative
			? { taxRepresentative: partyWithVatScheme(built.taxRepresentative) }
			: {}),
		...(built.paymentMeansList?.[0]
			? { paymentMeans: built.paymentMeansList[0] }
			: {}),
		lines: built.lines.map((line) => {
			const discount = sumOf(line, false) + (line.priceAllowance?.amount ?? 0);
			const charge = sumOf(line, true);
			return {
				itemName: line.description,
				taxAmount: Number(
					(
						((line.lineExtensionAmount ?? 0) *
							(line.taxCategory?.percent ?? 0)) /
						100
					).toFixed(2),
				),
				...(discount > 0 ? { discountAmount: discount } : {}),
				...(charge > 0 ? { chargeAmount: charge } : {}),
				...line,
				taxCategory: withVatScheme(line.taxCategory),
			};
		}),
		taxTotal: {
			...built.taxTotal,
			subtotals: built.taxTotal.subtotals.map((subtotal) => ({
				...subtotal,
				category: withVatScheme(subtotal.category),
			})),
		},
		allowanceCharges: (built.allowanceCharges ?? []).map((item) =>
			Object.assign({}, item, { taxCategory: withVatScheme(item.taxCategory) }),
		),
	};
};

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

describe("every business term the model holds survives a round trip", () => {
	const lines: UblLine[] = [
		{
			id: "1",
			note: "Batch 7",
			objectIdentifier: { value: "SUB-1", scheme: "ABZ" },
			orderLineReference: "3",
			accountingCost: "CC-12",
			description: "Widget",
			itemName: "Widget XL",
			quantity: 2,
			unitCode: "C62",
			unitPrice: 50,
			lineExtensionAmount: 90,
			allowanceCharges: [
				{
					chargeIndicator: false,
					amount: 10,
					reason: "Damaged box",
					reasonCode: "95",
				},
			],
			priceAllowance: { amount: 5, baseAmount: 55 },
			taxCategory: { id: "S", percent: 21 },
			sellersItemId: "S-1",
			buyersItemId: "B-1",
			standardItemId: { value: "5790000435951", scheme: "0160" },
			commodityClassifications: [
				{ value: "09348023", listId: "SRV", listVersionId: "1" },
			],
			originCountryCode: "DE",
			additionalItemProperties: [{ name: "Colour", value: "Red" }],
			invoicePeriod: { startDate: "2026-04-01", endDate: "2026-04-30" },
		},
		{
			id: "2",
			description: "Freight",
			quantity: 1,
			unitCode: "C62",
			unitPrice: 20,
			lineExtensionAmount: 25,
			allowanceCharges: [
				{ chargeIndicator: true, amount: 5, reason: "Fuel surcharge" },
			],
			taxCategory: { id: "S", percent: 6 },
		},
	];
	const allowanceCharges = [
		{
			chargeIndicator: false,
			amount: 9,
			baseAmount: 90,
			multiplierFactorNumeric: 10,
			reason: "Volume discount",
			reasonCode: "95",
			taxCategory: { id: "S", percent: 21 },
		},
		{
			chargeIndicator: true,
			amount: 12.5,
			reason: "Shipping",
			reasonCode: "FC",
			taxCategory: { id: "S", percent: 6 },
		},
	];
	const { taxTotal, monetaryTotal } = buildTaxTotals(lines, {
		allowanceCharges,
		prepaidAmount: 50,
		payableRoundingAmount: 0.02,
	});
	const address = {
		street: "Rue de la Loi 16",
		city: "Brussels",
		postalZone: "1000",
		countryCode: "BE",
	};

	const built: UblInvoice = {
		documentType: "Invoice",
		id: "INV-2026-002",
		issueDate: "2026-04-30",
		dueDate: "2026-05-30",
		taxPointDate: "2026-04-28",
		currency: "EUR",
		taxCurrency: "SEK",
		accountingCost: "4711",
		note: "Every field",
		buyerReference: "Dept 7",
		orderReference: "PO-4711",
		salesOrderId: "SO-12",
		contractReference: "CTR-1",
		projectReference: "PRJ-1",
		receivingAdviceReference: "RCPT-1",
		despatchReference: "DESP-1",
		tenderReference: "TND-1",
		invoicedObjectId: { value: "OBJ-1", scheme: "ABZ" },
		invoicePeriod: { startDate: "2026-04-01", endDate: "2026-04-30" },
		paymentTermsNote: "Payable within 30 days",
		seller: {
			name: "Acme BV",
			registrationName: "Acme BV",
			companyLegalForm: "BV",
			endpoint: { scheme: "0208", value: "0800279001" },
			partyIdentifications: [{ id: "0800279001", schemeId: "0208" }],
			companyId: { value: "0800279001", scheme: "0208" },
			vatId: "BE0800279001",
			address,
			contact: { name: "Ann", phone: "+32 2 000 00 00", email: "ann@acme.be" },
		},
		buyer: {
			name: "Globex SA",
			registrationName: "Globex SA",
			endpoint: { scheme: "0208", value: "0123456789" },
			vatId: "BE0123456789",
			address: { ...address, street: "Avenue Louise 50", postalZone: "1050" },
			contact: { name: "Bob", email: "bob@globex.be" },
		},
		payee: {
			name: "Factor NV",
			partyIdentifications: [{ id: "0999999999", schemeId: "0208" }],
			companyId: { value: "0999999999", scheme: "0208" },
		},
		taxRepresentative: {
			name: "Fiscal Rep SA",
			vatId: "FR12345678901",
			address: { city: "Lille", postalZone: "59000", countryCode: "FR" },
		},
		delivery: {
			actualDeliveryDate: "2026-04-20",
			locationId: { value: "5790000435951", scheme: "0088" },
			address: {
				street: "Kaai 1",
				city: "Antwerp",
				postalZone: "2000",
				countryCode: "BE",
			},
			partyName: "Globex warehouse",
		},
		paymentMeansList: [
			{
				code: "58",
				codeName: "SEPA credit transfer",
				paymentId: "+++090/9337/55023+++",
				iban: "BE71096123456769",
				accountName: "Acme BV",
				bic: "GKCCBEBB",
			},
			{ code: "59", mandateId: "MANDATE-1", debitedAccount: "BE71096123456769" },
			{ code: "48", cardNumber: "1234", cardHolder: "J. Doe" },
		],
		allowanceCharges,
		lines,
		taxTotal: { ...taxTotal, taxAmountInTaxCurrency: 231.5 },
		monetaryTotal,
		attachments: [
			{
				...buildPdfAttachment({
					filename: "INV-2026-002.pdf",
					bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
				}),
				description: "Invoice PDF",
			},
		],
		documentReferences: [{ id: "TERMS", description: "General terms" }],
	};

	it("as an invoice", () => {
		const parsed = parseUblInvoice(serializeUblInvoice(built));
		expect(parsed).toEqual(expectedAfterRoundTrip(built));
	});

	it("as a credit note (BT-9 via the payment means, BT-11 via document type 50)", () => {
		const { tenderReference: _tender, ...rest } = built;
		const creditNote: UblInvoice = {
			...rest,
			documentType: "CreditNote",
			id: "CN-2026-002",
			billingReference: {
				invoiceId: "INV-2026-002",
				invoiceIssueDate: "2026-04-30",
			},
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
		"ubl-invoice-allowance-charge.xml":
			"a line allowance rolled into BT-107 (fails BR-CO-11 and BR-CO-13)",
	};

	/**
	 * Model paths the serializer does not write: line-level tax totals, which
	 * BIS Billing 3.0 forbids, and cbc:DueDate on a credit note without a
	 * payment means to carry it. After removing them from the first parse the
	 * second parse must be identical. `*` matches every array element.
	 */
	const dropped: Record<string, string[]> = {
		"ubl-credit-note.xml": ["dueDate"],
		"ubl-credit-note-sbdh.xml": ["dueDate"],
		"ubl-invoice-efff.xml": ["lines.*.taxSubtotals"],
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
