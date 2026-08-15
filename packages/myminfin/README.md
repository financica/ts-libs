# @financica/myminfin

TypeScript client for the Belgian SPF Finances MyMinFin and Intervat APIs.

Provides typed access to:

- **MyMinFin API** — Search and download documents from MyDoc / MyDocPro
- **Intervat API** — Submit VAT returns via XML
- **OIDC Authentication** — OAuth2 + PKCE with JWT client authentication

## Installation

```sh
npm install @financica/myminfin
```

Requires Node.js 24+ (uses native `fetch` and `crypto`).

## Authentication

All API calls require an OAuth2 access token obtained through the SPF Finances OIDC flow, which `MyMinFinAuth` implements.

### Prerequisites

You need:

- A **client ID** from SPF Finances registration
- An **RS256 private key** (PEM format) whose public key is published at your JWKS URL
- The **key ID (kid)** matching your public key
- A registered **redirect URI**

### Step 1: Build the authorization URL

```ts
import { MyMinFinAuth } from "@financica/myminfin";

const auth = new MyMinFinAuth({
	clientId: "YourClientId",
	privateKey: process.env.PRIVATE_KEY!, // PEM string
	keyId: "your-key-id",
	redirectUri: "https://yourapp.com/callback",
	environment: "test", // or "production"
});

// Generate the URL to redirect the legal representative to
const { url, state, nonce, codeVerifier } = await auth.getAuthorizationUrl({
	ecb: "0123456789", // 10-digit enterprise number
	scopes: ["myminfin_docs_read"], // API-specific scopes
});

// Store state, nonce, codeVerifier in the user's session
// Redirect the user's browser to `url`
```

### Step 2: Exchange the authorization code

```ts
// In your callback handler, after the user is redirected back:
const tokens = await auth.exchangeCode({
	code: callbackParams.code,
	codeVerifier: session.codeVerifier,
	redirectUri: "https://yourapp.com/callback",
});

// tokens.accessToken  — use for API calls
// tokens.refreshToken — store securely for token renewal
// tokens.idToken      — JWT with user identity claims
// tokens.expiresIn    — access token lifetime in seconds
```

### Step 3: Refresh tokens

Access tokens expire after ~5 minutes. Refresh tokens last 7 days but are single-use.

```ts
const newTokens = await auth.refreshToken({
	refreshToken: storedRefreshToken,
});
// Use newTokens.accessToken for subsequent API calls
// Store newTokens.refreshToken (the old one is now invalid)
```

## MyMinFin API — Document Search & Download

Search and download documents available on MyMinFin for companies you have mandates for.

```ts
import { MyMinFinClient } from "@financica/myminfin";

const client = new MyMinFinClient({
	accessToken: tokens.accessToken,
	environment: "test",
});
```

### Search documents

```ts
// Search all documents for the connected company + mandated entities
const result = await client.searchDocuments({
	since: "2024-10-01",
});

for (const doc of result.documents) {
	console.log(doc.uuid, doc.type, doc.title, doc.publishDate);
}
```

```ts
// Search only for a specific company
const result = await client.searchDocuments({
	since: "2024-10-01",
	ownerType: "CBE",
	ownerIdentifier: "0662348959",
});
```

### Download a document

```ts
import { writeFileSync } from "fs";

// Download a document owned by the connected company
const { content, contentType } = await client.downloadDocument(
	"662c6014-9f62-4956-acdc-0e25a233107d",
);

writeFileSync("document.pdf", Buffer.from(content));
```

```ts
// Download a document owned by a mandated entity
const { content } = await client.downloadDocument(
	"63c407ac-f56f-4b28-b36b-4e1336d6be89",
	{
		ownerType: "SSIN",
		ownerIdentifier: "01520605978",
	},
);
```

## Intervat API — VAT Return Submission

Submit VAT returns in XML format conforming to the Intervat XSD.

```ts
import { IntervatClient } from "@financica/myminfin";
import { readFileSync } from "fs";

const intervat = new IntervatClient({
	accessToken: tokens.accessToken,
	environment: "test",
});

// Submit XML string
const xml = readFileSync("vat-return.xml", "utf-8");
const result = await intervat.submitVatReturn("0806153934", xml);
console.log("Submission proof UUID:", result.uuid);

// Submit a file (XML or ZIP with annexes)
const file = readFileSync("vat-return.zip");
const zipResult = await intervat.submitVatReturnFile(
	"0806153934",
	file,
	"application/zip",
);
```

### Retrieve submission receipts

Submission receipts (PDF/XML) are not available through the Intervat API. Use the MyMinFin API to download them — note they are only available from the following day due to caching.

```ts
const receiptDocs = await client.searchDocuments({
	since: "2024-10-02", // day after submission
	ownerType: "CBE",
	ownerIdentifier: "0806153934",
});
```

## Error Handling

All API errors throw `MyMinFinApiError` with structured problem details:

```ts
import { MyMinFinApiError } from "@financica/myminfin";

try {
	await client.searchDocuments({ since: "2020-01-01" });
} catch (e) {
	if (e instanceof MyMinFinApiError) {
		console.error(e.status); // 400
		console.error(e.message); // "Search filtering invalid"
		console.error(e.problem?.detail); // Full problem detail
		console.error(e.problem?.instance); // Tracking UUID for support
	}
}
```

For Intervat business rule errors, the problem includes `businessrules` with multilingual descriptions:

```ts
try {
	await intervat.submitVatReturn(vatNumber, xml);
} catch (e) {
	if (e instanceof MyMinFinApiError && e.problem && "businessrules" in e.problem) {
		for (const rule of e.problem.businessrules) {
			console.error(rule.errorIdentifier, rule.descriptions.en);
		}
	}
}
```

## Rate Limiting

The MyMinFin API enforces rate limits per company (CBE number):

- **Search** (`/documents`): 1 request per 10 minutes per company
- **Download**: 12 downloads per minute per company (production)

When rate-limited, the API returns HTTP 429 with a `Retry-After` header.

## Environments

| Environment  | API base                       | OIDC base                          |
| ------------ | ------------------------------ | ---------------------------------- |
| `test`       | `https://wsapi-a.minfin.be`    | `https://fediamapi-a.minfin.be`    |
| `production` | `https://wsapi.minfin.fgov.be` | `https://fediamapi.minfin.fgov.be` |

## Endpoint helpers

All endpoint URLs are also exported as functions:

```ts
import {
	apiBase,
	oidcBase,
	authorizeUrl,
	tokenUrl,
	jwksUrl,
	discoveryUrl,
	issuerUrl,
	myminfinDocumentsUrl,
	intervatVatUrl,
} from "@financica/myminfin";

console.log(discoveryUrl("test"));
// https://fediamapi-a.minfin.be/sso/oauth2/.well-known/openid-configuration
```

## API Reference

### `MyMinFinAuth`

| Method                        | Parameters                            | Returns                                        |
| ----------------------------- | ------------------------------------- | ---------------------------------------------- |
| `getAuthorizationUrl(params)` | `{ ecb, scopes? }`                    | `Promise<{ url, state, nonce, codeVerifier }>` |
| `exchangeCode(params)`        | `{ code, codeVerifier, redirectUri }` | `Promise<TokenSet>`                            |
| `refreshToken(params)`        | `{ refreshToken }`                    | `Promise<TokenSet>`                            |

### `MyMinFinClient`

| Method                            | Parameters                                        | Returns                                                  |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `searchDocuments(params)`         | `{ since, until?, ownerType?, ownerIdentifier? }` | `Promise<DocumentSearchResult>`                          |
| `downloadDocument(uuid, params?)` | UUID string, `{ ownerType?, ownerIdentifier? }`   | `Promise<{ content: ArrayBuffer, contentType: string }>` |

### `IntervatClient`

| Method                                               | Parameters                               | Returns                        |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| `submitVatReturn(vatNumber, xml)`                    | VAT number, XML string                   | `Promise<VatSubmissionResult>` |
| `submitVatReturnFile(vatNumber, file, contentType?)` | VAT number, Buffer/Uint8Array, MIME type | `Promise<VatSubmissionResult>` |
| `getOpenApiSpec()`                                   | —                                        | `Promise<string>`              |

### `TokenSet`

| Field          | Type     | Description                   |
| -------------- | -------- | ----------------------------- |
| `accessToken`  | `string` | Bearer token for API calls    |
| `refreshToken` | `string` | Single-use token for renewal  |
| `idToken`      | `string` | JWT with user identity claims |
| `scope`        | `string` | Authorized scopes             |
| `tokenType`    | `string` | Always `"Bearer"`             |
| `expiresIn`    | `number` | Lifetime in seconds           |

## Document generators

Besides the API clients, the package generates the Intervat XML documents you
submit. These are pure functions: no auth, no network.

### Periodic VAT return

`buildBelgianVatReturn` maps semantic figures onto the Belgian grid and renders
`VATConsignment` XML. The balance lands in box 71 (payable) or 72 (refundable),
and a refund is requested automatically when in credit.

```ts
import { buildBelgianVatReturn } from "@financica/myminfin";

const { xml, grid, warnings } = buildBelgianVatReturn({
	declarant: { vatNumber: "BE0806.153.934", name: "Acme BV", countryCode: "BE" },
	period: { year: 2026, quarter: 2 },
	figures: {
		standardRatedSales: [{ rate: 21, base: 1000, vat: 210 }],
		purchaseBase: 400,
		deductibleVat: 84,
	},
});
```

The mapping covers domestic standard-rated sales (boxes 00/01/02/03 + 54),
deductible domestic purchases (boxes 82 + 59), intra-community supplies and
acquisitions, exports, domestic reverse charge and imports with postponed
accounting (44/45/46/47, 86/87/88 + 55/56/57), credit-note corrections
(48/49/84/85 with the VAT in 63/64) and miscellaneous regularisations (61/62).
The goods/investment purchase split (81/83) and prepayments (91) are not
modelled; `warnings` flags anything that could not be mapped. Use `serializeVatReturn` if
you already have explicit grid box amounts, or `computeBelgianVatGrid` for just
the grid.

### Annual client listing

```ts
import { generateClientListingXml } from "@financica/myminfin";

const xml = generateClientListingXml({
	declarant: { vatNumber: "0806153934", name: "Acme BV", countryCode: "BE" },
	period: 2025,
	clients: [
		{
			vatNumber: "0766280697",
			countryCode: "BE",
			turnover: 10500,
			vatAmount: 2205,
		},
	],
});
```

## Reference material

- [`convention.md`](./convention.md) — SPF Finances API usage convention (French, third-party text).
- [`intervat-api.md`](./intervat-api.md) — vendored Intervat API guide, version 09/07/2025.

## Development

Standard scripts — see the [repository README](../../README.md#getting-started).

## License

MIT
