/**
 * `@financica/pcmn/charts` — the Belgian minimum charts of accounts themselves,
 * behind their own entry point because they are ~200 kB of data and the class
 * taxonomy in the root entry is not.
 */

import { PCMN_ASSOCIATIONS } from "./associations.data.js";
import { PCMN_ENTREPRISES } from "./entreprises.data.js";
import type { PcmnChart, PcmnChartId } from "./types.js";

export { PCMN_ASSOCIATIONS } from "./associations.data.js";
export { PCMN_ENTREPRISES } from "./entreprises.data.js";
export {
	accountByCode,
	coversCode,
	labelFor,
	PCMN_LANGUAGES,
	type PcmnAccount,
	type PcmnChart,
	type PcmnChartId,
	type PcmnLanguage,
	resolveCode,
} from "./types.js";

export const PCMN_CHARTS: Readonly<Record<PcmnChartId, PcmnChart>> = {
	"be-pcmn-entreprises": PCMN_ENTREPRISES,
	"be-pcmn-associations": PCMN_ASSOCIATIONS,
};

export function chartById(id: PcmnChartId): PcmnChart {
	return PCMN_CHARTS[id];
}
