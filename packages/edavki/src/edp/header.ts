import { el, type XmlElement } from "../xml.js";
import type { EdpTaxpayer } from "./types.js";

/**
 * Build the `<edp:Header>` element for an eDavki envelope.
 *
 * EDP-Common uses `elementFormDefault="qualified"`, so every child is emitted in
 * the EDP namespace via the `edp:` prefix (declared on the envelope root). The
 * header sequence permits `taxpayer, responseTo?, Workflow?, CustodianInfo?,
 * domain?`; only `taxpayer` is required and that is all we emit.
 */
export const buildEdpHeader = (taxpayer: EdpTaxpayer): XmlElement =>
	el("edp:Header", null, [el("edp:taxpayer", null, buildTaxpayerChildren(taxpayer))]);

const buildTaxpayerChildren = (t: EdpTaxpayer): XmlElement[] => {
	const children: XmlElement[] = [];
	// Schema choice: taxNumber XOR vatNumber, emitted first.
	if (t.vatNumber) {
		children.push(el("edp:vatNumber", null, t.vatNumber));
	} else if (t.taxNumber) {
		children.push(el("edp:taxNumber", null, t.taxNumber));
	}
	if (t.taxpayerType) children.push(el("edp:taxpayerType", null, t.taxpayerType));
	if (t.name) children.push(el("edp:name", null, t.name));
	if (t.address1) children.push(el("edp:address1", null, t.address1));
	if (t.address2) children.push(el("edp:address2", null, t.address2));
	if (t.city) children.push(el("edp:city", null, t.city));
	if (t.postNumber) children.push(el("edp:postNumber", null, t.postNumber));
	if (t.postName) children.push(el("edp:postName", null, t.postName));
	if (t.registrationNumber) {
		children.push(el("edp:maticnaStevilka", null, t.registrationNumber));
	}
	if (t.countryID) children.push(el("edp:countryID", null, t.countryID));
	if (t.countryName) children.push(el("edp:countryName", null, t.countryName));
	return children;
};
