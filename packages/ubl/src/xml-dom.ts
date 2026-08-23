import { type Document, DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { UblParseError } from "./errors.js";

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
 * falling back to @xmldom/xmldom. Throws {@link UblParseError} when the XML
 * is malformed.
 */
export const parseXmlDocument = (xml: string): Document => {
	const safeXml = stripDoctype(xml);
	const BrowserDomParser = (globalThis as { DOMParser?: typeof XmlDomParser })
		.DOMParser;
	const parser = BrowserDomParser ? new BrowserDomParser() : new XmlDomParser();
	let doc: Document;
	try {
		doc = parser.parseFromString(safeXml, "text/xml");
	} catch (cause) {
		throw new UblParseError("Malformed XML", { cause });
	}
	if (doc.getElementsByTagName("parsererror").length > 0 || !doc.documentElement) {
		throw new UblParseError("Malformed XML");
	}
	return doc;
};
