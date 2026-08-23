# Changelog

## 3.1.0

### Fixed

- **Division-to-section mapping follows NACE Rev. 2.1.** The map still described Rev. 2: division 45 is merged into 46/47, sections J–U shifted and section V was added by Regulation (EU) 2023/137, so codes in those ranges resolved to the wrong section.
- **CRLF data files parse cleanly.** The TSV parser split on `\n` alone, leaving a trailing `\r` on the last field of every row.

## 3.0.0

### Changed

- **Translations no longer ship in the default bundle.** The 24 EU translations are ~95% of the dataset, so only English is bundled; every other language is a module under `@financica/nace-codes/lang/<code>` (NACE headings) or `@financica/nace-codes/nacebel/lang/<code>` (NACEBEL explanatory notes, fr/nl/de) that you import and pass to the constructor via `languages`.

    If you only read `description.en`, or you only use NACEBEL's `nationalTitles`, nothing changes.

    Otherwise, TypeScript does _not_ flag this: the non-English fields were already optional, so the break shows up at runtime as `undefined` descriptions and empty `search()` results. Audit for:

    - `description.<lang>` for any language other than `en`
    - `search(query, { language })` with a non-`en` language — except NACEBEL nl/fr/de, which match `nationalTitles` and keep working
    - `explanatoryNote.<lang>` for fr/nl/de on NACEBEL codes

    Each is fixed by importing the matching pack and passing it to the constructor:

    ```diff
    - const nace = new NACE();
    + import fr from "@financica/nace-codes/lang/fr";
    + const nace = new NACE({ languages: [fr] });
    ```
