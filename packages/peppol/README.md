# @financica/peppol

Peppol network toolkit for TypeScript. Provider-free participant discovery
and reference data: check whether a company is reachable on the Peppol network,
read the document types it accepts, enrich it from the public Peppol Directory,
and resolve the right electronic address scheme (EAS) per country.

No API keys, no access point, no per-call cost — it talks to the public Peppol
SML, SMP, and Directory directly.

```bash
npm install @financica/peppol
```

## Participant reachability (SML → SMP)

Resolve a participant's SML `NAPTR` record to its SMP, then read the SMP's
`ServiceGroup` to confirm registration and list the document types it can
receive. **Node only** (uses `node:crypto` for the SML hash and `node:dns` for
the NAPTR lookup).

```ts
import { lookupPeppolParticipant } from "@financica/peppol";

const result = await lookupPeppolParticipant({ scheme: "9925", value: "BE0123456789" });
// → { status: "registered", participantId: "9925:BE0123456789", documentTypes: ["invoice", "credit-note"] }
//   { status: "not_registered", participantId }
//   { status: "error", participantId, message }

// Pass `environment: "test"` to query the test SMK instead of production.
```

This targets the OpenPeppol-operated SML (`…sml.prod.tech.peppol.org`) via
NAPTR discovery. A DNS name that
doesn't exist (or carries no NAPTR) means the participant is not registered;
any other DNS/transport failure returns `status: "error"` so callers can
distinguish "absent" from "couldn't check".

## Directory enrichment

The public Peppol Directory carries business-card data for participants who
opted in. Best-effort only (not a source of truth for reachability):

```ts
import { buildCanonicalParticipantId, lookupPeppolDirectory } from "@financica/peppol";

const entry = await lookupPeppolDirectory(
	buildCanonicalParticipantId("9925", "BE0123456789"),
);
// → { name: "ACME NV", countryCode: "BE" } | null
```

## Participant identifier normalization

Users type identifiers the way they are printed. Normalization has to be
scheme-aware, because the SML name is `base32(sha256(lowercase(id)))` — every
character added or removed addresses a _different_ participant:

```ts
import { normalizeParticipantValue } from "@financica/peppol/identifiers";

normalizeParticipantValue("0208", "0762.747.721"); // → "0762747721"
normalizeParticipantValue("0204", "991-07335-68"); // → "991-07335-68"
```

Whitespace and characters outside the policy repertoire (`A-Za-z0-9.-_~`) always
go. The separators `-` `.` `_` `~` are dropped only for schemes whose registered
structure has none — the Belgian enterprise number, GLN, the VAT schemes and
friends. A German Leitweg-ID (`0204`), a GEBA (`0246`), and any scheme not in
`PEPPOL_PARTICIPANT_SCHEMES` keep their value verbatim, so a scheme added to the
code list next year fails safe.

## EAS schemes by country

```ts
import {
	getPeppolCountryScheme,
	PEPPOL_COUNTRY_SCHEMES,
} from "@financica/peppol/schemes";

getPeppolCountryScheme("DE"); // → { country: "DE", scheme: "9930", example: "DE123456789" }
```

`@financica/peppol/schemes`, `@financica/peppol/document-types`,
`@financica/peppol/countries` and `@financica/peppol/identifiers` are free of
Node built-ins, so they are safe to
import in a browser bundle (e.g. to build a country dropdown or label document
types). The main entry pulls in the Node-only lookups.

## Country e-invoicing profiles

Provider-neutral per-country facts for building an e-invoicing
integration: the legal delivery network, the company and (separate, when one
exists) VAT participant EAS schemes, where the VAT/registration number is
validated (VIES vs BRREG), statutory archival years, and the org-number length
to gate onboarding inputs on.

```ts
import { getCountryEInvoicingProfile } from "@financica/peppol/countries";

getCountryEInvoicingProfile("NO");
// → { network: "peppol", companyIdentifierScheme: "0192", vatIdentifierScheme: null, … }
```

A test pins these profiles to the addressing table in `./schemes` so the two
views cannot drift.

To resolve the participant identifier schemes for any Peppol country, using the
profile when there is one and falling back to the VAT-based addressing scheme
otherwise, use `getPeppolIdentifierSchemes`:

```ts
import { getPeppolIdentifierSchemes } from "@financica/peppol/countries";

getPeppolIdentifierSchemes("BE"); // profiled → { companyIdentifierScheme: "0208", vatIdentifierScheme: "9925" }
getPeppolIdentifierSchemes("DE"); // unprofiled → { companyIdentifierScheme: null, vatIdentifierScheme: "9930" }
getPeppolIdentifierSchemes("CA"); // outside Peppol → null
```

This is what keeps an unprofiled sender's VAT id addressed under its own
country scheme instead of a provider's Belgian default.

Either scheme can be null. Null means register nothing under that scheme;
substituting a default would publish an identifier under another country's
scheme. Norway and Denmark have no separate VAT scheme, and an unprofiled
country has no known company scheme.

## Document type classification

```ts
import { classifyPeppolDocumentType } from "@financica/peppol/document-types";

classifyPeppolDocumentType(rawBusdoxId); // → "invoice" | "credit-note" | "order" | … | "other"
```

`document-types` also exports the canonical BIS Billing 3.0, Self-Billing 3.0,
and Invoice Response document type and process identifiers for registration
payloads.

## License

MIT
