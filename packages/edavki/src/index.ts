/**
 * `@financica/edavki` — TypeScript toolkit for Slovenian eDavki (FURS) tax
 * documents.
 *
 * v0 covers the DDV-O VAT return: build a return from plain numbers and
 * serialize it as schema-faithful EDP XML (standalone or wrapped in a full
 * submission envelope) for manual import into the eDavki portal.
 */

export {
	el,
	serializeDocument,
	type ChildSpec,
	type XmlAttrs,
	type XmlElement,
} from "./xml.js";
export { NS_EDP, type EdpTaxpayer, type EdpTaxpayerType } from "./edp/types.js";
export { buildEdpHeader } from "./edp/header.js";
export * from "./ddv-o/index.js";
