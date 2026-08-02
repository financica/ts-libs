# nace-codes

A TypeScript library for working with NACE and NACEBEL economic activity classification codes.

## Features

- **Full NACE Rev. 2.1 Support**: Complete hierarchy of European economic activity classifications
- **NACEBEL Extension**: Support for Belgian-specific 6-digit extensions
- **Multi-language**: Access descriptions in 24+ languages (NACE) and 4 languages (NACEBEL)
- **Flexible Code Lookup**: Search by various formats (e.g., "70.20", "7020", "702", "A")
- **Hierarchical Navigation**: Traverse parent-child relationships in the classification tree
- **Rich Metadata**: Access includes/excludes rules and explanatory notes
- **Type-Safe**: Full TypeScript support with strict typing
- **Lightweight**: Efficient data loading with lazy initialization
- **Tree-Shakeable**: Core NACE and the Belgian NACEBEL extension are separate
  entry points with disjoint data. Importing NACE never pulls Belgian data into
  your bundle.
- **Zero Dependencies**: No external runtime dependencies

## Installation

```bash
npm install nace-codes
```

## Entry Points

| Import               | Contents                                        |
| -------------------- | ----------------------------------------------- |
| `nace-codes`         | Core NACE Rev. 2.1 (EU) — the `NACE` class      |
| `nace-codes/nacebel` | Belgian NACEBEL extension — the `NACEBEL` class |

Only reach for `nace-codes/nacebel` when you need the Belgian national codes; it
bundles the NACE core data plus the Belgian delta.

## Quick Start

```typescript
import { NACE } from "nace-codes";
import { NACEBEL } from "nace-codes/nacebel";

// Initialize the NACE classifier
const nace = new NACE();

// Look up a code
const code = nace.getCode("70.20");
console.log(code.description.en); // "Management consultancy activities"

// Get code in different languages
console.log(code.description.fr); // "Conseil pour les affaires et autres conseils de gestion"
console.log(code.description.nl); // "Advisering op het gebied van management"

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

## API Reference

### NACE Class

#### `constructor(options?: NACEOptions)`

Initialize a new NACE classifier instance.

```typescript
interface NACEOptions {
	preload?: boolean; // Load all data on initialization (default: false)
}
```

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

interface LanguageDescriptions {
	en: string;
	fr?: string;
	de?: string;
	nl?: string;
	// ... other language codes
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
```

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
// Get descriptions in all available languages
const code = nace.getCode("70.20");
const languages: Language[] = ["en", "fr", "de", "nl", "es", "it"];

languages.forEach((lang) => {
	if (code.description[lang]) {
		console.log(`${lang}: ${code.description[lang]}`);
	}
});
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
into `src/generated/*.ts` (git-ignored). Core NACE data is emitted to
`naceData.ts`; each national extension (e.g. NACEBEL) is emitted as a separate
delta module so the entry points stay tree-shakeable.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub issue tracker](https://github.com/ingram-technologies/nace-codes/issues).
