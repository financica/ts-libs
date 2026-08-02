/**
 * Belgian PCMN fixed-asset taxonomy (balance-sheet classes 20-28). Used by
 * financica-plan to model investments and their depreciation against the
 * statutory asset rubrics.
 */

/** Statutory fixed-asset groups of the Belgian balance sheet. */
export type FixedAssetGroup =
	| "formationExpenses" // 20 frais d'établissement
	| "intangible" // 21 immobilisations incorporelles
	| "tangible" // 22-27 immobilisations corporelles
	| "financial"; // 28 immobilisations financières

export interface PcmnFixedAssetClass {
	/** 2-digit PCMN class, e.g. "22". */
	readonly code: string;
	readonly group: FixedAssetGroup;
	/** French rubric of the Belgian balance sheet. */
	readonly label: string;
	/**
	 * Whether the class is depreciated at all. Financial assets (28) and
	 * assets under construction (27) are not; land within 22 is not either,
	 * but that split is finer than the class and left to the caller.
	 */
	readonly depreciable: boolean;
}

export const PCMN_FIXED_ASSET_CLASSES: Readonly<Record<string, PcmnFixedAssetClass>> = {
	"20": {
		code: "20",
		group: "formationExpenses",
		label: "Frais d'établissement",
		depreciable: true,
	},
	"21": {
		code: "21",
		group: "intangible",
		label: "Immobilisations incorporelles",
		depreciable: true,
	},
	"22": {
		code: "22",
		group: "tangible",
		label: "Terrains et constructions",
		depreciable: true,
	},
	"23": {
		code: "23",
		group: "tangible",
		label: "Installations, machines et outillage",
		depreciable: true,
	},
	"24": {
		code: "24",
		group: "tangible",
		label: "Mobilier et matériel roulant",
		depreciable: true,
	},
	"25": {
		code: "25",
		group: "tangible",
		label: "Immobilisations détenues en location-financement et droits similaires",
		depreciable: true,
	},
	"26": {
		code: "26",
		group: "tangible",
		label: "Autres immobilisations corporelles",
		depreciable: true,
	},
	"27": {
		code: "27",
		group: "tangible",
		label: "Immobilisations corporelles en cours et acomptes versés",
		depreciable: false,
	},
	"28": {
		code: "28",
		group: "financial",
		label: "Immobilisations financières",
		depreciable: false,
	},
};

/** The fixed-asset group for a PCMN account code, or null if not classes 20-28. */
export function fixedAssetGroupForCode(code: string): FixedAssetGroup | null {
	return PCMN_FIXED_ASSET_CLASSES[code.trim().slice(0, 2)]?.group ?? null;
}
