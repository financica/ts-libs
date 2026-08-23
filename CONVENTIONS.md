# Conventions

Rules every package in this repository follows. They exist so a reader of one
package can predict the next; when a package deviates, the deviation is a bug
unless its README says why.

## Errors

**Parsers return `null` for "not this document", and throw for "broken".**
A parser (`parseUblInvoice`, `parseCamt053`, `parseCoda`, `parseXbrl`,
`parseFacturX`, …) returns `null` only when the input is well-formed but is not
the document type it parses — wrong root element, wrong namespace, no CODA
signature. That is the cheap check callers chain across formats. Anything else —
malformed XML, a required element missing, a field that fails validation —
throws the package's `XxxParseError`, with `cause` set when wrapping. A parser
never contains a blanket `try { … } catch { return null }`: it hides programmer
bugs as "not a document".

**HTTP clients throw one error family per package.** `XxxError` (base, with
`readonly cause?: unknown`) and `XxxApiError extends XxxError` with `readonly
status: number` and the response body (`details`). Network failures and aborts
are wrapped in `XxxError` rather than escaping as raw `fetch` rejections. Every
error class sets `this.name`.

**A result union is reserved for operations with several non-error outcomes**
(a Peppol lookup that finds nothing, a hosted page that fails soft). A package
that returns `{ ok, error }` says so in its README and does not also throw for
the same conditions.

## Absent values

**Parser output: an absent field is an absent key.** Types declare it as
`field?: T | undefined`; the parser never manufactures `""`, `0`, `new
Date(0)` or `"S"` to fill a gap. Containers the consumer iterates are always
present (`lines: []`, not `lines?:`). Enumerations read off the wire are
validated: a value outside the union is `undefined`, never cast.

**Builder input: `null` and `undefined` are both "not provided."** Build-side
types accept `T | null | undefined` for optional data, because callers feed them
from databases and APIs where `null` is the native absent. Internally a builder
normalises once (`normalizeString`) and never compares against `""`.

## Types

- The strict flag set in `tsconfig.base.json` applies to every package; a
  package overrides `lib`/`jsx`/`include` only.
- Dynamic data (parsed XML nodes, passthrough JSON) is `Record<string, unknown>`
  read through guarded helpers; a known shape gets an interface.
- `unknown` is for trust boundaries (untrusted JSON/XML, `cause`). Public
  function parameters with a known shape declare it.

## Packaging

- One `tsconfig.json` shape, one `files` list, `sideEffects: false` (CSS
  excepted), a `./package.json` export, ESM by default. Packages that still ship
  CJS do so for historical consumers and drop it at their next major.
- Every package has a `CHANGELOG.md`; its first `## <version>` heading equals
  `package.json`'s version (`bun run check:changelogs` enforces this in CI). An
  `## Unreleased` section above it collects in-flight changes and becomes the
  next version heading when the version is bumped.
- Tests live in `test/` (or next to the source as `*.test.ts`); the root
  `vitest.config.ts` is the only vitest config.
