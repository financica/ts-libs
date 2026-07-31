/**
 * @financica/pcmn — the Belgian PCMN (Plan Comptable Minimum Normalisé) class
 * taxonomy shared across the Financica suite. A single, dependency-free
 * definition of which account classes map to which economic categories, so
 * financica (aggregating a real ledger) and financica-plan (projecting one)
 * classify income, costs and assets identically.
 */

export {
	CASH_CLASSES,
	type CashClass,
	DIRECTOR_REMUNERATION_ACCOUNT,
	isCashClass,
	PCMN_PL_CLASSES,
	type PcmnPlClass,
	type PlCategory,
	plCategoryForCode,
	type PlSide,
} from "./pl.js";
export {
	type FixedAssetGroup,
	fixedAssetGroupForCode,
	PCMN_FIXED_ASSET_CLASSES,
	type PcmnFixedAssetClass,
} from "./assets.js";
export { type ContraSide, contraSideForCode, isContraCode } from "./contra.js";
