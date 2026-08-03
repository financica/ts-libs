import type { LanguageDescriptions, LanguagePack, NACECode } from "./types";

/**
 * Layers opt-in translation packs over an English-only code map, returning a new
 * map. Entries no pack touches are shared with the input by reference, so the
 * base map stays cached and untouched across instances.
 */
export function applyLanguagePacks<T extends NACECode>(
	codes: Record<string, T>,
	packs: readonly LanguagePack[],
): Record<string, T> {
	if (packs.length === 0) return codes;

	const merged: Record<string, T> = {};

	for (const [code, entry] of Object.entries(codes)) {
		// Copied lazily on first hit, then mutated: an entry no pack touches stays
		// shared with the cached base map.
		let description: LanguageDescriptions | undefined;
		let explanatoryNote: LanguageDescriptions | undefined;

		for (const pack of packs) {
			const translation = pack.descriptions?.[code];
			if (translation) {
				description ??= { ...entry.description };
				description[pack.language] = translation;
			}

			const note = pack.explanatoryNotes?.[code];
			// A translated note needs an English note to attach to: codes without
			// one have no `explanatoryNote` at all, and `en` is non-optional.
			if (note && entry.explanatoryNote !== undefined) {
				explanatoryNote ??= { ...entry.explanatoryNote };
				explanatoryNote[pack.language] = note;
			}
		}

		merged[code] =
			description === undefined && explanatoryNote === undefined
				? entry
				: {
						...entry,
						description: description ?? entry.description,
						explanatoryNote: explanatoryNote ?? entry.explanatoryNote,
					};
	}

	return merged;
}
