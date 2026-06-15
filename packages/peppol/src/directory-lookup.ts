import { isRecord } from "./internal";

const DIRECTORY_SEARCH_URL = "https://directory.peppol.eu/search/1.0/json";
const DEFAULT_TIMEOUT_MS = 5000;

export interface PeppolDirectoryEntry {
	name: string | null;
	countryCode: string | null;
}

const toStringOrNull = (value: unknown): string | null => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** `Array.isArray` on `unknown` widens to `any[]`; keep the elements `unknown`. */
const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * The directory's `name` field has shifted format across versions: older
 * responses return a plain string, newer ones a `[{ name, language }]` list.
 * Accept both.
 */
const extractName = (value: unknown): string | null => {
	if (typeof value === "string") return value.trim() || null;
	const first = toArray(value).find((entry) => isRecord(entry) && entry.name);
	return isRecord(first) ? toStringOrNull(first.name) : null;
};

/**
 * Best-effort business-card enrichment from the public Peppol Directory. The
 * directory only lists participants who opted in, so it is *not* a source of
 * truth for reachability (that's {@link lookupPeppolParticipant}); it just gives
 * a display name and country when available. Any failure resolves to `null`.
 */
export const lookupPeppolDirectory = async (
	canonicalParticipantId: string,
	options?: { timeoutMs?: number },
): Promise<PeppolDirectoryEntry | null> => {
	const url = `${DIRECTORY_SEARCH_URL}?participant=${encodeURIComponent(canonicalParticipantId)}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { accept: "application/json" },
		});
		if (!response.ok) return null;
		const body: unknown = await response.json();
		const matches = isRecord(body) ? body.matches : undefined;
		const firstMatch = toArray(matches)[0];
		const entities = isRecord(firstMatch) ? firstMatch.entities : undefined;
		const firstEntity = toArray(entities)[0];
		if (!isRecord(firstEntity)) return null;
		return {
			name: extractName(firstEntity.name),
			countryCode: toStringOrNull(firstEntity.countryCode),
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
};
