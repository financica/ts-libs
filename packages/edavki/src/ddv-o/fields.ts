/**
 * DDV-O field registry.
 *
 * Every monetary box on the Slovenian VAT return (form DDV-O), in the exact
 * order the XSD (`DDV_O_11.xsd`) sequences them. Field semantics are taken from
 * the FURS "Instructions for completing VAT returns" (eDavki).
 *
 * Sections mirror the form:
 *  - `supplies`     (I.)   taxable/exempt output **tax base**, VAT-excluded
 *  - `vatCharged`   (II.)  output **VAT amounts** (incl. self-assessed/reverse charge)
 *  - `purchases`    (III.) input **tax base**, VAT-excluded
 *  - `vatDeducted`  (IV.)  deductible input **VAT amounts**
 *  - `settlement`   (V.)   net VAT liability (f51) / surplus (f52)
 *
 * `kind` distinguishes a tax-base field from a VAT-amount field. `rate` is set
 * for rate-specific boxes (22 % standard, 9.5 % reduced, 5 % special reduced,
 * 8 % flat-rate compensation).
 */

export type DdvOFieldId =
	| "f11"
	| "f11a"
	| "f12"
	| "f13"
	| "f14"
	| "f15"
	| "f21"
	| "f22"
	| "f22a"
	| "f23"
	| "f23a"
	| "f24"
	| "f24a"
	| "f24b"
	| "f24c"
	| "f25"
	| "f25a"
	| "f25b"
	| "f26"
	| "f31"
	| "f31a"
	| "f32"
	| "f32a"
	| "f33"
	| "f34"
	| "f35"
	| "f41"
	| "f42"
	| "f42a"
	| "f43"
	| "f51"
	| "f52";

export type DdvOSection =
	| "supplies"
	| "vatCharged"
	| "purchases"
	| "vatDeducted"
	| "settlement";

export interface DdvOFieldMeta {
	id: DdvOFieldId;
	section: DdvOSection;
	/** `base` = taxable amount (VAT-excluded); `vat` = a VAT amount. */
	kind: "base" | "vat";
	/** VAT rate for rate-specific boxes (percent), when applicable. */
	rate?: 22 | 9.5 | 5 | 8;
	labelEn: string;
	labelSl: string;
}

/** All DDV-O monetary fields, in XSD sequence order. */
export const DDV_O_FIELDS: readonly DdvOFieldMeta[] = [
	// I. Supplies of goods and services (tax base)
	{
		id: "f11",
		section: "supplies",
		kind: "base",
		labelEn:
			"Supplies of goods and services (taxable, incl. exempt with credit and exports)",
		labelSl: "Dobave blaga in storitev",
	},
	{
		id: "f11a",
		section: "supplies",
		kind: "base",
		labelEn:
			"Supplies in Slovenia for which the recipient pays VAT (reverse charge, Art. 76.a)",
		labelSl:
			"Dobave blaga in storitev v Sloveniji, od katerih obračuna DDV prejemnik",
	},
	{
		id: "f12",
		section: "supplies",
		kind: "base",
		labelEn: "Supplies of goods and services to other EU Member States",
		labelSl: "Dobave blaga in storitev v druge države članice EU",
	},
	{
		id: "f13",
		section: "supplies",
		kind: "base",
		labelEn: "Distance selling of goods",
		labelSl: "Prodaja blaga na daljavo",
	},
	{
		id: "f14",
		section: "supplies",
		kind: "base",
		labelEn: "Assembly and installation of goods in other Member States",
		labelSl: "Montaža in instalacija blaga v drugih državah članicah",
	},
	{
		id: "f15",
		section: "supplies",
		kind: "base",
		labelEn: "Exempt supplies without right to deduct",
		labelSl: "Oproščene dobave brez pravice do odbitka",
	},

	// II. VAT charged (output VAT amounts)
	{
		id: "f21",
		section: "vatCharged",
		kind: "vat",
		rate: 22,
		labelEn: "VAT charged at 22 %",
		labelSl: "Obračunani DDV po stopnji 22 %",
	},
	{
		id: "f22",
		section: "vatCharged",
		kind: "vat",
		rate: 9.5,
		labelEn: "VAT charged at 9.5 %",
		labelSl: "Obračunani DDV po stopnji 9,5 %",
	},
	{
		id: "f22a",
		section: "vatCharged",
		kind: "vat",
		rate: 5,
		labelEn: "VAT charged at 5 %",
		labelSl: "Obračunani DDV po stopnji 5 %",
	},
	{
		id: "f23",
		section: "vatCharged",
		kind: "vat",
		rate: 22,
		labelEn: "VAT on acquisition of goods from EU at 22 %",
		labelSl: "DDV od pridobitev blaga iz EU po stopnji 22 %",
	},
	{
		id: "f23a",
		section: "vatCharged",
		kind: "vat",
		rate: 22,
		labelEn: "VAT on services received from EU at 22 %",
		labelSl: "DDV od prejetih storitev iz EU po stopnji 22 %",
	},
	{
		id: "f24",
		section: "vatCharged",
		kind: "vat",
		rate: 9.5,
		labelEn: "VAT on acquisition of goods from EU at 9.5 %",
		labelSl: "DDV od pridobitev blaga iz EU po stopnji 9,5 %",
	},
	{
		id: "f24a",
		section: "vatCharged",
		kind: "vat",
		rate: 9.5,
		labelEn: "VAT on services received from EU at 9.5 %",
		labelSl: "DDV od prejetih storitev iz EU po stopnji 9,5 %",
	},
	{
		id: "f24b",
		section: "vatCharged",
		kind: "vat",
		rate: 5,
		labelEn: "VAT on acquisition of goods from EU at 5 %",
		labelSl: "DDV od pridobitev blaga iz EU po stopnji 5 %",
	},
	{
		id: "f24c",
		section: "vatCharged",
		kind: "vat",
		rate: 5,
		labelEn: "VAT on services received from EU at 5 %",
		labelSl: "DDV od prejetih storitev iz EU po stopnji 5 %",
	},
	{
		id: "f25",
		section: "vatCharged",
		kind: "vat",
		rate: 22,
		labelEn: "VAT self-assessed as recipient of goods/services at 22 %",
		labelSl: "DDV na podlagi samoobdavčitve kot prejemnik po stopnji 22 %",
	},
	{
		id: "f25a",
		section: "vatCharged",
		kind: "vat",
		rate: 9.5,
		labelEn: "VAT self-assessed as recipient of goods/services at 9.5 %",
		labelSl: "DDV na podlagi samoobdavčitve kot prejemnik po stopnji 9,5 %",
	},
	{
		id: "f25b",
		section: "vatCharged",
		kind: "vat",
		rate: 5,
		labelEn: "VAT self-assessed as recipient of goods/services at 5 %",
		labelSl: "DDV na podlagi samoobdavčitve kot prejemnik po stopnji 5 %",
	},
	{
		id: "f26",
		section: "vatCharged",
		kind: "vat",
		labelEn: "VAT self-assessed on import",
		labelSl: "DDV na podlagi samoobdavčitve od uvoza",
	},

	// III. Purchases of goods and services (tax base)
	{
		id: "f31",
		section: "purchases",
		kind: "base",
		labelEn: "Purchases of goods and services",
		labelSl: "Nabava blaga in storitev",
	},
	{
		id: "f31a",
		section: "purchases",
		kind: "base",
		labelEn:
			"Purchases in Slovenia for which the recipient pays VAT (reverse charge, Art. 76.a)",
		labelSl:
			"Nabava blaga in storitev v Sloveniji, od katerih obračuna DDV prejemnik",
	},
	{
		id: "f32",
		section: "purchases",
		kind: "base",
		labelEn: "Acquisitions of goods from other EU Member States",
		labelSl: "Pridobitve blaga iz drugih držav članic EU",
	},
	{
		id: "f32a",
		section: "purchases",
		kind: "base",
		labelEn: "Services received from other EU Member States",
		labelSl: "Prejete storitve iz drugih držav članic EU",
	},
	{
		id: "f33",
		section: "purchases",
		kind: "base",
		labelEn: "Exempt purchases and exempt acquisitions of goods",
		labelSl: "Oproščene nabave in oproščene pridobitve blaga",
	},
	{
		id: "f34",
		section: "purchases",
		kind: "base",
		labelEn: "Purchase price of immovable property",
		labelSl: "Nabavna vrednost nepremičnin",
	},
	{
		id: "f35",
		section: "purchases",
		kind: "base",
		labelEn: "Purchase price of other fixed assets",
		labelSl: "Nabavna vrednost drugih osnovnih sredstev",
	},

	// IV. VAT deduction (input VAT amounts). f41/f42/f42a mirror the 22/9.5/5
	// charged rates; f43 is the 8 % flat-rate compensation deduction.
	{
		id: "f41",
		section: "vatDeducted",
		kind: "vat",
		rate: 22,
		labelEn: "Input VAT deducted at 22 %",
		labelSl: "Odbitek DDV po stopnji 22 %",
	},
	{
		id: "f42",
		section: "vatDeducted",
		kind: "vat",
		rate: 9.5,
		labelEn: "Input VAT deducted at 9.5 %",
		labelSl: "Odbitek DDV po stopnji 9,5 %",
	},
	{
		id: "f42a",
		section: "vatDeducted",
		kind: "vat",
		rate: 5,
		labelEn: "Input VAT deducted at 5 %",
		labelSl: "Odbitek DDV po stopnji 5 %",
	},
	{
		id: "f43",
		section: "vatDeducted",
		kind: "vat",
		rate: 8,
		labelEn: "Deduction of flat-rate compensation at 8 %",
		labelSl: "Odbitek pavšalnega nadomestila po stopnji 8 %",
	},

	// V. Settlement
	{
		id: "f51",
		section: "settlement",
		kind: "vat",
		labelEn: "VAT liability",
		labelSl: "Obveznost za plačilo DDV",
	},
	{
		id: "f52",
		section: "settlement",
		kind: "vat",
		labelEn: "VAT surplus (credit)",
		labelSl: "Presežek DDV",
	},
];

/** Field metadata indexed by id, for O(1) lookup. */
export const DDV_O_FIELD_BY_ID: Readonly<Record<DdvOFieldId, DdvOFieldMeta>> =
	Object.fromEntries(DDV_O_FIELDS.map((f) => [f.id, f])) as Record<
		DdvOFieldId,
		DdvOFieldMeta
	>;
