import { DOMParser as XmlDomParser } from "@xmldom/xmldom";

const CBC_NS = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC_NS =
	"urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

/**
 * Peppol BIS MLR (Message Level Response) document-type identifier value
 * (Peppol `busdox-docid-qns` scheme).
 */
export const PEPPOL_MLR_DOCUMENT_TYPE_VALUE =
	"urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2::ApplicationResponse##urn:fdc:peppol.eu:poacc:trns:mlr:3::2.1";

/** Peppol BIS MLR process identifier value. */
export const PEPPOL_MLR_PROCESS_VALUE = "urn:fdc:peppol.eu:poacc:bis:mlr:3";

/**
 * A parsed Peppol Message Level Response (a UBL `ApplicationResponse`). Every
 * field is nullable: a given MLR may omit any of them.
 */
export interface PeppolMessageLevelResponse {
	customizationId: string | null;
	profileId: string | null;
	responseId: string | null;
	issueDate: string | null;
	issueTime: string | null;
	referencedDocumentId: string | null;
	responseCode: string | null;
	description: string | null;
	/** Sender participant id as `schemeID:value` (e.g. `0208:0793904121`). */
	senderIdentifier: string | null;
	/** Receiver participant id as `schemeID:value`. */
	receiverIdentifier: string | null;
}

/**
 * Strip DOCTYPE declarations to prevent XXE (XML External Entity) attacks.
 * @xmldom/xmldom resolves external entities by default, so we remove DOCTYPE
 * blocks (including inline DTD subsets) before parsing.
 */
const stripDoctype = (xml: string): string =>
	xml.replace(/<!DOCTYPE\s[^>[]*(?:\[[^\]]*\])?>/gi, "");

const parseXmlDocument = (xml: string): Document | null => {
	const safeXml = stripDoctype(xml);
	const BrowserDomParser = globalThis.DOMParser as typeof XmlDomParser | undefined;
	const parser = BrowserDomParser ? new BrowserDomParser() : new XmlDomParser();
	const doc = parser.parseFromString(safeXml, "text/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) return null;
	return doc;
};

const trimmed = (value: string | null | undefined): string | null => {
	const text = value?.trim();
	return text ? text : null;
};

/** First descendant CBC element's trimmed text, or null. */
const cbcText = (parent: Element, tag: string): string | null =>
	trimmed(parent.getElementsByTagNameNS(CBC_NS, tag)[0]?.textContent);

/**
 * First direct-child CBC element's trimmed text, or null. Used for the
 * top-level scalars so a nested `cbc:ID` (e.g. inside DocumentReference) cannot
 * shadow the ApplicationResponse's own id.
 */
const cbcDirectText = (parent: Element, tag: string): string | null => {
	for (let i = 0; i < parent.childNodes.length; i++) {
		const node = parent.childNodes[i];
		if (!node || node.nodeType !== 1) continue;
		const el = node as Element;
		if (el.namespaceURI === CBC_NS && el.localName === tag) {
			return trimmed(el.textContent);
		}
	}
	return null;
};

/** First descendant CAC element, or null. */
const cacElement = (parent: Element, tag: string): Element | null =>
	parent.getElementsByTagNameNS(CAC_NS, tag)[0] ?? null;

/**
 * The Peppol participant identifier of a SenderParty / ReceiverParty, rendered
 * as `schemeID:value` when the EndpointID carries a scheme and the value does
 * not already include one, otherwise the raw value.
 */
const endpointIdentifier = (party: Element | null): string | null => {
	if (!party) return null;
	const endpoint = party.getElementsByTagNameNS(CBC_NS, "EndpointID")[0];
	if (!endpoint) return null;
	const id = trimmed(endpoint.textContent);
	const scheme = endpoint.getAttribute("schemeID");
	if (scheme && id && !id.includes(":")) return `${scheme}:${id}`;
	return id;
};

/**
 * Locate the `ApplicationResponse` element, unwrapping a Standard Business
 * Document (SBDH) envelope when present. Returns null when the XML is not
 * parseable or contains no ApplicationResponse.
 */
const findApplicationResponse = (xml: string): Element | null => {
	let doc: Document | null;
	try {
		doc = parseXmlDocument(xml);
	} catch {
		return null;
	}
	const root = doc?.documentElement;
	if (!root) return null;
	if (root.localName === "ApplicationResponse") return root;
	const candidates = root.getElementsByTagName("*");
	for (let i = 0; i < candidates.length; i++) {
		const el = candidates[i];
		if (el?.localName === "ApplicationResponse") return el;
	}
	return null;
};

/**
 * Whether an inbound document is a Peppol Message Level Response, identified by
 * its document-type value, its process value, or by parsing the XML and finding
 * an `ApplicationResponse` root (SBDH-wrapped or not).
 */
export const isPeppolMessageLevelResponse = (params: {
	documentTypeValue?: string | null;
	processValue?: string | null;
	xml?: string | null;
}): boolean => {
	if (trimmed(params.documentTypeValue) === PEPPOL_MLR_DOCUMENT_TYPE_VALUE) {
		return true;
	}
	if (trimmed(params.processValue) === PEPPOL_MLR_PROCESS_VALUE) return true;
	const xml = trimmed(params.xml);
	if (!xml) return false;
	return findApplicationResponse(xml) !== null;
};

/**
 * Parse a Peppol Message Level Response (UBL `ApplicationResponse`), unwrapping
 * an SBDH envelope when present. Throws when the XML is not an
 * ApplicationResponse.
 */
export const parsePeppolMessageLevelResponse = (
	xml: string,
): PeppolMessageLevelResponse => {
	const root = findApplicationResponse(xml);
	if (!root) {
		throw new Error("Document is not a Peppol Message Level Response");
	}

	const documentResponse = cacElement(root, "DocumentResponse");
	const response = documentResponse ? cacElement(documentResponse, "Response") : null;
	const documentReference = documentResponse
		? cacElement(documentResponse, "DocumentReference")
		: null;

	return {
		customizationId: cbcDirectText(root, "CustomizationID"),
		profileId: cbcDirectText(root, "ProfileID"),
		responseId: cbcDirectText(root, "ID"),
		issueDate: cbcDirectText(root, "IssueDate"),
		issueTime: cbcDirectText(root, "IssueTime"),
		referencedDocumentId: documentReference
			? cbcText(documentReference, "ID")
			: null,
		responseCode: response ? cbcText(response, "ResponseCode") : null,
		description: response ? cbcText(response, "Description") : null,
		senderIdentifier: endpointIdentifier(cacElement(root, "SenderParty")),
		receiverIdentifier: endpointIdentifier(cacElement(root, "ReceiverParty")),
	};
};
