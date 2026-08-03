# @financica/stripe-hosted-invoices

Read a Stripe invoice, credit note or receipt **from its public hosted URL** — no API key, no OAuth, no connected account.

When a customer forwards you a Stripe invoice link, you have a URL and nothing else. The Stripe API needs a secret key you will never have for someone else's account. This package closes that gap by speaking the same protocol the hosted invoice page speaks to render itself: the page is handed a short-lived **ephemeral key** that authorises read-only access to that one invoice, and that key is enough to pull the invoice, its full line items, its credit notes and its PDFs.

```
https://invoice.stripe.com/i/acct_…/live_…
                │
                ▼
   @financica/stripe-hosted-invoices ──▶ invoice + lines + credit notes + receipt
```

For the opposite direction — turning a `Stripe.Invoice` you _do_ own into Peppol UBL — see [`@financica/stripe-ubl`](../stripe-ubl).

## ⚠️ This uses undocumented Stripe endpoints

`invoicedata.stripe.com`, `/v1/invoices/{id}/hosted` and the ephemeral-key auth flow are **not public API**. They are not in Stripe's docs, not covered by its API-versioning promise, and can change or disappear without notice.

What that means in practice:

- Every function fails soft and returns a typed error instead of throwing. Build your flow so a failure degrades rather than breaks.
- Requests are pinned to Stripe API version `2020-03-02`, because that is what the hosted endpoints speak. Do not change it to match your own API version.
- If you have an API key for the account, **use the official `stripe` SDK instead**. This package is for the case where you do not.
- Read only. Nothing here creates, modifies or pays anything.

## Installation

```bash
npm install @financica/stripe-hosted-invoices
```

One runtime dependency (`node-html-parser`, for the receipt page). Requires a global `fetch` — Node ≥18, Bun, Deno or a browser. Node ≥24 is what CI covers.

## Usage

### Read everything behind a URL

```ts
import { resolveStripeInvoiceUrl } from "@financica/stripe-hosted-invoices";

const result = await resolveStripeInvoiceUrl(
	"https://invoice.stripe.com/i/acct_1ABC/live_XYZ",
);

if (!result.ok) {
	console.error(result.error); // { kind: "http_error", status: 404, url } etc.
	return;
}

result.invoice; // the invoice, money fields normalised
result.lines; // fully paginated — invoice.lines.data holds only the first page
result.creditNotes; // each with its own lines
result.receipt; // set only when the URL was a receipt URL
result.hostedData; // raw hosted-page payload: supplier country, support email
```

Accepted URL forms:

| Form                            | Example                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| Hosted invoice page             | `https://invoice.stripe.com/i/acct_…/live_…`                    |
| Pay / PDF link                  | `https://pay.stripe.com/invoice/acct_…/live_…`                  |
| Payment or refund receipt       | `https://pay.stripe.com/receipts/invoices/<token>`              |
| Dashboard receipt               | `https://dashboard.stripe.com/receipts/invoices/<token>`        |
| Any of the above, click-tracked | `https://58.email.stripe.com/CL0/https%3A%2F%2F…/1/<id>/<hmac>` |

A receipt URL is resolved by fetching the receipt page and following the hosted invoice link embedded in it, so the result always centres on the invoice, with the parsed receipt attached.

### Emailed links

Stripe's own billing emails are sent through SendGrid click tracking, so the link a user copies out of "Download invoice" is not a `stripe.com` URL at all — it is a tracking wrapper (`58.email.stripe.com/CL0/…`, though the subdomain and marker segment vary per sender) with the real URL percent-encoded inside one path segment. Users paste exactly that.

Nothing is matched on the wrapper's host or marker: any URL with an encoded target in its path unwraps, so other senders and ESPs work too.

Every parser unwraps these first, so it just works. `unwrapTrackedStripeUrl` is exported if you need it directly:

```ts
import { unwrapTrackedStripeUrl } from "@financica/stripe-hosted-invoices";

unwrapTrackedStripeUrl(pastedFromEmail); // → the canonical stripe.com URL
unwrapTrackedStripeUrl(alreadyClean); // → returned unchanged
```

It is total and idempotent: never throws, and malformed input comes back untouched.

**Unwrapping is not trusting.** The wrapper is attacker-controllable — a link whose encoded segment points at `evil.example.com` unwraps to exactly that. That is safe here only because the result feeds straight into the anchored `stripe.com` matchers, which reject it and fetch nothing. Decoding is done **locally and never by requesting the wrapper host**: an importer that followed redirects from a user-supplied host would be an SSRF vector, and fetching a tracking link marks the recipient's email as read. If you store the pasted URL, store the unwrapped one — a tracking wrapper is single-use noise.

### Detect a pasted link, in the browser

The URL matchers are pure and pull in no dependencies, so they are safe in a client bundle:

```ts
import {
	isStripeInvoiceUrl,
	parseStripeInvoiceUrl,
} from "@financica/stripe-hosted-invoices";

isStripeInvoiceUrl(text); // → boolean
parseStripeInvoiceUrl(url); // → { accountId, liveToken } | null
```

### Money

Stripe amounts are in minor units, and **Stripe's decimal classification is not ISO 4217**. Use these rather than an ISO table or `Intl`:

```ts
import {
	fromStripeMinorUnits,
	toStripeMinorUnits,
} from "@financica/stripe-hosted-invoices";

fromStripeMinorUnits(1234, "EUR"); // 12.34
fromStripeMinorUnits(500, "JPY"); // 500  — zero-decimal
fromStripeMinorUnits(500, "UGX"); // 5    — ISO says zero-decimal; Stripe does not
```

`UGX`, `ISK` and `HUF` all read as zero-decimal in ISO 4217 and `Intl`, but Stripe requires the two-decimal form. Following ISO on these is a factor-of-100 error on real money. Use [`@financica/iso4217`](../iso4217) for ledger rounding and this for anything crossing the Stripe boundary; they are not interchangeable.

### Refunds

A refunded invoice is the awkward case. After a post-payment refund the hosted invoice **still reports its original total and still says `paid`** — the refund exists only as a credit note, or, when the merchant refunded without issuing one, only as text on the receipt page.

So:

- `result.creditNotes` is the authoritative record when Stripe issued one.
- `result.receipt` carries the parsed receipt, including `kind: "refund"`, the refunded amount, the date, and the credited lines when they are printed.

```ts
if (result.receipt?.kind === "refund" && result.creditNotes.length === 0) {
	// Refunded without a credit note: the receipt is the only source.
	result.receipt.amount; // the refunded amount
	result.receipt.date; // "2025-01-08"
}
```

### Driving the steps yourself

`resolveStripeInvoiceUrl` is a convenience over parts you can use directly:

```ts
import {
	fetchStripeCreditNotes,
	fetchStripeHostedInvoice,
	fetchStripeHostedPage,
	fetchStripePdf,
	parseStripeInvoiceUrl,
} from "@financica/stripe-hosted-invoices";

const parts = parseStripeInvoiceUrl(url);
if (!parts) return;

const page = await fetchStripeHostedPage(parts);
if (!page.ok) return;

const { ephemeralKey, invoiceId } = page;
const invoice = await fetchStripeHostedInvoice({ invoiceId, ephemeralKey });
const creditNotes = await fetchStripeCreditNotes({ invoiceId, ephemeralKey });
```

### PDFs

Stripe's file URLs sometimes redirect to the PDF and sometimes return JSON naming the real file URL. `fetchStripePdf` follows either, and will not loop on a self-referential body:

```ts
const bytes = await fetchStripePdf(result.invoice.invoice_pdf); // Uint8Array | null
```

### Options

Both are optional and apply to every function:

```ts
await resolveStripeInvoiceUrl(url, {
	fetch: myFetch, // custom timeout, proxy, retry policy — defaults to global
	onWarning: (message, context) => log.warn(message, context),
});
```

`onWarning` reports degraded reads that are not failures: a truncated line list, a credit note that could not be parsed, a PDF that would not download. Wire it to your logger — silence here means a missing accounting document.

## Error model

Nothing throws. Failing calls return `{ ok: false, error }`:

| `kind`             | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `invalid_url`      | Not a Stripe hosted invoice or receipt URL                                |
| `network_error`    | `fetch` threw — DNS, TLS, timeout, offline (`cause` carries the original) |
| `http_error`       | Stripe answered with a non-OK status (`status`, `url`)                    |
| `invalid_response` | Stripe answered, but not in a shape this protocol can use (`detail`)      |

`fetchStripeCreditNotes` is the exception by design: it returns `[]` and warns rather than failing, because an invoice read that could not reach the credit-note endpoint is still a correct invoice read.

## Data shapes

The payload types are **permissive on purpose**: every field is optional, and unknown fields pass through rather than being stripped. The endpoints are undocumented and Stripe moves fields between nesting levels, so rejecting an unfamiliar shape would break imports for payloads that are merely new.

The one normalisation applied is money. Stripe sends documented-integer fields as decimal strings often enough — `unit_amount_excluding_tax`, every `*_decimal`, and in the wild `subtotal` and `total` on credit notes — that reading them with a `typeof === "number"` guard silently yields nothing. Every known money field is coerced to `number | null`.

**Treat `null` as "the payload did not say", never as zero.** A fabricated `0` on a tax field reads as "no VAT due".

## Limitations

- **Three-decimal currencies** (BHD, JOD, KWD, OMR, TND) are treated as two-decimal. The classification could not be confirmed against Stripe's published table.
- **Line pagination is capped** at 20 pages (2,000 lines). Hitting the cap fires `onWarning` and returns what was gathered.
- **Voided credit notes are excluded** (`status=issued`) — they were retracted and credited nothing.
- **The receipt parser is layout-dependent.** It reads Stripe's email-layout markup positionally, which is stable across the receipts Stripe renders today but is not a contract.

## Licence

MIT
