import { type Document, DOMParser as XmlDomParser } from "@xmldom/xmldom";

export const CBC_NS =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
export const CAC_NS =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

/**
 * Strip DOCTYPE declarations to prevent XXE (XML External Entity) attacks.
 * @xmldom/xmldom resolves external entities by default, so we remove DOCTYPE
 * blocks (including inline DTD subsets) before parsing.
 */
export const stripDoctype = (xml: string): string =>
	xml.replace(/<!DOCTYPE\s[^>[]*(?:\[[^\]]*\])?>/gi, "");

/**
 * Parse XML into a DOM, preferring the host's `DOMParser` (browsers) and
 * falling back to @xmldom/xmldom. Returns `null` on a parse error.
 */
export const parseXmlDocument = (xml: string): Document | null => {
	const safeXml = stripDoctype(xml);
	const BrowserDomParser = (globalThis as { DOMParser?: typeof XmlDomParser })
		.DOMParser;
	const parser = BrowserDomParser ? new BrowserDomParser() : new XmlDomParser();
	const doc = parser.parseFromString(safeXml, "text/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return null;
	return doc;
};
