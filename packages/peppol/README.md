# @financica/peppol

Peppol network toolkit for TypeScript. Provider-free participant **discovery**
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

This targets the **OpenPeppol-operated SML** (`…sml.prod.tech.peppol.org`),
which replaced the retired EC `edelivery.tech.ec.europa.eu` zone — and the
modern **NAPTR** discovery that superseded the old CNAME scheme. A DNS name that
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

## EAS schemes by country

```ts
import { getPeppolCountryScheme, PEPPOL_COUNTRY_SCHEMES } from "@financica/peppol/schemes";

getPeppolCountryScheme("DE"); // → { country: "DE", scheme: "9930", example: "DE123456789" }
```

`@financica/peppol/schemes` and `@financica/peppol/document-types` are free of
Node built-ins, so they are safe to import in a browser bundle (e.g. to build a
country dropdown or label document types). The main entry pulls in the Node-only
lookups.

## Document type classification

```ts
import { classifyPeppolDocumentType } from "@financica/peppol/document-types";

classifyPeppolDocumentType(rawBusdoxId); // → "invoice" | "credit-note" | "order" | … | "other"
```

## License

MIT
