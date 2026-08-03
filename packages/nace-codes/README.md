# nace-codes

A TypeScript library for working with NACE and NACEBEL economic activity classification codes.

## Features

- **Full NACE Rev. 2.1 Support**: Complete hierarchy of European economic activity classifications
- **NACEBEL Extension**: Support for Belgian-specific 6-digit extensions
- **Multi-language**: Descriptions in 24 languages (NACE) and 4 languages
  (NACEBEL), each loadable on its own
- **Flexible Code Lookup**: Search by various formats (e.g., "70.20", "7020", "702", "A")
- **Hierarchical Navigation**: Traverse parent-child relationships in the classification tree
- **Rich Metadata**: Access includes/excludes rules and explanatory notes
- **Type-Safe**: Full TypeScript support with strict typing
- **Pay For What You Load**: English ships in the default bundle; each other
  language is a separate module you opt into. Translations are the bulk of this
  dataset, so one locale costs roughly one locale.
- **Tree-Shakeable**: Core NACE and the Belgian NACEBEL extension are separate
  entry points with disjoint data. Importing NACE never pulls Belgian data into
  your bundle.
- **Zero Dependencies**: No external runtime dependencies

## Installation

```bash
npm install @financica/nace-codes
```

## Entry Points

| Import                                      | Contents                                              |
| ------------------------------------------- | ----------------------------------------------------- |
| `@financica/nace-codes`                     | Core NACE Rev. 2.1 (EU) — the `NACE` class, English   |
| `@financica/nace-codes/nacebel`             | Belgian NACEBEL extension — the `NACEBEL` class       |
| `@financica/nace-codes/lang/<code>`         | NACE heading translations for one language            |
| `@financica/nace-codes/nacebel/lang/<code>` | NACEBEL explanatory notes for one language (fr/nl/de) |

Only reach for `nace-codes/nacebel` when you need the Belgian national codes; it
bundles the NACE core data plus the Belgian delta.

Approximate gzipped cost, so you can see where the weight is:

| Module                | gzipped |
| --------------------- | ------- |
| core NACE (English)   | ~194 KB |
| `lang/<code>`         | ~15 KB  |
| NACEBEL (English)     | ~470 KB |
| `nacebel/lang/<code>` | ~275 KB |

## Quick Start

```typescript
import { NACE } from "@financica/nace-codes";
import { NACEBEL } from "@financica/nace-codes/nacebel";

// Initialize the NACE classifier
const nace = new NACE();

// Look up a code
const code = nace.getCode("70.20");
console.log(code.description.en); // "Management consultancy activities"

// Other languages are opt-in — see "Languages" below
console.log(code.description.fr); // undefined

// Navigate hierarchy
const parent = nace.getParent("70.20");
console.log(parent?.code); // "70.2"

const children = nace.getChildren("70");
console.log(children.map((c) => c.code)); // ["70.1", "70.2"]

// Access metadata
const details = nace.getCode("01.11");
console.log(details.includes); // Description of what this code includes
console.log(details.excludes); // Description of what this code excludes
```

## Languages

The 24 EU translations are ~95% of this dataset, so only English ships in the
default bundle. Every other language is a module you import explicitly and hand
to the constructor:

```typescript
import { NACE } from "@financica/nace-codes";
import da from "@financica/nace-codes/lang/da";

const nace = new NACE({ languages: [da] });

nace.getCode("01.11").description.da; // "Dyrkning af korn ..."
nace.search("dyrkning", { language: "da" }); // matches Danish text
```

Only the languages you pass are populated. `description.fr` is `undefined`
without the `fr` pack, and `search({ language: "fr" })` returns no results —
there is nothing to match against.

Load a locale on demand with a dynamic import:

```typescript
const pack = await import(`@financica/nace-codes/lang/${locale}`);
const nace = new NACE({ languages: [pack.default] });
```

Language packs are resolved when the code map is built, so pass them at
construction. To switch locale at runtime, construct a new instance.

### Languages with NACEBEL

NACEBEL has two independent translated fields:

- `nationalTitles` (nl/fr/de/en) — the official Belgian titles. These ship
  eagerly in `nace-codes/nacebel`, need no pack, and are what NACEBEL `search()`
  matches for nl/fr/de.
- `explanatoryNote` — the long Markdown notes, by far the largest field. English
  ships in the bundle; fr/nl/de come from `nacebel/lang/<code>`.

`description` (the inherited EU heading) still comes from `lang/<code>`, so a
French consumer who wants both fields passes both packs:

```typescript
import { NACEBEL } from "@financica/nace-codes/nacebel";
import fr from "@financica/nace-codes/lang/fr";
import frNotes from "@financica/nace-codes/nacebel/lang/fr";

const nacebel = new NACEBEL({ languages: [fr, frNotes] });
```

## API Reference

### NACE Class

#### `constructor(options?: NACEOptions)`

Initialize a new NACE classifier instance.

```typescript
interface NACEOptions {
	preload?: boolean; // Load all data on initialization (default: false)
	languages?: readonly LanguagePack[]; // Translations to layer on (default: none)
}
```

Note that `preload` only controls _when_ the bundled data is parsed and indexed.
It has no effect on bundle size; that is what the language modules are for.

#### `getCode(code: string): NACECode | null`

Retrieve information about a specific NACE code.

```typescript
const code = nace.getCode("70.20");
// Accepts various formats: "70.20", "7020", "702", "70", "M", etc.
```

#### `getParent(code: string): NACECode | null`

Get the parent code in the hierarchy.

```typescript
const parent = nace.getParent("70.20"); // Returns code 70.2
```

#### `getChildren(code: string): NACECode[]`

Get all direct children of a code.

```typescript
const children = nace.getChildren("70"); // Returns codes 70.1 and 70.2
```

#### `getAncestors(code: string): NACECode[]`

Get all ancestors up to the top level.

```typescript
const ancestors = nace.getAncestors("70.20");
// Returns: [70.2, 70, M] (from immediate parent to section)
```

#### `getDescendants(code: string): NACECode[]`

Get all descendants recursively.

```typescript
const descendants = nace.getDescendants("70");
// Returns all codes under 70, including 70.1, 70.10, 70.2, 70.21, 70.22
```

#### `getSiblings(code: string): NACECode[]`

Get all codes at the same level with the same parent.

```typescript
const siblings = nace.getSiblings("70.21");
// Returns: [70.22] (other codes under 70.2)
```

#### `search(query: string, options?: SearchOptions): NACECode[]`

Search for codes by description.

```typescript
interface SearchOptions {
	language?: Language; // Language to search in (default: 'en')
	fuzzy?: boolean; // Enable fuzzy matching (default: false)
	limit?: number; // Maximum results (default: 10)
}

const results = nace.search("consultant", { language: "en", fuzzy: true });
```

#### `getAllCodes(level?: number): NACECode[]`

Get all codes, optionally filtered by level.

```typescript
const sections = nace.getAllCodes(1); // All section codes (A-U)
const divisions = nace.getAllCodes(2); // All 2-digit divisions
```

#### `getLevel(code: string): number`

Get the hierarchical level of a code.

```typescript
nace.getLevel("A"); // Returns: 1 (section)
nace.getLevel("01"); // Returns: 2 (division)
nace.getLevel("01.1"); // Returns: 3 (group)
nace.getLevel("01.11"); // Returns: 4 (class)
```

### NACEBEL Class

Extends NACE with Belgian-specific codes up to 6 digits.

#### Additional Methods

All NACE methods are available, plus:

#### `getBelgianExtensions(naceCode: string): NACEBELCode[]`

Get Belgian-specific extensions for a NACE code.

```typescript
const extensions = nacebel.getBelgianExtensions("01.11");
// Returns 6-digit Belgian extensions like 01.11001, 01.11002, etc.
```

### Types

```typescript
interface NACECode {
	code: string;
	level: number;
	description: LanguageDescriptions;
	parent?: string;
	includes?: string;
	includesAlso?: string;
	excludes?: string;
	implementationRule?: string;
}

interface NACEBELCode extends NACECode {
	version: string;
	nationalTitles: {
		nl: string;
		fr: string;
		de: string;
		en: string;
	};
}

// `en` is always present; every other language appears only when its pack is loaded
type LanguageDescriptions = { en: string } & Partial<Record<OptionalLanguage, string>>;

// What `lang/<code>` and `nacebel/lang/<code>` default-export
interface LanguagePack {
	language: OptionalLanguage;
	descriptions?: Record<string, string>;
	explanatoryNotes?: Record<string, string>;
}

type Language =
	| "en"
	| "fr"
	| "de"
	| "nl"
	| "es"
	| "it"
	| "pt"
	| "bg"
	| "cs"
	| "da"
	| "el"
	| "et"
	| "fi"
	| "ga"
	| "hr"
	| "hu"
	| "lt"
	| "lv"
	| "mt"
	| "pl"
	| "ro"
	| "sk"
	| "sl"
	| "sv";

type OptionalLanguage = Exclude<Language, "en">;
```

The `LANGUAGES`, `OPTIONAL_LANGUAGES`, and `BUNDLED_LANGUAGE` constants are
exported too, if you need to enumerate what exists at runtime.

## Code Format Normalization

The library automatically normalizes various input formats:

- `"70.20"` → `"7020"` (internal format)
- `"7020"` → `"7020"` (already normalized)
- `"702"` → `"702"` (3-digit group)
- `"70"` → `"70"` (2-digit division)
- `"M"` → `"M"` (section)
- `"m"` → `"M"` (case insensitive for sections)

## Examples

### Finding Related Activities

```typescript
// Find all consultancy-related activities
const consultancy = nace.search("consultancy");
consultancy.forEach((code) => {
	console.log(`${code.code}: ${code.description.en}`);
});
```

### Building a Classification Tree

```typescript
function printTree(code: string, indent = 0): void {
	const node = nace.getCode(code);
	if (!node) return;

	console.log(" ".repeat(indent) + `${node.code}: ${node.description.en}`);

	const children = nace.getChildren(code);
	children.forEach((child) => printTree(child.code, indent + 2));
}

printTree("M"); // Print entire "Professional, scientific and technical activities" tree
```

### Validating Codes

```typescript
function isValidNACE(code: string): boolean {
	return nace.getCode(code) !== null;
}

function isValidNACEBEL(code: string): boolean {
	return nacebel.getCode(code) !== null;
}
```

### Multi-language Support

```typescript
import de from "@financica/nace-codes/lang/de";
import fr from "@financica/nace-codes/lang/fr";
import nl from "@financica/nace-codes/lang/nl";

const nace = new NACE({ languages: [fr, de, nl] });

const code = nace.getCode("70.20");
for (const lang of ["en", "fr", "de", "nl"] as const) {
	console.log(`${lang}: ${code.description[lang]}`);
}
```

### Working with Inclusions and Exclusions

```typescript
const code = nace.getCode("01.13");
console.log("This class includes:");
console.log(code.includes);

console.log("\nThis class also includes:");
console.log(code.includesAlso);

console.log("\nThis class excludes:");
console.log(code.excludes);
```

## Migrating from 2.x

Translations no longer ship in the default bundle. If you only read
`description.en`, or you only use NACEBEL's `nationalTitles`, nothing changes.

Otherwise, note that TypeScript will _not_ flag this for you: the non-English
fields were already optional, so the break shows up at runtime as `undefined`
descriptions and empty `search()` results. Audit for:

- `description.<lang>` for any language other than `en`
- `search(query, { language })` with a non-`en` language — except NACEBEL nl/fr/de,
  which match `nationalTitles` and keep working
- `explanatoryNote.<lang>` for fr/nl/de on NACEBEL codes

Each is fixed by importing the matching pack and passing it to the constructor:

```diff
- const nace = new NACE();
+ import fr from "@financica/nace-codes/lang/fr";
+ const nace = new NACE({ languages: [fr] });
```

## Data Sources

This library uses official classification data from:

- **NACE Rev. 2.1**: European Union statistical classification
- **NACEBEL 2025**: Belgian national extension of NACE

## Development

This repo uses [Bun](https://bun.sh) and the [oxc](https://oxc.rs) toolchain:
oxlint, oxfmt, and [tsdown](https://tsdown.dev) (rolldown-powered bundler).

```bash
bun install
bun run generate:data   # regenerate src/generated/* from data/
bun run build           # generate data + bundle with tsdown
bun run test            # vitest
bun run typecheck       # tsc --noEmit
bun run lint            # oxlint
bun run format          # oxfmt --write
bun run ci              # typecheck + lint + test + build
```

The classification data lives in `data/` as TSV. `generate:data` compiles it
into `src/generated/*.ts`, which is committed. Core NACE data is emitted to
`naceData.ts`; each national extension (e.g. NACEBEL) is emitted as a separate
delta module so the entry points stay tree-shakeable. Translations are split out
per language into `generated/lang/*.ts` and `generated/nacebel/lang/*.ts`, one
build entry each.

`src/languageList.ts` is the single source of truth for the language axis: the
generator, the `tsdown` entry map, and the `Language` type all derive from it, so
adding a language means editing one list.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub issue tracker](https://github.com/financica/ts-libs/issues).
