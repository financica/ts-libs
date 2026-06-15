import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { classifyPeppolDocumentType, type PeppolDocumentTypeKind } from "./document-types";
import { isRecord, toErrorMessage } from "./internal";

/** The only participant identifier scheme in Peppol production use. */
const PARTICIPANT_ID_SCHEME = "iso6523-actorid-upis";
/**
 * Production Peppol SML zone (the EU "edelivery" SML that replaced the legacy
 * `sml.peppolcentral.org`). A participant is reachable when a DNS record exists
 * under `B-<hash>.iso6523-actorid-upis.edelivery.tech.ec.europa.eu`.
 */
const SML_ZONE = "edelivery.tech.ec.europa.eu";

const DEFAULT_TIMEOUT_MS = 6000;

export type PeppolLookupResult =
	| {
			status: "registered";
			/** Human form, e.g. `9925:BE0123456789`. */
			participantId: string;
			documentTypes: PeppolDocumentTypeKind[];
	  }
	| { status: "not_registered"; participantId: string }
	| { status: "error"; participantId: string; message: string };

const cleanIdentifierValue = (value: string) =>
	value
		.trim()
		.replace(/\s+/g, "")
		.replace(/[^A-Za-z0-9]/g, "");

/** Human participant id, e.g. `9925:BE0123456789`. */
export const buildParticipantId = (scheme: string, value: string) =>
	`${scheme.trim()}:${cleanIdentifierValue(value)}`;

/** Canonical participant id used for hashing and the SMP query path. */
export const buildCanonicalParticipantId = (scheme: string, value: string) =>
	`${PARTICIPANT_ID_SCHEME}::${buildParticipantId(scheme, value)}`;

/**
 * The SML hostname that resolves (via DNS) to the participant's SMP, following
 * the OpenPeppol SML algorithm: `B-` + hex MD5 of the lowercased canonical
 * participant id, under the scheme + SML zone.
 */
export const buildSmpHostname = (canonicalParticipantId: string) => {
	const hash = createHash("md5")
		.update(canonicalParticipantId.toLowerCase())
		.digest("hex");
	return `B-${hash}.${PARTICIPANT_ID_SCHEME}.${SML_ZONE}`;
};

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
	value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Extract the raw busdox document type identifiers from an SMP `ServiceGroup`
 * document. Each `ServiceMetadataReference` href ends in the URL-encoded
 * document type id (after `/services/`); we decode it back to its canonical
 * form.
 */
export const parseServiceGroupDocumentTypes = (xml: string): string[] => {
	const parsed: unknown = xmlParser.parse(xml);
	const serviceGroup = isRecord(parsed) ? parsed.ServiceGroup : undefined;
	const collection = isRecord(serviceGroup)
		? serviceGroup.ServiceMetadataReferenceCollection
		: undefined;
	const references = isRecord(collection)
		? asArray(collection.ServiceMetadataReference)
		: [];

	const docTypes = new Set<string>();
	for (const reference of references) {
		const href = isRecord(reference) ? reference["@_href"] : undefined;
		if (typeof href !== "string") continue;
		const marker = "/services/";
		const index = href.lastIndexOf(marker);
		const encoded =
			index >= 0 ? href.slice(index + marker.length) : (href.split("/").pop() ?? "");
		if (!encoded) continue;
		try {
			docTypes.add(decodeURIComponent(encoded));
		} catch {
			docTypes.add(encoded);
		}
	}
	return [...docTypes];
};

const dedupeKinds = (rawDocTypes: string[]): PeppolDocumentTypeKind[] => [
	...new Set(rawDocTypes.map(classifyPeppolDocumentType)),
];

/**
 * A failed DNS resolution (the SML name does not exist) is the authoritative
 * signal that a participant is *not* registered, distinct from a transport
 * error where we genuinely can't tell.
 */
const isDnsNotFound = (error: unknown): boolean => {
	const cause = isRecord(error) && isRecord(error.cause) ? error.cause : null;
	const code = cause && typeof cause.code === "string" ? cause.code : null;
	if (code === "ENOTFOUND" || code === "EAI_AGAIN") return true;
	const message = toErrorMessage(error).toLowerCase();
	return message.includes("enotfound") || message.includes("getaddrinfo");
};

/**
 * Check whether a participant is reachable on the Peppol network via a public
 * SML → SMP lookup. No API keys, no provider, no per-call cost: we resolve the
 * SML hostname and read the SMP's `ServiceGroup` to confirm registration and
 * list the document types the participant can receive.
 *
 * Node-only: uses `node:crypto` for the SML hash and reads the SMP over plain
 * HTTP (HTTPS to the SML hostname fails certificate validation, as the cert is
 * issued for the SMP's own domain).
 */
export const lookupPeppolParticipant = async (params: {
	scheme: string;
	value: string;
	/** Abort the lookup after this many milliseconds (default 6000). */
	timeoutMs?: number;
}): Promise<PeppolLookupResult> => {
	const participantId = buildParticipantId(params.scheme, params.value);
	const canonical = buildCanonicalParticipantId(params.scheme, params.value);
	const hostname = buildSmpHostname(canonical);
	const url = `http://${hostname}/${encodeURIComponent(canonical)}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { accept: "application/xml" },
		});
		if (response.status === 404) {
			return { status: "not_registered", participantId };
		}
		if (!response.ok) {
			return {
				status: "error",
				participantId,
				message: `SMP responded with ${response.status}`,
			};
		}
		const xml = await response.text();
		return {
			status: "registered",
			participantId,
			documentTypes: dedupeKinds(parseServiceGroupDocumentTypes(xml)),
		};
	} catch (error) {
		if (isDnsNotFound(error)) {
			return { status: "not_registered", participantId };
		}
		return { status: "error", participantId, message: toErrorMessage(error) };
	} finally {
		clearTimeout(timeout);
	}
};
