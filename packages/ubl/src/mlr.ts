import type { Element } from "@xmldom/xmldom";
import { UblParseError } from "./errors.js";
import { CAC_NS, CBC_NS, parseXmlDocument } from "./xml-dom.js";

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
 * field is optional: a given MLR may omit any of them, and an omitted field is
 * an absent key.
 */
export interface PeppolMessageLevelResponse {
	customizationId?: string | undefined;
	profileId?: string | undefined;
	responseId?: string | undefined;
	issueDate?: string | undefined;
	issueTime?: string | undefined;
	referencedDocumentId?: string | undefined;
	responseCode?: string | undefined;
	description?: string | undefined;
	/** Sender participant id as `schemeID:value` (e.g. `0208:0793904121`). */
	senderIdentifier?: string | undefined;
	/** Receiver participant id as `schemeID:value`. */
	receiverIdentifier?: string | undefined;
}

const trimmed = (value: string | null | undefined): string | undefined => {
	const text = value?.trim();
	return text ? text : undefined;
};

/** First descendant CBC element's trimmed text, or undefined. */
const cbcText = (parent: Element, tag: string): string | undefined =>
	trimmed(parent.getElementsByTagNameNS(CBC_NS, tag)[0]?.textContent);

/**
 * First direct-child CBC element's trimmed text, or null. Used for the
 * top-level scalars so a nested `cbc:ID` (e.g. inside DocumentReference) cannot
 * shadow the ApplicationResponse's own id.
 */
const cbcDirectText = (parent: Element, tag: string): string | undefined => {
	for (let i = 0; i < parent.childNodes.length; i++) {
		const node = parent.childNodes[i];
		if (!node || node.nodeType !== 1) continue;
		const el = node as Element;
		if (el.namespaceURI === CBC_NS && el.localName === tag) {
			return trimmed(el.textContent);
		}
	}
	return undefined;
};

/** First descendant CAC element, or null. */
const cacElement = (parent: Element, tag: string): Element | null =>
	parent.getElementsByTagNameNS(CAC_NS, tag)[0] ?? null;

/**
 * The Peppol participant identifier of a SenderParty / ReceiverParty, rendered
 * as `schemeID:value` when the EndpointID carries a scheme and the value does
 * not already include one, otherwise the raw value.
 */
const endpointIdentifier = (party: Element | null): string | undefined => {
	if (!party) return undefined;
	const endpoint = party.getElementsByTagNameNS(CBC_NS, "EndpointID")[0];
	if (!endpoint) return undefined;
	const id = trimmed(endpoint.textContent);
	const scheme = endpoint.getAttribute("schemeID");
	if (scheme && id && !id.includes(":")) return `${scheme}:${id}`;
	return id;
};

/**
 * Locate the `ApplicationResponse` element, unwrapping a Standard Business
 * Document (SBDH) envelope when present. Returns null when the XML contains no
 * ApplicationResponse; throws {@link UblParseError} when it is malformed.
 */
const findApplicationResponse = (xml: string): Element | null => {
	const doc = parseXmlDocument(xml);
	const root = doc.documentElement;
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
	try {
		return findApplicationResponse(xml) !== null;
	} catch (error) {
		// A sniff answers "is this an MLR?"; malformed XML is simply "no".
		if (error instanceof UblParseError) return false;
		throw error;
	}
};

/**
 * Parse a Peppol Message Level Response (UBL `ApplicationResponse`), unwrapping
 * an SBDH envelope when present. Throws {@link UblParseError} when the XML is
 * malformed or is not an ApplicationResponse.
 */
export const parsePeppolMessageLevelResponse = (
	xml: string,
): PeppolMessageLevelResponse => {
	const root = findApplicationResponse(xml);
	if (!root) {
		throw new UblParseError("Document is not a Peppol Message Level Response");
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
			: undefined,
		responseCode: response ? cbcText(response, "ResponseCode") : undefined,
		description: response ? cbcText(response, "Description") : undefined,
		senderIdentifier: endpointIdentifier(cacElement(root, "SenderParty")),
		receiverIdentifier: endpointIdentifier(cacElement(root, "ReceiverParty")),
	};
};
