import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { XMLParser } from "fast-xml-parser";
import {
	classifyPeppolDocumentType,
	type PeppolDocumentTypeKind,
} from "./document-types";
import { isRecord, toErrorMessage } from "./internal";

/** The only participant identifier scheme in Peppol production use. */
const PARTICIPANT_ID_SCHEME = "iso6523-actorid-upis";

/**
 * OpenPeppol-operated SML DNS zones for participant discovery.
 *
 * These replace the retired EC-operated `edelivery.tech.ec.europa.eu` zone:
 * OpenPeppol insourced the SML and, in the same move, migrated discovery from
 * the old **CNAME** records (`B-<md5-hex>…`, hostname == SMP) to **NAPTR**
 * records (`<base32-sha256>…`, whose `Meta:SMP` record points at the SMP URL).
 */
const SML_ZONES = {
	production: "participant.sml.prod.tech.peppol.org",
	test: "participant.sml.test.tech.peppol.org",
} as const;

/** Which SML to query: the live network (`production`) or the test SMK. */
export type PeppolSmlEnvironment = keyof typeof SML_ZONES;

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

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercased and stripped of `=` padding (the SML form). */
const base32NoPadding = (bytes: Buffer): string => {
	let bits = 0;
	let value = 0;
	let output = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
			bits -= 5;
		}
	}
	if (bits > 0) {
		output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
	}
	return output;
};

/**
 * The SML hostname whose NAPTR record locates the participant's SMP, following
 * the OpenPeppol NAPTR algorithm:
 *
 *   strip-padding(base32(sha256(lowercase(participantId)))) + "." + scheme + "." + zone
 *
 * where `participantId` is the human id (e.g. `9915:test`). For example
 * `9915:test` on the test SMK yields
 * `eh5boavaktmbgzyh2a63dz4qov33fvp5nsdvqklucfraayoodw6a.iso6523-actorid-upis.participant.sml.test.tech.peppol.org`.
 *
 * (The retired EC algorithm hashed the canonical id with MD5/hex and prefixed
 * `B-`, resolving CNAME records instead of NAPTR.)
 */
export const buildSmlHostname = (
	participantId: string,
	environment: PeppolSmlEnvironment = "production",
): string => {
	const hash = base32NoPadding(
		createHash("sha256").update(participantId.toLowerCase()).digest(),
	);
	return `${hash}.${PARTICIPANT_ID_SCHEME}.${SML_ZONES[environment]}`;
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
			index >= 0
				? href.slice(index + marker.length)
				: (href.split("/").pop() ?? "");
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
 * Pull the SMP base URL out of a U-NAPTR `regexp` field of the form
 * `!<ere>!<replacement>!`. Peppol's `Meta:SMP` records use `.*` as the ERE, so
 * the replacement is the participant's absolute SMP URL (no back-references).
 */
export const parseSmpUrlFromNaptrRegexp = (regexp: string): string | null => {
	const delimiter = regexp[0];
	if (!delimiter) return null;
	// parts: ["", <ere>, <replacement>, <flags>]
	const replacement = regexp.split(delimiter)[2]?.trim();
	if (!replacement || !/^https?:\/\//i.test(replacement)) return null;
	return replacement.replace(/\/+$/, "");
};

/**
 * Resolve the participant's SMP base URL from its SML NAPTR records. Returns
 * `null` when the name resolves but advertises no usable `Meta:SMP` record.
 * Throws the underlying DNS error (so the caller can tell NXDOMAIN apart from a
 * transient failure).
 */
const resolveSmpBaseUrl = async (
	hostname: string,
	timeoutMs: number,
): Promise<string | null> => {
	const resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
	const records = await resolver.resolveNaptr(hostname);
	const smpRecords = records
		.filter(
			(record) =>
				record.service === "Meta:SMP" &&
				record.flags.toUpperCase().includes("U"),
		)
		.sort((a, b) => a.order - b.order || a.preference - b.preference);
	for (const record of smpRecords) {
		const url = parseSmpUrlFromNaptrRegexp(record.regexp);
		if (url) return url;
	}
	return null;
};

/**
 * A DNS resolution that says the name doesn't exist (`ENOTFOUND`) or carries no
 * NAPTR record (`ENODATA`) is the authoritative signal that a participant is
 * *not* registered. Any other DNS failure (timeout, SERVFAIL, transient
 * `EAI_AGAIN`) is reported as an error — we genuinely couldn't check, and must
 * not be mistaken for "absent".
 */
const isDnsNotFound = (error: unknown): boolean => {
	const direct =
		isRecord(error) && typeof error.code === "string" ? error.code : null;
	const cause =
		isRecord(error) && isRecord(error.cause) && typeof error.cause.code === "string"
			? error.cause.code
			: null;
	const code = direct ?? cause;
	return code === "ENOTFOUND" || code === "ENODATA";
};

/**
 * Check whether a participant is reachable on the Peppol network via a public
 * SML → SMP lookup. No API keys, no provider, no per-call cost: we resolve the
 * SML NAPTR record to the participant's SMP, then read the SMP's `ServiceGroup`
 * to confirm registration and list the document types it can receive.
 *
 * Node-only: uses `node:crypto` for the SML hash and `node:dns` for the NAPTR
 * lookup. (The SMP itself is read over HTTPS on its own domain, as the NAPTR
 * record dictates.)
 */
export const lookupPeppolParticipant = async (params: {
	scheme: string;
	value: string;
	/** Which SML to query (default `production`). */
	environment?: PeppolSmlEnvironment;
	/** Abort the lookup after this many milliseconds (default 6000). */
	timeoutMs?: number;
}): Promise<PeppolLookupResult> => {
	const participantId = buildParticipantId(params.scheme, params.value);
	const canonical = buildCanonicalParticipantId(params.scheme, params.value);
	const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const hostname = buildSmlHostname(
		participantId,
		params.environment ?? "production",
	);

	let smpBaseUrl: string | null;
	try {
		smpBaseUrl = await resolveSmpBaseUrl(hostname, timeoutMs);
	} catch (error) {
		if (isDnsNotFound(error)) {
			return { status: "not_registered", participantId };
		}
		return { status: "error", participantId, message: toErrorMessage(error) };
	}
	if (!smpBaseUrl) {
		return { status: "not_registered", participantId };
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);
	try {
		const response = await fetch(`${smpBaseUrl}/${encodeURIComponent(canonical)}`, {
			signal: controller.signal,
			// Some SMPs reject a strict `application/xml` Accept with 406, so offer
			// the common XML types plus a wildcard.
			headers: { accept: "application/xml, text/xml, */*" },
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
		return { status: "error", participantId, message: toErrorMessage(error) };
	} finally {
		clearTimeout(timeout);
	}
};
