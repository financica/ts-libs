import { buildEdpHeader } from "../edp/header.js";
import { NS_EDP } from "../edp/types.js";
import { el, serializeDocument, type ChildSpec, type XmlElement } from "../xml.js";
import { DDV_O_FIELDS } from "./fields.js";
import {
	NS_DDV_O,
	type DdvOCorrection,
	type DdvOEnvelopeOptions,
	type DdvORepresentedForeigner,
	type DdvOReturn,
} from "./types.js";

/** Money formatting: euros with exactly 2 decimals (xs:decimal, max 2 frac). */
const amount = (value: number): string => value.toFixed(2);

/** Rate formatting: `String(value)` — the shortest round-trip decimal (22, 9.5, 5). */
const rate = (value: number): string => String(value);

const bool = (value: boolean): string => (value ? "true" : "false");

const representedForeignerEl = (f: DdvORepresentedForeigner): XmlElement =>
	el("representedForeigner", null, [
		el("idNumber", null, f.idNumber),
		f.name != null && el("name", null, f.name),
		f.address != null && el("address", null, f.address),
	]);

const correctionEl = (c: DdvOCorrection): XmlElement =>
	el("selfReportOrCorrection", null, [
		c.periodStart != null && el("periodStart", null, c.periodStart),
		c.periodEnd != null && el("periodEnd", null, c.periodEnd),
		c.amount != null && el("amount", null, amount(c.amount)),
		c.interest != null && el("interest", null, amount(c.interest)),
	]);

/**
 * The ordered children of a `<DDV-O>` element, in XSD sequence. Optional
 * elements are dropped when absent (via the falsy-child filter in `el`).
 */
const ddvOChildren = (ret: DdvOReturn): ChildSpec[] => {
	const rates = ret.rates ?? {};
	const fieldEls = DDV_O_FIELDS.map((meta) => {
		const value = ret.fields[meta.id];
		return value != null && el(meta.id, null, amount(value));
	});

	return [
		// VAT rates in force: n_ddv (lower), v_ddv (higher), z_ddv (reduced).
		rates.lower != null && el("n_ddv", null, rate(rates.lower)),
		rates.higher != null && el("v_ddv", null, rate(rates.higher)),
		rates.reduced != null && el("z_ddv", null, rate(rates.reduced)),

		el("taxPeriodStart", null, ret.taxPeriodStart),
		el("taxPeriodEnd", null, ret.taxPeriodEnd),

		ret.selfReport != null && el("selfReport", null, bool(ret.selfReport)),
		ret.depositAfterDeadline != null &&
			el("depositAfterDeadline", null, bool(ret.depositAfterDeadline)),
		ret.declineSelfReportInstitute != null &&
			el(
				"selfReportDoNotUseInstitute",
				null,
				bool(ret.declineSelfReportInstitute),
			),

		ret.recordId != null && el("idEvidenc", null, ret.recordId),
		ret.contactPersonFullName != null &&
			el("contactPersonFullName", null, ret.contactPersonFullName),
		ret.contactPersonPhoneNumber != null &&
			el("contactPersonPhoneNumber", null, ret.contactPersonPhoneNumber),

		ret.representedForeigner != null &&
			representedForeignerEl(ret.representedForeigner),

		ret.representativeTaxNumber != null &&
			el("f02", null, String(ret.representativeTaxNumber)),
		ret.appliesDeductibleProportion != null &&
			el("f03", null, bool(ret.appliesDeductibleProportion)),
		ret.claimsRefund != null && el("f04", null, bool(ret.claimsRefund)),

		...fieldEls,

		...(ret.corrections ?? []).map(correctionEl),
	];
};

/**
 * Build the `<DDV-O>` element. By default it carries no namespace declaration,
 * so it can be nested inside an `Envelope` that declares the default namespace.
 * Pass `{ standalone: true }` to emit it as a root element with its own `xmlns`.
 */
export const buildDdvOElement = (
	ret: DdvOReturn,
	options: { standalone?: boolean } = {},
): XmlElement =>
	el("DDV-O", options.standalone ? { xmlns: NS_DDV_O } : null, ddvOChildren(ret));

/** Serialize a standalone `<DDV-O>` document (no envelope). */
export const serializeDdvO = (ret: DdvOReturn): string =>
	serializeDocument(buildDdvOElement(ret, { standalone: true }));

/**
 * Build the full eDavki `<Envelope>` element wrapping a DDV-O return: EDP header
 * (taxpayer), an empty `Signatures` placeholder (FURS signs on submission), and
 * the body. Element order follows `DDV_O_11.xsd`.
 */
export const buildDdvOEnvelopeElement = (opts: DdvOEnvelopeOptions): XmlElement =>
	el("Envelope", { xmlns: NS_DDV_O, "xmlns:edp": NS_EDP }, [
		buildEdpHeader(opts.taxpayer),
		el("edp:Signatures"),
		el("body", null, [el("edp:bodyContent"), buildDdvOElement(opts.return)]),
	]);

/** Serialize a complete DDV-O submission envelope to an XML string. */
export const buildDdvOEnvelope = (opts: DdvOEnvelopeOptions): string =>
	serializeDocument(buildDdvOEnvelopeElement(opts));
