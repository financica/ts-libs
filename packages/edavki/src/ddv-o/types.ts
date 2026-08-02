import type { EdpTaxpayer } from "../edp/types.js";
import type { DdvOFieldId } from "./fields.js";

/** DDV-O document namespace (schema version 11). */
export const NS_DDV_O = "http://edavki.durs.si/Documents/Schemas/DDV_O_11.xsd";

/** The monetary box values, keyed by field id. Omitted fields are not emitted. */
export type DdvOFieldValues = Partial<Record<DdvOFieldId, number>>;

/**
 * The VAT rates in force for the period (`n_ddv` / `v_ddv` / `z_ddv`). Optional;
 * FURS uses these to label the form. Slovenia's 2026 rates are higher = 22,
 * lower = 9.5, reduced = 5.
 */
export interface DdvORates {
	/** `v_ddv` — higher (standard) rate, e.g. 22. */
	higher?: number;
	/** `n_ddv` — lower (reduced) rate, e.g. 9.5. */
	lower?: number;
	/** `z_ddv` — special reduced rate, e.g. 5. */
	reduced?: number;
}

/** A foreign taxpayer represented on the return (`representedForeigner`). */
export interface DdvORepresentedForeigner {
	/** Identification (VAT) number of the represented foreign person. */
	idNumber: string;
	name?: string;
	address?: string;
}

/** One voluntary-disclosure / correction line (`selfReportOrCorrection`). */
export interface DdvOCorrection {
	/** Corrected period start, `YYYY-MM-DD`. */
	periodStart?: string;
	/** Corrected period end, `YYYY-MM-DD`. */
	periodEnd?: string;
	/** VAT amount subject to correction. */
	amount?: number;
	/** Interest under Art. 88.b/88.c ZDDV-1. */
	interest?: number;
}

/**
 * A complete DDV-O VAT return, independent of the EDP envelope. Field semantics
 * are documented in {@link DDV_O_FIELDS}. Amounts are plain numbers (euros);
 * serialization rounds them to 2 decimals.
 */
export interface DdvOReturn {
	/** Tax period start, `YYYY-MM-DD`. */
	taxPeriodStart: string;
	/** Tax period end, `YYYY-MM-DD`. */
	taxPeriodEnd: string;
	/** VAT rates in force for the period (`n_ddv` / `v_ddv` / `z_ddv`). */
	rates?: DdvORates;
	/** `selfReport` — voluntary disclosure after the deadline (samoprijava). */
	selfReport?: boolean;
	/** `depositAfterDeadline` — application to submit after the deadline. */
	depositAfterDeadline?: boolean;
	/** `selfReportDoNotUseInstitute` — decline the voluntary-disclosure institute. */
	declineSelfReportInstitute?: boolean;
	/** `idEvidenc` — Record ID linking the VAT ledgers FURS used to pre-fill. */
	recordId?: string;
	/** `contactPersonFullName` — preparer name (optional, recommended). */
	contactPersonFullName?: string;
	/** `contactPersonPhoneNumber` — preparer phone (optional, recommended). */
	contactPersonPhoneNumber?: string;
	/** `representedForeigner` — when filing on behalf of a foreign person. */
	representedForeigner?: DdvORepresentedForeigner;
	/** `f02` — tax number of the representative. */
	representativeTaxNumber?: number;
	/** `f03` — taxpayer applies a deductible proportion (odbitni delež). */
	appliesDeductibleProportion?: boolean;
	/** `f04` — taxpayer claims a refund of the surplus. */
	claimsRefund?: boolean;
	/** The monetary boxes f11..f52. */
	fields: DdvOFieldValues;
	/** Voluntary-disclosure / correction lines for prior periods. */
	corrections?: DdvOCorrection[];
}

/** Options for building a full submission envelope. */
export interface DdvOEnvelopeOptions {
	/** The VAT return payload. */
	return: DdvOReturn;
	/** The taxpayer this filing is for (envelope header). */
	taxpayer: EdpTaxpayer;
}
