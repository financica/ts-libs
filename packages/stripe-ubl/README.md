# @financica/stripe-ubl

Convert Stripe invoices and credit notes into [Peppol BIS Billing 3.0](https://docs.peppol.eu/poacc/billing/3.0/) **UBL** documents.

This is the vendor-neutral glue between Stripe's data model and the Peppol standard: it turns a `Stripe.Invoice` or `Stripe.CreditNote` into a conformant UBL XML string. It does **not** talk to any access point — hand the XML to whichever Peppol access point you use (e.g. [`@financica/scrada-client`](../scrada-client)'s `sendOutboundDocument`). Because the output is standard UBL rather than a vendor's proprietary JSON, swapping access points is a transport change, not a rewrite.

```
Stripe.Invoice ──@financica/stripe-ubl──▶ UBL (BIS3 XML) ──any access point──▶ Peppol
```

For the reverse direction (parsing inbound UBL), see [`@financica/ubl`](https://www.npmjs.com/package/@financica/ubl). That package is pure UBL; this one is the Stripe-specific glue.

## Installation

```bash
npm install @financica/stripe-ubl stripe
```

`stripe` is a peer dependency — install whichever Stripe SDK version your app already uses (≥18). There are no runtime dependencies; the UBL serializer is self-contained.

## Usage

### Sending a Stripe invoice via Peppol

```ts
import Stripe from "stripe";
import {
	buildUblInvoiceFromStripeInvoice,
	buildPdfAttachment,
	type UblSupplier,
} from "@financica/stripe-ubl";
import { ScradaApiClient } from "@financica/scrada-client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// 1. Retrieve the invoice with the right `expand` so per-line VAT info is
//    available under either the legacy `tax_amounts` or the newer `taxes` shape.
const invoice = await stripe.invoices.retrieve(invoiceId, {
	expand: [
		"lines.data.tax_amounts.tax_rate",
		"lines.data.taxes.tax_rate_details.tax_rate",
	],
});

// 2. Resolve the supplier from your own data store.
const supplier: UblSupplier = {
	name: "Acme BE",
	countryCode: "BE",
	address: {
		line1: "Rue de la Loi 16",
		city: "Brussels",
		postal_code: "1000",
		country: "BE",
	},
	companyNumber: "0800279001",
	vatNumber: "BE0800279001",
	vatStatus: 1, // 1 = Subject to VAT, 2 = Not subject, 3 = Small business / franchise
	peppolID: "0208:0800279001",
};

// 3. Optionally embed the rendered PDF.
const pdf = await fetch(invoice.invoice_pdf!).then((r) => r.arrayBuffer());
const attachment = buildPdfAttachment({
	filename: `${invoice.number}.pdf`,
	bytes: new Uint8Array(pdf),
});

// 4. Build the UBL and hand it to your access point.
const ubl = buildUblInvoiceFromStripeInvoice({ invoice, supplier, attachment });

const scrada = new ScradaApiClient({
	apiKey: process.env.SCRADA_API_KEY!,
	password: process.env.SCRADA_PASSWORD!,
});
const documentId = await scrada.sendOutboundDocument(scradaCompanyId, ubl, {
	idempotencyKey: invoice.id,
});
```

### Sending a Stripe credit note

Credit notes don't carry the customer party themselves — they reference the original invoice. Pass both; the parent invoice number is emitted as the `cac:BillingReference` (BT-25).

```ts
import { buildUblCreditNoteFromStripeCreditNote } from "@financica/stripe-ubl";

const creditNote = await stripe.creditNotes.retrieve(creditNoteId, {
	expand: ["invoice.customer", "lines.data.taxes.tax_rate_details.tax_rate"],
});
const invoice =
	typeof creditNote.invoice === "string"
		? await stripe.invoices.retrieve(creditNote.invoice)
		: creditNote.invoice;

const ubl = buildUblCreditNoteFromStripeCreditNote({ creditNote, invoice, supplier });
```

### Building the model without serializing

`buildUblInvoiceFromStripeInvoice` is `serializeUblDocument(buildUblInvoiceDocument(...))`. Use the document builder when you want to inspect or tweak the model before serializing:

```ts
import {
	buildUblInvoiceDocument,
	serializeUblDocument,
	sanitizeUblDocumentForAudit,
} from "@financica/stripe-ubl";

const doc = buildUblInvoiceDocument({ invoice, supplier });
auditLog(sanitizeUblDocumentForAudit(doc)); // redacts attachment base64
const ubl = serializeUblDocument(doc);
```

## What gets reconciled

Stripe sometimes reports per-line tax differently from the document header (rounding, distributed coupons, prorations). This library reconciles those into a UBL document that is internally consistent and EN 16931-conformant:

- **Line nets** are reconciled against Stripe's authoritative `total_excluding_tax`; any sub-cent difference is pushed into the largest line (BR-CO-13 / BR-S-08 stay consistent bottom-up).
- **The VAT breakdown** is grouped by `(category, rate)`, and each category's tax amount is **derived** as `taxable × rate / 100` rounded to two decimals (**BR-CO-17**) — not summed from upstream tax cents. This can differ by a cent from the figure Stripe reported, which is an unavoidable artifact of representing a cents-rounded system as a rate-based VAT breakdown; the resulting document validates.
- **Per-line VAT** falls back from `tax_amounts` to `taxes` when only the newer shape is populated, so the rate isn't silently lost on accounts mid-migration.
- **Discounted lines** use the post-discount net as both the VAT base and the line net, so a discounted standard-rated line keeps its true rate (e.g. 21%, not 14.70%). Line discounts are folded into the net rather than emitted as a `cac:AllowanceCharge`.
- **Fully-discounted lines** read the rate from the expanded `tax_rate.percentage` so a 100%-discounted standard-rated line stays category `S` instead of collapsing to zero-rated.

## VAT categories & `vatStatus`

Lines are classified into UNCL5305 VAT categories from the Stripe tax data:

| Category | Meaning | From |
| --- | --- | --- |
| `S`  | Standard rate | a positive rate |
| `Z`  | Zero-rated | rate 0 / `zero_rated` |
| `E`  | Exempt | `customer_exempt`, `product_exempt`, `not_subject_to_tax`, … |
| `AE` | Reverse charge | `reverse_charge` |

EN 16931 requires an exemption reason on the non-`S`/`Z` categories, which the library fills in automatically.

`supplier.vatStatus` covers the seller side:

| Value | Meaning |
| --- | --- |
| `1` | Subject to VAT — line categories come from the data (the normal case) |
| `2` | Not subject to VAT |
| `3` | Small business / franchise (e.g. Belgian Article 56bis) |

For `2` and `3`, every line is coerced to category `E` with an appropriate exemption reason so no VAT is reported.

## Surface

```ts
// High-level (Stripe → UBL XML string)
buildUblInvoiceFromStripeInvoice(params): string
buildUblCreditNoteFromStripeCreditNote(params): string

// Mid-level (Stripe → UblDocument model)
buildUblInvoiceDocument(params): UblDocument
buildUblCreditNoteDocument(params): UblDocument

// Serializer (UblDocument → XML) + audit helper
serializeUblDocument(doc): string
sanitizeUblDocumentForAudit(doc): UblDocument

// Party builders
buildSupplierParty(supplier): UblParty
buildCustomerPartyFromStripeInvoice(invoice): { customer, customerName }

// Lines, VAT breakdown, reconciliation
buildInvoiceLines(invoice) / buildCreditNoteLines(creditNote, fallbackName)
buildTaxTotals(lines) / reconcileLinesToExclTotal(lines, authoritativeExclVat)
resolveTaxCategoryFromTaxAmounts(taxAmounts, rate)
taxCategoryFromReasonOrRate({ taxCategoryId?, taxabilityReason, rate })

// Stripe tax extraction
getInvoiceLineTaxAmounts(line) / getCreditNoteLineTaxAmounts(line)
getInvoiceLineDiscountAmountCents(line)

// Identifiers + address + attachment
extractCustomerTaxIdentifiers(stripeTaxIds)
listPeppolReceiverIdentifierCandidates(customer)
normalizeCompanyNumberForCountry(country, number)
resolveCompanyIdScheme({ countryCode, companyNumber })
parsePeppolEndpoint("0208:0800279001")
normalizeAddress(address, fallbackCountryCode, fallbackLine?)
buildPdfAttachment({ filename, bytes, id? })

// Low-level XML primitives + UBL constants
el / serializeDocument
UBL_CUSTOMIZATION_ID, UBL_PROFILE_ID, INVOICE_TYPE_CODE, …
```

## Conformance

The output targets EN 16931 + Peppol BIS Billing 3.0 and is built to satisfy the calculation rules (BR-CO-10/13/15/17, BR-S-08, …). It is **not yet wired to the official EN 16931 / Peppol schematron** — if you depend on guaranteed conformance, validate the emitted XML against the published schematron in CI (and your access point will validate on ingest). Some optional constructs (line-level `AllowanceCharge`, `PaymentMeans`, prepaid amounts) are intentionally not emitted yet.

## License

MIT
