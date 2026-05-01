# @financica/scrada-stripe

Convert Stripe invoices and credit notes into [Scrada](https://www.scrada.be/) Peppol invoice payloads, ready to POST to the `peppol/outbound/salesInvoice` endpoint exposed by [`@financica/scrada-client`](../scrada-client).

This is the canonical **"I have a Stripe invoice, I want to send it via Peppol"** code path, extracted from the Peppost codebase so Financica and Peppost stay in lockstep.

## Installation

```bash
npm install @financica/scrada-stripe @financica/scrada-client stripe
```

`stripe` is a peer dependency — install whichever Stripe SDK version your app already uses (≥18).

## Usage

### Sending a Stripe invoice via Peppol

```ts
import Stripe from "stripe";
import {
    ScradaApiClient,
    SCRADA_ATTACHMENT_FILE_TYPE_INVOICE,
} from "@financica/scrada-client";
import {
    buildPdfAttachment,
    buildScradaInvoiceFromStripeInvoice,
    type ScradaSupplier,
} from "@financica/scrada-stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const scrada = new ScradaApiClient({
    apiKey: process.env.SCRADA_API_KEY!,
    password: process.env.SCRADA_PASSWORD!,
});

// 1. Retrieve the invoice with the right `expand` so per-line VAT info is
//    available under either the legacy `tax_amounts` or the newer `taxes` shape.
const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: [
        "lines.data.tax_amounts.tax_rate",
        "lines.data.taxes.tax_rate_details.tax_rate",
    ],
});

// 2. Resolve the supplier from your own data store.
const supplier: ScradaSupplier = {
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

// 4. Build the payload and send it.
const payload = buildScradaInvoiceFromStripeInvoice({
    invoice,
    supplier,
    attachment,
});
const documentId = await scrada.sendOutboundSalesInvoice(scradaCompanyId, payload);
```

### Sending a Stripe credit note

Credit notes don't carry the customer party themselves — they reference the original invoice. Pass both:

```ts
import { buildScradaCreditInvoiceFromStripeCreditNote } from "@financica/scrada-stripe";

const creditNote = await stripe.creditNotes.retrieve(creditNoteId, {
    expand: [
        "invoice.customer",
        "lines.data.taxes.tax_rate_details.tax_rate",
    ],
});

const invoice =
    typeof creditNote.invoice === "string"
        ? await stripe.invoices.retrieve(creditNote.invoice)
        : creditNote.invoice;

const payload = buildScradaCreditInvoiceFromStripeCreditNote({
    creditNote,
    invoice,
    supplier,
});
const documentId = await scrada.sendOutboundSalesInvoice(scradaCompanyId, payload);
```

## What gets reconciled

Stripe sometimes reports per-line tax differently from the document header (rounding, distributed coupons, prorations). This library reconciles those automatically:

- **`totalExclVat`** is taken from `invoice.total_excluding_tax` and any sub-cent difference vs. `sum(line.totalExclVat)` is pushed into the largest VAT-rate group.
- **`totalVat`** is derived as `invoice.total - invoice.total_excluding_tax` and any sub-cent difference vs. `sum(line.totalExclVat * vatPercentage / 100)` is pushed into the largest group.
- **Per-line VAT** falls back from `tax_amounts` to `taxes` when only the newer shape is populated, so the rate isn't silently lost on accounts mid-migration.
- **Fully-discounted lines** read the rate from the expanded `tax_rate.percentage` so a 100%-discounted standard-rated line stays vatType 1 instead of collapsing to vatType 2.

## `vatStatus` matters

The Peppol-only invoice party schema requires (or strongly expects) a `vatStatus` on the supplier:

| Value | Meaning |
| --- | --- |
| `1` | Subject to VAT — charges and remits VAT (the normal case) |
| `2` | Not subject to VAT — no VAT registration |
| `3` | Small business / franchise exemption (e.g. Belgian Article 56bis kleine onderneming) — has a VAT number but is exempt |

Without an explicit `vatStatus`, Scrada treats the supplier as non-VAT-collecting and rejects any non-zero VAT line with `"VAT difference left for 0% VAT"`. The library always sends what the caller passes in `supplier.vatStatus`, so resolve it once on your account row and pass it through.

## Surface

```ts
// Top-level builders
buildScradaInvoiceFromStripeInvoice(params)
buildScradaCreditInvoiceFromStripeCreditNote(params)

// Party builders
buildSupplierParty(supplier)
buildCustomerPartyFromStripeInvoice(invoice)

// Identifiers
extractCustomerTaxIdentifiers(stripeTaxIds)
listPeppolReceiverIdentifierCandidates(customer)
normalizeCompanyNumberForCountry(country, number)
resolveTaxNumberType({ countryCode, taxNumber })

// Lower-level reusable pieces
buildInvoiceLines(invoice)
buildCreditNoteLines(creditNote, fallbackName)
buildVatTotals(lines, authoritativeExclVat?, authoritativeVat?)
getInvoiceLineTaxAmounts(line)
getCreditNoteLineTaxAmounts(line)
getInvoiceLineDiscountAmountCents(line)
resolveVatTypeFromTaxAmounts(taxAmounts, rate)
vatTypeFromCategoryOrRate({ taxCategoryId, taxExemptionReason, rate })

// Address + attachment
normalizeAddress(address, fallbackCountryCode, fallbackLine?)
buildPdfAttachment({ filename, bytes, externalReference? })
sanitizeScradaPayloadForAudit(payload) // redacts attachment base64Data

// Numeric helpers
roundCurrency(value)
centsToDecimal(cents)
```

## License

MIT
