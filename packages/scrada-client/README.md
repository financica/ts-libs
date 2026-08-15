# @financica/scrada-client

TypeScript HTTP client for the [Scrada](https://www.scrada.be/) Peppol API. Scrada is a Belgian Peppol access point that exposes a JSON API for sending and receiving Peppol BIS Billing 3.0 documents (invoices, credit notes) plus participant registration and lookup.

This package is the thin transport layer: it wraps `https://api.scrada.be/v1` and exposes typed request/response shapes. It does not build payloads from upstream sources like Stripe; for that, see [`@financica/stripe-ubl`](../stripe-ubl).

## Installation

```bash
npm install @financica/scrada-client
```

Requires Node 18+ for the global `fetch`.

## Usage

```ts
import { ScradaApiClient } from "@financica/scrada-client";

const scrada = new ScradaApiClient({
	apiKey: process.env.SCRADA_API_KEY!,
	password: process.env.SCRADA_PASSWORD!,
});

const documentId = await scrada.sendOutboundSalesInvoice(companyId, invoice);
const info = await scrada.getOutboundDocumentInfo(companyId, documentId);
```

Or construct it from environment variables:

```ts
import { createScradaApiClientFromEnv } from "@financica/scrada-client";

// Reads SCRADA_API_KEY, SCRADA_PASSWORD, SCRADA_API_BASE_URL.
const scrada = createScradaApiClientFromEnv();
```

## Methods

| Method                           | HTTP   | Path                                                    |
| -------------------------------- | ------ | ------------------------------------------------------- |
| `registerCompany`                | POST   | `/company/{id}/peppol/register`                         |
| `deregisterCompany`              | DELETE | `/company/{id}/peppol/deregister/{scheme}/{id}`         |
| `getUnconfirmedInboundDocuments` | GET    | `/company/{id}/peppol/inbound/document/unconfirmed`     |
| `getInboundDocument`             | GET    | `/company/{id}/peppol/inbound/document/{docId}`         |
| `getInboundDocumentPdf`          | GET    | `/company/{id}/peppol/inbound/document/{docId}/pdf`     |
| `confirmInboundDocument`         | PUT    | `/company/{id}/peppol/inbound/document/{docId}/confirm` |
| `sendOutboundSalesInvoice`       | POST   | `/company/{id}/peppol/outbound/salesInvoice`            |
| `getOutboundDocumentInfo`        | GET    | `/company/{id}/peppol/outbound/document/{docId}/info`   |
| `lookupPeppolParticipant`        | GET    | `/company/{id}/peppol/lookup/{scheme}/{id}`             |
| `lookupPeppolParty`              | POST   | `/company/{id}/peppol/lookup`                           |

## Errors

All non-2xx responses surface as `ScradaApiError`:

```ts
import { ScradaApiClient, ScradaApiError } from "@financica/scrada-client";

try {
	await scrada.sendOutboundSalesInvoice(companyId, invoice);
} catch (err) {
	if (err instanceof ScradaApiError) {
		console.error(err.status, err.message, err.details);
	}
	throw err;
}
```

The `message` is extracted from the response body using `summarizeScradaErrorDetails`, which walks Scrada's variable error shapes (`{message}`, `{errors: [{detail}]}`, `{modelState}`, `{defaultFormat}`, …) and joins the human-readable strings with `|`. The full original body is preserved on `err.details`.

## Types

- `PeppolOnlyInvoice` — the body shape for the outbound sales invoice and self-billing endpoints (mirrors `v1.PeppolOnlyInvoice` in the Scrada OpenAPI spec).
- `PeppolOnlyInvoiceParty` — supplier or customer; includes the `vatStatus` field that determines whether the supplier may charge VAT (1 = Subject, 2 = Not subject, 3 = Small business / franchise).
- `PeppolOnlyInvoiceLine`, `SalesInvoiceVatTotal`, `ScradaInvoiceAttachment`, `ScradaAddress`.
- `ScradaInboundDocumentSummary`, `ScradaInboundDocumentResponse`, `ScradaOutboundDocumentInfo`, `ScradaPeppolLookupResponse`.
- Enum-coded scalars: `CompanyVatStatus`, `CompanyInvoiceLineVatType`, `CompanyInvoiceTaxNumberType`.

## Constants

`DEFAULT_SCRADA_API_BASE_URL`, `SCRADA_LANGUAGE_HEADER`, `SCRADA_ATTACHMENT_FILE_TYPE_INVOICE`, plus the default Peppol identifier scheme strings (`DEFAULT_PEPPOL_*`) used during participant registration.

## License

MIT
