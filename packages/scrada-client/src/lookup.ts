import { DEFAULT_PEPPOL_SENDER_IDENTIFIER_SCHEME } from "./constants";
import { ScradaApiError } from "./errors";
import type { ScradaPeppolLookupResponse } from "./types";

/**
 * Peppol lookup interpretation + recipient probing.
 *
 * Two Scrada quirks every consumer must handle, centralized here so apps
 * can't drift apart:
 *
 * 1. **Call shape.** The participant-lookup endpoint
 *    (`GET /company/{id}/peppol/lookup/{scheme}/{id}`) expects the iso6523
 *    participant scheme (`iso6523-actorid-upis`) with the EAS code carried
 *    *inside* the id (`9925:BE0206582284`). Splitting the candidate and
 *    passing `scheme="9925", id="BE0206582284"` 404s for every participant —
 *    including ones plainly on the network.
 *
 * 2. **Response shape.** The GET participant lookup returns the SMP data —
 *    `participantIdentifier` + `documentTypes` — and does NOT set the
 *    `registered` / `supportInvoice` / `supportCreditInvoice` booleans that
 *    the legacy party-lookup (POST) endpoint used. Registration and document
 *    support must be derived from the advertised document types, falling back
 *    to the booleans when present.
 */

/** Billing document kinds a Peppol recipient probe can be asked about. */
export type PeppolBillingDocumentType = "invoice" | "credit_note";

const documentTypeValues = (lookup: ScradaPeppolLookupResponse): string[] =>
	(lookup.documentTypes ?? [])
		.map((entry) => entry.value)
		.filter((value): value is string => typeof value === "string");

/**
 * Whether a Peppol document-type identifier advertises the BIS Billing 3.0
 * invoice. The identifier strings are network-standard, so the same predicate
 * matches Scrada's `documentTypes[].value` and other access points' lists.
 */
export const advertisesPeppolInvoice = (value: string) =>
	value.includes(":Invoice-2::Invoice##") && value.includes("billing:3.0");

/** …and likewise the BIS Billing 3.0 credit note document type. */
export const advertisesPeppolCreditNote = (value: string) =>
	value.includes(":CreditNote-2::CreditNote##") && value.includes("billing:3.0");

/**
 * Whether a Scrada participant lookup found the recipient on the Peppol
 * network. Falls back to "we resolved an SMP record" when the legacy
 * `registered` flag is absent (the GET participant lookup never sets it).
 */
export const isPeppolParticipantRegistered = (lookup: ScradaPeppolLookupResponse) =>
	lookup.registered ??
	(lookup.participantIdentifier != null || documentTypeValues(lookup).length > 0);

/**
 * Whether a lookup response says the participant can receive `documentType`.
 * Prefers Scrada's explicit support flags; otherwise derives support from the
 * advertised SMP document types.
 */
export const peppolLookupSupportsDocument = (
	documentType: PeppolBillingDocumentType,
	lookup: ScradaPeppolLookupResponse,
) => {
	if (!isPeppolParticipantRegistered(lookup)) return false;
	if (documentType === "credit_note") {
		return (
			lookup.supportCreditInvoice ??
			documentTypeValues(lookup).some(advertisesPeppolCreditNote)
		);
	}
	return (
		lookup.supportInvoice ??
		documentTypeValues(lookup).some(advertisesPeppolInvoice)
	);
};

/** A resolved Peppol recipient: which candidate matched, and what it supports. */
export interface PeppolParticipantMatch {
	/** The qualified candidate that resolved, e.g. `9925:BE0206582284`. */
	identifier: string;
	/** The same identifier split for UBL `EndpointID` use ({ scheme: EAS, value }). */
	endpoint: { scheme: string; value: string };
	networkRegistered: boolean;
	supportInvoice: boolean;
	supportCreditInvoice: boolean;
	/** The raw Scrada response for the matched candidate. */
	lookup: ScradaPeppolLookupResponse;
}

/** The one client method {@link probePeppolParticipant} needs (structural, for tests). */
export interface PeppolParticipantLookupClient {
	lookupPeppolParticipant(
		companyId: string,
		scheme: string,
		id: string,
	): Promise<ScradaPeppolLookupResponse>;
}

const toMatch = (
	candidate: string,
	endpoint: { scheme: string; value: string },
	lookup: ScradaPeppolLookupResponse,
): PeppolParticipantMatch => ({
	identifier: candidate,
	endpoint,
	networkRegistered: isPeppolParticipantRegistered(lookup),
	supportInvoice: peppolLookupSupportsDocument("invoice", lookup),
	supportCreditInvoice: peppolLookupSupportsDocument("credit_note", lookup),
	lookup,
});

/**
 * Probe a list of qualified participant identifier candidates
 * (`["9925:BE0206582284", "0208:0206582284", …]`, in priority order) and
 * return the first that is registered AND supports `documentType`.
 *
 * Falls back to the first registered candidate (so callers can report "on the
 * network but doesn't take this document type"), then to the first candidate
 * that resolved at all. Returns `null` when nothing resolves (every candidate
 * 404s or is unparseable). Non-404 Scrada errors are rethrown.
 *
 * Candidates are looked up with the correct Scrada call shape (see module
 * docs): `scheme = iso6523-actorid-upis`, `id = <full qualified candidate>`.
 */
export const probePeppolParticipant = async (
	client: PeppolParticipantLookupClient,
	companyId: string,
	candidates: readonly string[],
	documentType: PeppolBillingDocumentType = "invoice",
): Promise<PeppolParticipantMatch | null> => {
	let firstRegistered: PeppolParticipantMatch | null = null;
	let firstProbed: PeppolParticipantMatch | null = null;

	for (const candidate of candidates) {
		const separatorIndex = candidate.indexOf(":");
		if (separatorIndex <= 0) continue;
		const endpoint = {
			scheme: candidate.slice(0, separatorIndex).trim(),
			value: candidate.slice(separatorIndex + 1).trim(),
		};
		if (!endpoint.scheme || !endpoint.value) continue;

		let lookup: ScradaPeppolLookupResponse;
		try {
			// Sequential on purpose: the candidates are in priority order and the
			// loop returns on the first that supports the document type, so probing
			// them all in parallel would spend Scrada calls on candidates that a
			// higher-priority hit makes moot.
			// oxlint-disable-next-line no-await-in-loop
			lookup = await client.lookupPeppolParticipant(
				companyId,
				DEFAULT_PEPPOL_SENDER_IDENTIFIER_SCHEME,
				candidate,
			);
		} catch (error) {
			if (error instanceof ScradaApiError && error.status === 404) continue;
			throw error;
		}

		const match = toMatch(candidate, endpoint, lookup);
		firstProbed = firstProbed ?? match;
		if (match.networkRegistered) {
			firstRegistered = firstRegistered ?? match;
			const supportsRequested =
				documentType === "credit_note"
					? match.supportCreditInvoice
					: match.supportInvoice;
			if (supportsRequested) return match;
		}
	}

	return firstRegistered ?? firstProbed;
};
