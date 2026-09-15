import { UblBuildError } from "../../errors";
import type {
	UblAddress,
	UblAllowanceCharge,
	UblAttachment,
	UblBillingReference,
	UblDelivery,
	UblInvoice,
	UblInvoicePeriod,
	UblLine,
	UblParty,
	UblPaymentMeans,
	UblSchemedId,
	UblTaxCategory,
	UblTaxSubtotal,
} from "../../types";
import { el, serializeDocument, type XmlElement } from "../xml";
import {
	COUNTRY_CODE_LIST_ID,
	CREDIT_NOTE_TYPE_CODE,
	INVOICE_TYPE_CODE,
	NS_CAC,
	NS_CBC,
	NS_CREDIT_NOTE,
	NS_INVOICE,
	UBL_CUSTOMIZATION_ID,
	UBL_PROFILE_ID,
	VAT_TAX_SCHEME_ID,
} from "./constants";

// ── Validation ─────────────────────────────────────────────────────────
//
// The model is permissive (the parser reads whatever a document states); the
// serializer is where EN 16931 / Peppol BIS Billing 3.0 mandatory fields and
// the arithmetic business rules are enforced. Each check names the BT or the
// rule and the model path in its message.

const missing = (what: string, path: string): UblBuildError =>
	new UblBuildError(`Missing ${what} (${path})`);

function required<T>(value: T | undefined, what: string, path: string): NonNullable<T> {
	if (value === undefined || value === null || value === "") {
		throw missing(what, path);
	}
	return value as NonNullable<T>;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Sums of cent-rounded amounts must agree to the cent; R120 allows a cent either way. */
const assertEqual = (
	rule: string,
	actual: number,
	expected: number,
	path: string,
	tolerance = 0.005,
): void => {
	if (Math.abs(actual - expected) > tolerance) {
		throw new UblBuildError(
			`${rule}: ${path} is ${actual.toFixed(2)}, expected ${expected.toFixed(2)}`,
		);
	}
};

/** Category `O` (outside scope) is the one category BR-O-05 forbids a percent on. */
const requiresPercent = (categoryId: string): boolean => categoryId !== "O";

const validateTaxCategory = (
	category: UblTaxCategory | undefined,
	path: string,
): UblTaxCategory & { id: string } => {
	const present = required(category, "VAT category (BT-151/BT-118)", path);
	const id = required(present.id, "VAT category code (BT-151/BT-118)", `${path}.id`);
	if (requiresPercent(id) && present.percent === undefined) {
		throw missing(`VAT rate (BT-152/BT-119) for category ${id}`, `${path}.percent`);
	}
	return { ...present, id };
};

const validateAllowanceCharge = (
	item: UblAllowanceCharge,
	path: string,
	level: "document" | "line",
): void => {
	const kind = item.chargeIndicator ? "charge" : "allowance";
	required(item.amount, `${kind} amount (BT-92/BT-99)`, `${path}.amount`);
	if (item.reason === undefined && item.reasonCode === undefined) {
		throw missing(`${kind} reason or reason code (BT-97/BT-98)`, `${path}.reason`);
	}
	if (item.baseAmount !== undefined && item.multiplierFactorNumeric !== undefined) {
		assertEqual(
			"PEPPOL-EN16931-R040",
			item.amount ?? 0,
			round2((item.baseAmount * item.multiplierFactorNumeric) / 100),
			`${path}.amount`,
			0.01,
		);
	}
	if (level === "document") {
		validateTaxCategory(item.taxCategory, `${path}.taxCategory`);
	}
};

const lineAllowanceTotal = (line: UblLine, charges: boolean): number =>
	(line.allowanceCharges ?? [])
		.filter((item) => item.chargeIndicator === charges)
		.reduce((sum, item) => sum + (item.amount ?? 0), 0);

const validateLine = (line: UblLine, index: number): void => {
	const path = `lines[${index}]`;
	required(line.id, "line identifier (BT-126)", `${path}.id`);
	const quantity = required(
		line.quantity,
		"invoiced quantity (BT-129)",
		`${path}.quantity`,
	);
	required(line.unitCode, "unit code (BT-130)", `${path}.unitCode`);
	const unitPrice = required(
		line.unitPrice,
		"net unit price (BT-146)",
		`${path}.unitPrice`,
	);
	const net = required(
		line.lineExtensionAmount,
		"line net amount (BT-131)",
		`${path}.lineExtensionAmount`,
	);
	// A negative line carries its sign on the quantity, never on the price.
	if (unitPrice < 0) {
		throw new UblBuildError(
			`BR-27: ${path}.unitPrice is ${unitPrice}, the item net price shall not be negative`,
		);
	}
	validateTaxCategory(line.taxCategory, `${path}.taxCategory`);
	(line.allowanceCharges ?? []).forEach((item, itemIndex) =>
		validateAllowanceCharge(item, `${path}.allowanceCharges[${itemIndex}]`, "line"),
	);
	// BT-131 = BT-129 × BT-146 + line charges − line allowances. `unitPrice` is
	// the per-unit figure, so BT-149 is already accounted for.
	assertEqual(
		"PEPPOL-EN16931-R120",
		net,
		round2(
			quantity * unitPrice +
				lineAllowanceTotal(line, true) -
				lineAllowanceTotal(line, false),
		),
		`${path}.lineExtensionAmount`,
		0.02,
	);
};

const isExternalOnly = (attachment: UblAttachment): boolean =>
	attachment.externalUri !== undefined && attachment.base64Content === undefined;

const validateAttachment = (attachment: UblAttachment, index: number): void => {
	if (isExternalOnly(attachment)) return;
	const path = `attachments[${index}]`;
	required(attachment.filename, "attachment filename (BT-125-2)", `${path}.filename`);
	required(
		attachment.mimeCode,
		"attachment MIME code (BT-125-1)",
		`${path}.mimeCode`,
	);
	required(
		attachment.base64Content,
		"attachment content (BT-125)",
		`${path}.base64Content`,
	);
};

/** UNCL4461 codes whose payment means need a mandate (direct debit) or an account (credit transfer). */
const DIRECT_DEBIT_CODES = new Set(["49", "59"]);
const CREDIT_TRANSFER_CODES = new Set(["30", "58"]);

const validatePaymentMeans = (means: UblPaymentMeans, index: number): void => {
	const path = `paymentMeansList[${index}]`;
	const code = required(means.code, "payment means code (BT-81)", `${path}.code`);
	if (CREDIT_TRANSFER_CODES.has(code)) {
		required(
			means.iban,
			`payment account (BT-84) for code ${code}`,
			`${path}.iban`,
		);
	}
	if (DIRECT_DEBIT_CODES.has(code)) {
		required(
			means.mandateId,
			`mandate reference (BT-89) for code ${code}`,
			`${path}.mandateId`,
		);
	}
};

const validateParty = (party: UblParty, role: string, nameBt: string): void => {
	required(party.name, `${role} name (${nameBt})`, `${role}.name`);
	if (party.endpoint && party.endpoint.scheme === undefined) {
		throw missing(`${role} endpoint scheme`, `${role}.endpoint.scheme`);
	}
};

const paymentMeansList = (doc: UblInvoice): UblPaymentMeans[] =>
	doc.paymentMeansList ?? (doc.paymentMeans ? [doc.paymentMeans] : []);

const sumBy = <T>(items: T[], pick: (item: T) => number): number =>
	round2(items.reduce((sum, item) => sum + pick(item), 0));

const categoryKey = (category: UblTaxCategory | undefined): string =>
	`${category?.id ?? ""}:${category?.percent ?? ""}`;

/**
 * The document arithmetic EN 16931 fixes: BR-CO-10 (line sum), BR-CO-11/12
 * (allowance and charge sums), BR-CO-13 (total without VAT), BR-CO-15 (total
 * with VAT), BR-CO-16 (amount due) and the BR-S-08 family (each VAT category's
 * taxable amount is its line nets minus its allowances plus its charges).
 */
const validateArithmetic = (doc: UblInvoice): void => {
	const total = doc.monetaryTotal;
	const docItems = doc.allowanceCharges ?? [];
	const allowances = docItems.filter((item) => !item.chargeIndicator);
	const charges = docItems.filter((item) => item.chargeIndicator);
	const lineSum = sumBy(doc.lines, (line) => line.lineExtensionAmount ?? 0);
	const allowanceSum = sumBy(allowances, (item) => item.amount ?? 0);
	const chargeSum = sumBy(charges, (item) => item.amount ?? 0);

	assertEqual(
		"BR-CO-10",
		total.lineExtensionAmount ?? 0,
		lineSum,
		"monetaryTotal.lineExtensionAmount",
	);
	if (allowances.length > 0 || total.allowanceTotalAmount !== undefined) {
		assertEqual(
			"BR-CO-11",
			total.allowanceTotalAmount ?? 0,
			allowanceSum,
			"monetaryTotal.allowanceTotalAmount",
		);
	}
	if (charges.length > 0 || total.chargeTotalAmount !== undefined) {
		assertEqual(
			"BR-CO-12",
			total.chargeTotalAmount ?? 0,
			chargeSum,
			"monetaryTotal.chargeTotalAmount",
		);
	}
	assertEqual(
		"BR-CO-13",
		total.taxExclusiveAmount ?? 0,
		round2(lineSum - allowanceSum + chargeSum),
		"monetaryTotal.taxExclusiveAmount",
	);
	assertEqual(
		"BR-CO-15",
		total.taxInclusiveAmount ?? 0,
		round2((total.taxExclusiveAmount ?? 0) + (doc.taxTotal.taxAmount ?? 0)),
		"monetaryTotal.taxInclusiveAmount",
	);
	assertEqual(
		"BR-CO-16",
		total.payableAmount ?? 0,
		round2(
			(total.taxInclusiveAmount ?? 0) -
				(total.prepaidAmount ?? 0) +
				(total.payableRoundingAmount ?? 0),
		),
		"monetaryTotal.payableAmount",
	);

	const taxableByCategory = new Map<string, number>();
	const add = (category: UblTaxCategory | undefined, amount: number): void => {
		const key = categoryKey(category);
		taxableByCategory.set(key, round2((taxableByCategory.get(key) ?? 0) + amount));
	};
	for (const line of doc.lines) add(line.taxCategory, line.lineExtensionAmount ?? 0);
	for (const item of docItems) {
		add(
			item.taxCategory,
			item.chargeIndicator ? (item.amount ?? 0) : -(item.amount ?? 0),
		);
	}
	doc.taxTotal.subtotals.forEach((subtotal, index) => {
		const key = categoryKey(subtotal.category);
		const expected = taxableByCategory.get(key);
		if (expected === undefined) {
			throw new UblBuildError(
				`BR-S-08: taxTotal.subtotals[${index}] (${key}) has no line, allowance or charge in that category`,
			);
		}
		assertEqual(
			"BR-S-08",
			subtotal.taxableAmount ?? 0,
			expected,
			`taxTotal.subtotals[${index}].taxableAmount`,
		);
	});
};

const validateInvoice = (doc: UblInvoice): void => {
	required(doc.id, "document identifier (BT-1)", "id");
	required(doc.issueDate, "issue date (BT-2)", "issueDate");
	required(doc.currency, "document currency (BT-5)", "currency");
	if (
		doc.taxPointDate !== undefined &&
		doc.invoicePeriod?.descriptionCode !== undefined
	) {
		throw new UblBuildError(
			"BR-CO-3: a tax point date (BT-7, taxPointDate) and a tax point date code (BT-8, invoicePeriod.descriptionCode) are mutually exclusive",
		);
	}
	if (doc.taxCurrency !== undefined) {
		required(
			doc.taxTotal.taxAmountInTaxCurrency,
			"VAT total in the accounting currency (BT-111, BR-53)",
			"taxTotal.taxAmountInTaxCurrency",
		);
	}
	validateParty(doc.seller, "seller", "BT-27");
	validateParty(doc.buyer, "buyer", "BT-44");
	if (doc.payee) required(doc.payee.name, "payee name (BT-59)", "payee.name");
	if (doc.taxRepresentative) {
		required(
			doc.taxRepresentative.name,
			"tax representative name (BT-62)",
			"taxRepresentative.name",
		);
		required(
			doc.taxRepresentative.vatId,
			"tax representative VAT identifier (BT-63)",
			"taxRepresentative.vatId",
		);
		required(
			doc.taxRepresentative.address?.countryCode,
			"tax representative country (BT-69)",
			"taxRepresentative.address.countryCode",
		);
	}
	if (doc.lines.length === 0) {
		throw new UblBuildError("A document needs at least one line (BG-25, lines)");
	}
	doc.lines.forEach(validateLine);
	(doc.allowanceCharges ?? []).forEach((item, index) =>
		validateAllowanceCharge(item, `allowanceCharges[${index}]`, "document"),
	);
	paymentMeansList(doc).forEach(validatePaymentMeans);
	required(doc.taxTotal.taxAmount, "total VAT amount (BT-110)", "taxTotal.taxAmount");
	const total = doc.monetaryTotal;
	required(
		total.lineExtensionAmount,
		"sum of line net amounts (BT-106)",
		"monetaryTotal.lineExtensionAmount",
	);
	required(
		total.taxExclusiveAmount,
		"total without VAT (BT-109)",
		"monetaryTotal.taxExclusiveAmount",
	);
	required(
		total.taxInclusiveAmount,
		"total with VAT (BT-112)",
		"monetaryTotal.taxInclusiveAmount",
	);
	required(total.payableAmount, "amount due (BT-115)", "monetaryTotal.payableAmount");
	(doc.attachments ?? []).forEach(validateAttachment);
	validateArithmetic(doc);
};

// ── Formatting ─────────────────────────────────────────────────────────

/** Format a monetary value as a 2-decimal string (UBL amounts are fixed-scale). */
const amount = (value: number): string => value.toFixed(2);

/** Format a VAT percentage. Trims to at most 2 decimals without forcing them. */
const percent = (value: number): string => {
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? rounded.toFixed(2) : String(rounded);
};

const money = (name: string, value: number, currency: string): XmlElement =>
	el(name, { currencyID: currency }, amount(value));

const optionalMoney = (
	name: string,
	value: number | undefined,
	currency: string,
): XmlElement | null => (value !== undefined ? money(name, value, currency) : null);

const text = (name: string, value: string | undefined): XmlElement | null =>
	value !== undefined ? el(name, null, value) : null;

const schemedId = (name: string, id: UblSchemedId | undefined): XmlElement | null =>
	id !== undefined
		? el(name, id.scheme !== undefined ? { schemeID: id.scheme } : null, id.value)
		: null;

const taxScheme = (schemeId: string | undefined): XmlElement =>
	el("cac:TaxScheme", null, [el("cbc:ID", null, schemeId ?? VAT_TAX_SCHEME_ID)]);

/**
 * Render a tax category, shared between `cac:ClassifiedTaxCategory` (on lines)
 * and `cac:TaxCategory` (in the VAT breakdown and on document allowances and
 * charges). EN 16931 requires an exemption reason for the non-charging
 * categories (E/AE/O/K/G); the code precedes the text in the sequence.
 */
const taxCategory = (
	name: string,
	category: UblTaxCategory,
	path: string,
): XmlElement => {
	const valid = validateTaxCategory(category, path);
	return el(name, null, [
		el("cbc:ID", null, valid.id),
		valid.percent !== undefined
			? el("cbc:Percent", null, percent(valid.percent))
			: null,
		text("cbc:TaxExemptionReasonCode", valid.exemptionReasonCode),
		text("cbc:TaxExemptionReason", valid.exemptionReason),
		taxScheme(valid.schemeId),
	]);
};

const addressChildren = (address: UblAddress): (XmlElement | null)[] => [
	text("cbc:StreetName", address.street),
	text("cbc:AdditionalStreetName", address.additionalStreet),
	text("cbc:CityName", address.city),
	text("cbc:PostalZone", address.postalZone),
	text("cbc:CountrySubentity", address.countrySubentity),
	address.countryCode !== undefined
		? el("cac:Country", null, [
				el(
					"cbc:IdentificationCode",
					{ listID: COUNTRY_CODE_LIST_ID },
					address.countryCode,
				),
			])
		: null,
];

const postalAddress = (address: UblAddress): XmlElement =>
	el("cac:PostalAddress", null, addressChildren(address));

const partyIdentifications = (source: UblParty): XmlElement[] =>
	(source.partyIdentifications ?? []).map((identification) =>
		el("cac:PartyIdentification", null, [
			el(
				"cbc:ID",
				identification.schemeId !== undefined
					? { schemeID: identification.schemeId }
					: null,
				identification.id,
			),
		]),
	);

const partyName = (name: string): XmlElement =>
	el("cac:PartyName", null, [el("cbc:Name", null, name)]);

const partyTaxScheme = (source: UblParty): XmlElement | null =>
	source.vatId !== undefined
		? el("cac:PartyTaxScheme", null, [
				el("cbc:CompanyID", null, source.vatId),
				taxScheme(source.taxSchemeId),
			])
		: null;

const companyId = (source: UblParty): XmlElement | null =>
	source.companyId
		? el(
				"cbc:CompanyID",
				source.companyId.scheme !== undefined
					? { schemeID: source.companyId.scheme }
					: null,
				source.companyId.value,
			)
		: null;

const contact = (source: UblParty): XmlElement | null =>
	source.contact
		? el("cac:Contact", null, [
				text("cbc:Name", source.contact.name),
				text("cbc:Telephone", source.contact.phone),
				text("cbc:ElectronicMail", source.contact.email),
			])
		: null;

/** `cac:Party` for the seller and buyer (BG-4, BG-7). */
const party = (source: UblParty, name: string): XmlElement =>
	el("cac:Party", null, [
		source.endpoint
			? el(
					"cbc:EndpointID",
					{ schemeID: source.endpoint.scheme ?? "" },
					source.endpoint.value,
				)
			: null,
		...partyIdentifications(source),
		partyName(name),
		source.address ? postalAddress(source.address) : null,
		partyTaxScheme(source),
		el("cac:PartyLegalEntity", null, [
			el("cbc:RegistrationName", null, source.registrationName ?? name),
			companyId(source),
			text("cbc:CompanyLegalForm", source.companyLegalForm),
		]),
		contact(source),
	]);

/** `cac:PayeeParty` (BG-10): identification, name and legal entity id, unwrapped. */
const payeeParty = (source: UblParty): XmlElement =>
	el("cac:PayeeParty", null, [
		...partyIdentifications(source),
		partyName(source.name ?? ""),
		source.companyId ? el("cac:PartyLegalEntity", null, [companyId(source)]) : null,
	]);

/** `cac:TaxRepresentativeParty` (BG-11): name, address and VAT id, unwrapped. */
const taxRepresentativeParty = (source: UblParty): XmlElement =>
	el("cac:TaxRepresentativeParty", null, [
		partyName(source.name ?? ""),
		source.address ? postalAddress(source.address) : null,
		partyTaxScheme(source),
	]);

/** `cac:Delivery` (BG-13). */
const delivery = (source: UblDelivery): XmlElement | null => {
	const location =
		source.locationId !== undefined || source.address !== undefined
			? el("cac:DeliveryLocation", null, [
					schemedId("cbc:ID", source.locationId),
					source.address
						? el("cac:Address", null, addressChildren(source.address))
						: null,
				])
			: null;
	const deliveryParty =
		source.partyName !== undefined
			? el("cac:DeliveryParty", null, [partyName(source.partyName)])
			: null;
	if (source.actualDeliveryDate === undefined && !location && !deliveryParty)
		return null;
	return el("cac:Delivery", null, [
		text("cbc:ActualDeliveryDate", source.actualDeliveryDate),
		location,
		deliveryParty,
	]);
};

/**
 * `cac:PaymentMeans` (BG-16). On a credit note BT-9 has no root element and
 * rides in the first payment means as `cbc:PaymentDueDate`. `cbc:NetworkID`
 * is schema-mandatory inside `cac:CardAccount` and carries no business term;
 * the BIS example value is `NA`.
 */
const paymentMeans = (
	source: UblPaymentMeans,
	dueDate: string | undefined,
): XmlElement =>
	el("cac:PaymentMeans", null, [
		el(
			"cbc:PaymentMeansCode",
			source.codeName !== undefined ? { name: source.codeName } : null,
			source.code ?? "",
		),
		text("cbc:PaymentDueDate", dueDate),
		text("cbc:PaymentID", source.paymentId),
		source.cardNumber !== undefined
			? el("cac:CardAccount", null, [
					el("cbc:PrimaryAccountNumberID", null, source.cardNumber),
					el("cbc:NetworkID", null, "NA"),
					text("cbc:HolderName", source.cardHolder),
				])
			: null,
		source.iban !== undefined
			? el("cac:PayeeFinancialAccount", null, [
					el("cbc:ID", null, source.iban),
					text("cbc:Name", source.accountName),
					source.bic !== undefined
						? el("cac:FinancialInstitutionBranch", null, [
								el("cbc:ID", null, source.bic),
							])
						: null,
				])
			: null,
		source.mandateId !== undefined
			? el("cac:PaymentMandate", null, [
					el("cbc:ID", null, source.mandateId),
					source.debitedAccount !== undefined
						? el("cac:PayerFinancialAccount", null, [
								el("cbc:ID", null, source.debitedAccount),
							])
						: null,
				])
			: null,
	]);

/**
 * `cac:AllowanceCharge` at document level (BG-20/BG-21, with its VAT
 * category) and line level (BG-27/BG-28, without: the line's category
 * applies).
 */
const allowanceCharge = (
	item: UblAllowanceCharge,
	currency: string,
	path: string,
	level: "document" | "line",
): XmlElement =>
	el("cac:AllowanceCharge", null, [
		el("cbc:ChargeIndicator", null, item.chargeIndicator ? "true" : "false"),
		text("cbc:AllowanceChargeReasonCode", item.reasonCode),
		text("cbc:AllowanceChargeReason", item.reason),
		item.multiplierFactorNumeric !== undefined
			? el(
					"cbc:MultiplierFactorNumeric",
					null,
					percent(item.multiplierFactorNumeric),
				)
			: null,
		money("cbc:Amount", item.amount ?? 0, currency),
		optionalMoney("cbc:BaseAmount", item.baseAmount, currency),
		level === "document"
			? taxCategory(
					"cac:TaxCategory",
					item.taxCategory ?? {},
					`${path}.taxCategory`,
				)
			: null,
	]);

const taxSubtotal = (
	subtotal: UblTaxSubtotal,
	currency: string,
	index: number,
): XmlElement => {
	const path = `taxTotal.subtotals[${index}]`;
	return el("cac:TaxSubtotal", null, [
		money(
			"cbc:TaxableAmount",
			required(
				subtotal.taxableAmount,
				"taxable amount (BT-116)",
				`${path}.taxableAmount`,
			),
			currency,
		),
		money(
			"cbc:TaxAmount",
			required(subtotal.taxAmount, "VAT amount (BT-117)", `${path}.taxAmount`),
			currency,
		),
		taxCategory(
			"cac:TaxCategory",
			required(subtotal.category, "VAT category (BT-118)", `${path}.category`),
			`${path}.category`,
		),
	]);
};

/**
 * `cac:LegalMonetaryTotal` children, in UBL sequence order. BT-107/BT-108 are
 * written when the document carries allowances or charges; BT-113 and BT-114
 * are omitted when absent or zero.
 */
const legalMonetaryTotalChildren = (doc: UblInvoice): XmlElement[] => {
	const { currency, monetaryTotal: total } = doc;
	const hasAllowances = (doc.allowanceCharges ?? []).some(
		(item) => !item.chargeIndicator,
	);
	const hasCharges = (doc.allowanceCharges ?? []).some(
		(item) => item.chargeIndicator,
	);
	const children: (XmlElement | null)[] = [
		money("cbc:LineExtensionAmount", total.lineExtensionAmount ?? 0, currency),
		money("cbc:TaxExclusiveAmount", total.taxExclusiveAmount ?? 0, currency),
		money("cbc:TaxInclusiveAmount", total.taxInclusiveAmount ?? 0, currency),
		hasAllowances || total.allowanceTotalAmount
			? money(
					"cbc:AllowanceTotalAmount",
					total.allowanceTotalAmount ?? 0,
					currency,
				)
			: null,
		hasCharges || total.chargeTotalAmount
			? money("cbc:ChargeTotalAmount", total.chargeTotalAmount ?? 0, currency)
			: null,
		total.prepaidAmount
			? money("cbc:PrepaidAmount", total.prepaidAmount, currency)
			: null,
		total.payableRoundingAmount
			? money("cbc:PayableRoundingAmount", total.payableRoundingAmount, currency)
			: null,
		money("cbc:PayableAmount", total.payableAmount ?? 0, currency),
	];
	return children.filter((child): child is XmlElement => Boolean(child));
};

/**
 * `cac:InvoicePeriod`. Null when neither bound is set — an empty period element
 * fails BR-CO-19, which requires at least one of the two dates. BT-8 (the tax
 * point date code) is only meaningful on the document period.
 */
const invoicePeriod = (period: UblInvoicePeriod | undefined): XmlElement | null => {
	if (!period || (period.startDate === undefined && period.endDate === undefined)) {
		return null;
	}
	return el("cac:InvoicePeriod", null, [
		text("cbc:StartDate", period.startDate),
		text("cbc:EndDate", period.endDate),
		text("cbc:DescriptionCode", period.descriptionCode),
	]);
};

const item = (source: UblLine): XmlElement =>
	el("cac:Item", null, [
		text("cbc:Description", source.description),
		// BT-153 is mandatory; BT-154 stands in when the line has no name.
		el("cbc:Name", null, source.itemName ?? source.description ?? source.id),
		source.buyersItemId !== undefined
			? el("cac:BuyersItemIdentification", null, [
					el("cbc:ID", null, source.buyersItemId),
				])
			: null,
		source.sellersItemId !== undefined
			? el("cac:SellersItemIdentification", null, [
					el("cbc:ID", null, source.sellersItemId),
				])
			: null,
		source.standardItemId !== undefined
			? el("cac:StandardItemIdentification", null, [
					schemedId("cbc:ID", source.standardItemId),
				])
			: null,
		source.originCountryCode !== undefined
			? el("cac:OriginCountry", null, [
					el("cbc:IdentificationCode", null, source.originCountryCode),
				])
			: null,
		...(source.commodityClassifications ?? []).map((classification) =>
			el("cac:CommodityClassification", null, [
				el(
					"cbc:ItemClassificationCode",
					{
						listID: classification.listId,
						listVersionID: classification.listVersionId,
					},
					classification.value,
				),
			]),
		),
		taxCategory(
			"cac:ClassifiedTaxCategory",
			source.taxCategory ?? {},
			`lines[${source.id}].taxCategory`,
		),
		...(source.additionalItemProperties ?? []).map((property) =>
			el("cac:AdditionalItemProperty", null, [
				el("cbc:Name", null, property.name),
				el("cbc:Value", null, property.value ?? ""),
			]),
		),
	]);

const line = (
	source: UblLine,
	currency: string,
	documentType: UblInvoice["documentType"],
): XmlElement => {
	const isCreditNote = documentType === "CreditNote";
	const lineElementName = isCreditNote ? "cac:CreditNoteLine" : "cac:InvoiceLine";
	const quantityElementName = isCreditNote
		? "cbc:CreditedQuantity"
		: "cbc:InvoicedQuantity";
	const unitCode = source.unitCode ?? "";
	// BT-146 covers BT-149 units; the model holds the per-unit price.
	const priceAmount = (source.unitPrice ?? 0) * (source.baseQuantity ?? 1);

	return el(lineElementName, null, [
		el("cbc:ID", null, source.id),
		text("cbc:Note", source.note),
		el(quantityElementName, { unitCode }, String(source.quantity ?? 0)),
		money("cbc:LineExtensionAmount", source.lineExtensionAmount ?? 0, currency),
		text("cbc:AccountingCost", source.accountingCost),
		invoicePeriod(source.invoicePeriod),
		source.orderLineReference !== undefined
			? el("cac:OrderLineReference", null, [
					el("cbc:LineID", null, source.orderLineReference),
				])
			: null,
		source.objectIdentifier !== undefined
			? el("cac:DocumentReference", null, [
					schemedId("cbc:ID", source.objectIdentifier),
					el("cbc:DocumentTypeCode", null, "130"),
				])
			: null,
		...(source.allowanceCharges ?? []).map((entry, index) =>
			allowanceCharge(
				entry,
				currency,
				`lines[${source.id}].allowanceCharges[${index}]`,
				"line",
			),
		),
		item(source),
		// BT-149's unit code must match the invoiced/credited quantity's
		// (PEPPOL-EN16931-R130).
		el("cac:Price", null, [
			money("cbc:PriceAmount", priceAmount, currency),
			source.baseQuantity !== undefined
				? el("cbc:BaseQuantity", { unitCode }, String(source.baseQuantity))
				: null,
			source.priceAllowance !== undefined
				? el("cac:AllowanceCharge", null, [
						el("cbc:ChargeIndicator", null, "false"),
						money(
							"cbc:Amount",
							source.priceAllowance.amount ?? 0,
							currency,
						),
						optionalMoney(
							"cbc:BaseAmount",
							source.priceAllowance.baseAmount,
							currency,
						),
					])
				: null,
		]),
	]);
};

const attachmentReference = (attachment: UblAttachment): XmlElement =>
	el("cac:AdditionalDocumentReference", null, [
		el(
			"cbc:ID",
			null,
			attachment.id ?? attachment.filename ?? attachment.externalUri ?? "",
		),
		text("cbc:DocumentDescription", attachment.description),
		el("cac:Attachment", null, [
			isExternalOnly(attachment)
				? el("cac:ExternalReference", null, [
						el("cbc:URI", null, attachment.externalUri ?? ""),
					])
				: el(
						"cbc:EmbeddedDocumentBinaryObject",
						{
							mimeCode: attachment.mimeCode ?? "",
							filename: attachment.filename ?? "",
						},
						attachment.base64Content ?? "",
					),
		]),
	]);

/** A typed `cac:AdditionalDocumentReference` without attachment (BT-17, BT-18, BT-11 on a credit note). */
const typedDocumentReference = (id: UblSchemedId, typeCode: string): XmlElement =>
	el("cac:AdditionalDocumentReference", null, [
		schemedId("cbc:ID", id),
		el("cbc:DocumentTypeCode", null, typeCode),
	]);

const documentReference = (name: string, id: string | undefined): XmlElement | null =>
	id !== undefined ? el(name, null, [el("cbc:ID", null, id)]) : null;

/**
 * `cac:OrderReference`. BT-13 (the buyer's order number) is the element's
 * mandatory child, so a sales order id (BT-14) alone is not emitted.
 */
const orderReference = (doc: UblInvoice): XmlElement | null => {
	if (doc.orderReference === undefined) return null;
	return el("cac:OrderReference", null, [
		el("cbc:ID", null, doc.orderReference),
		text("cbc:SalesOrderID", doc.salesOrderId),
	]);
};

const billingReference = (reference: UblBillingReference): XmlElement | null => {
	if (reference.invoiceId === undefined) return null;
	return el("cac:BillingReference", null, [
		el("cac:InvoiceDocumentReference", null, [
			el("cbc:ID", null, reference.invoiceId),
			text("cbc:IssueDate", reference.invoiceIssueDate),
		]),
	]);
};

/**
 * Serialize a {@link UblInvoice} into a Peppol BIS Billing 3.0 XML string.
 *
 * Writes every EN 16931 business term the model holds, at its position in the
 * UBL 2.1 sequence: the header terms (`customizationId`, `profileId` and
 * `invoiceTypeCode` default to the BIS values), the references (BT-10 to
 * BT-19), the parties with identifications, legal form and contacts, the
 * payee and tax representative, delivery, payment means, payment terms,
 * document and line allowances and charges, the VAT breakdown (plus BT-111 in
 * the accounting currency), the monetary totals, attachments and document
 * references, and lines with their item identifiers, classifications,
 * properties, price discount and classified VAT category. Line-level tax
 * totals are not emitted: BIS Billing 3.0 forbids them.
 *
 * @throws {UblBuildError} when a field EN 16931 / Peppol BIS makes mandatory
 * is missing (naming the BT and the model path), or when the document's
 * arithmetic breaks a business rule: BR-CO-3, BR-CO-10 to BR-CO-13, BR-CO-15,
 * BR-CO-16, BR-53, the BR-S-08 family, PEPPOL-EN16931-R040 and R120.
 */
export const serializeUblInvoice = (doc: UblInvoice): string => {
	validateInvoice(doc);

	const isCreditNote = doc.documentType === "CreditNote";
	const rootName = isCreditNote ? "CreditNote" : "Invoice";
	const rootNamespace = isCreditNote ? NS_CREDIT_NOTE : NS_INVOICE;
	const typeCodeElement = isCreditNote
		? el(
				"cbc:CreditNoteTypeCode",
				null,
				doc.invoiceTypeCode ?? CREDIT_NOTE_TYPE_CODE,
			)
		: el("cbc:InvoiceTypeCode", null, doc.invoiceTypeCode ?? INVOICE_TYPE_CODE);
	const taxPointDate = text("cbc:TaxPointDate", doc.taxPointDate);
	const means = paymentMeansList(doc);
	// A credit note has no cbc:DueDate: BT-9 goes in the first PaymentMeans.
	const creditNoteDueDate =
		isCreditNote && means.length > 0 ? doc.dueDate : undefined;

	const children: (XmlElement | null | false)[] = [
		el("cbc:CustomizationID", null, doc.customizationId ?? UBL_CUSTOMIZATION_ID),
		el("cbc:ProfileID", null, doc.profileId ?? UBL_PROFILE_ID),
		el("cbc:ID", null, doc.id),
		el("cbc:IssueDate", null, doc.issueDate),
		!isCreditNote ? text("cbc:DueDate", doc.dueDate) : null,
		// The CreditNote sequence puts BT-7 before the type code, Invoice after the note.
		isCreditNote ? taxPointDate : null,
		typeCodeElement,
		text("cbc:Note", doc.note),
		!isCreditNote ? taxPointDate : null,
		el("cbc:DocumentCurrencyCode", null, doc.currency),
		text("cbc:TaxCurrencyCode", doc.taxCurrency),
		text("cbc:AccountingCost", doc.accountingCost),
		text("cbc:BuyerReference", doc.buyerReference),
		invoicePeriod(doc.invoicePeriod),
		orderReference(doc),
		doc.billingReference ? billingReference(doc.billingReference) : null,
		documentReference("cac:DespatchDocumentReference", doc.despatchReference),
		documentReference("cac:ReceiptDocumentReference", doc.receivingAdviceReference),
		documentReference("cac:ContractDocumentReference", doc.contractReference),
		...(doc.attachments ?? []).map(attachmentReference),
		...(doc.documentReferences ?? []).map((reference) =>
			el("cac:AdditionalDocumentReference", null, [
				el("cbc:ID", null, reference.id ?? ""),
				text("cbc:DocumentDescription", reference.description),
			]),
		),
		doc.invoicedObjectId !== undefined
			? typedDocumentReference(doc.invoicedObjectId, "130")
			: null,
		!isCreditNote && doc.tenderReference !== undefined
			? typedDocumentReference({ value: doc.tenderReference }, "50")
			: null,
		// UBL's CreditNote has no cac:ProjectReference; BIS uses type code 50.
		isCreditNote && doc.projectReference !== undefined
			? typedDocumentReference({ value: doc.projectReference }, "50")
			: null,
		!isCreditNote
			? documentReference("cac:ProjectReference", doc.projectReference)
			: null,
		el("cac:AccountingSupplierParty", null, [
			party(doc.seller, doc.seller.name ?? ""),
		]),
		el("cac:AccountingCustomerParty", null, [
			party(doc.buyer, doc.buyer.name ?? ""),
		]),
		doc.payee ? payeeParty(doc.payee) : null,
		doc.taxRepresentative ? taxRepresentativeParty(doc.taxRepresentative) : null,
		doc.delivery ? delivery(doc.delivery) : null,
		...means.map((entry, index) =>
			paymentMeans(entry, index === 0 ? creditNoteDueDate : undefined),
		),
		// BT-20. In both sequences PaymentTerms sits after PaymentMeans and
		// before AllowanceCharge and TaxTotal.
		doc.paymentTermsNote !== undefined
			? el("cac:PaymentTerms", null, [el("cbc:Note", null, doc.paymentTermsNote)])
			: null,
		...(doc.allowanceCharges ?? []).map((entry, index) =>
			allowanceCharge(
				entry,
				doc.currency,
				`allowanceCharges[${index}]`,
				"document",
			),
		),
		el("cac:TaxTotal", null, [
			money("cbc:TaxAmount", doc.taxTotal.taxAmount ?? 0, doc.currency),
			...doc.taxTotal.subtotals.map((subtotal, index) =>
				taxSubtotal(subtotal, doc.currency, index),
			),
		]),
		// BT-111: a second TaxTotal carrying only the VAT total in BT-6.
		doc.taxCurrency !== undefined
			? el("cac:TaxTotal", null, [
					money(
						"cbc:TaxAmount",
						doc.taxTotal.taxAmountInTaxCurrency ?? 0,
						doc.taxCurrency,
					),
				])
			: null,
		el("cac:LegalMonetaryTotal", null, legalMonetaryTotalChildren(doc)),
		...doc.lines.map((source) => line(source, doc.currency, doc.documentType)),
	];

	const root = el(
		rootName,
		{
			xmlns: rootNamespace,
			"xmlns:cac": NS_CAC,
			"xmlns:cbc": NS_CBC,
		},
		children.filter((child): child is XmlElement => Boolean(child)),
	);

	return serializeDocument(root);
};

/** Alias of {@link serializeUblInvoice}, kept under the historical name. */
export const serializeUblDocument = serializeUblInvoice;
