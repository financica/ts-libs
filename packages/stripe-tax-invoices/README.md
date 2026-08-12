# @financica/stripe-tax-invoices

Parser for the **Stripe tax invoice** — the monthly invoice for Stripe's own fees, and the tax on them.

This is not an invoice you issued. It is the one Stripe issues to you: what it charged for processing, billing, invoicing and the rest over a service month, which entity charged it, and under which tax registration. In the EU it carries the reverse-charge note, which makes the fees yours to account for.

There is **no API for it.** Stripe's API will tell you the fee on any one balance transaction, but the tax invoice itself — its number, the issuing entity's VAT number, the fee breakdown, the tax treatment — exists only as a PDF you download by hand from the Dashboard, under Settings › Plans and fees › Invoice history. That gap is what this package fills.

```
Stripe Tax Invoice (PDF)
           │
           ▼
  @financica/stripe-tax-invoices ──▶ identity + parties + fee lines + totals
```

For invoices you issued _through_ Stripe, see [`@financica/stripe-hosted-invoices`](../stripe-hosted-invoices) and [`@financica/stripe-ubl`](../stripe-ubl).

## Installation

```bash
npm install @financica/stripe-tax-invoices
```

One runtime dependency (`unpdf`, for text extraction). Requires Node ≥ 24.

## Usage

```ts
import { parseStripeTaxInvoice } from "@financica/stripe-tax-invoices";

const invoice = await parseStripeTaxInvoice(await file.arrayBuffer());

invoice.invoiceNumber; // "BQCMEBS7-2025-08"
invoice.accountId; // "acct_1RayACDEBQCMEBs7"
invoice.serviceMonth; // "2025-08"
invoice.supplier.taxNumber; // "IE 3206488LH"
invoice.reverseCharge; // true

for (const section of invoice.sections) {
	section.currency; // "EUR"
	section.total; // 45.59

	for (const line of section.lines) {
		line.description; // "Stripe Processing Fees"
		line.feeAmount; // 40.62
		line.volume; // { count: 1, kind: "other payment", amount: 1242 }
	}
}
```

### Detecting the format first

`isStripeTaxInvoice` reads the PDF but does none of the table work, so it is cheap enough to sit in front of a multi-format importer.

```ts
import { isStripeTaxInvoice } from "@financica/stripe-tax-invoices";

if (await isStripeTaxInvoice(bytes)) {
	// …
}
```

It never throws. `parseStripeTaxInvoice` throws a `StripeTaxInvoiceParseError` carrying a `code` — `not_a_stripe_tax_invoice` or `missing_field`.

### Bringing your own text

If the PDF has already been through your own pipeline, hand the positioned text over directly. Rows must be grouped **per page** and concatenated in page order, because Y coordinates restart on each page; `groupIntoRows` does that grouping.

```ts
import {
	groupIntoRows,
	parseStripeTaxInvoiceRows,
} from "@financica/stripe-tax-invoices";

const invoice = parseStripeTaxInvoiceRows(items, pages.flatMap(groupIntoRows));
```

## What it reads

**Identity** — invoice number, Stripe account id, invoice date, service month. All four are required; a document missing any of them is a parse failure, not a half-read invoice.

**Parties** — the issuing Stripe entity and the billed business, each with its name, address lines, and the tax registration printed for it. Which registration appears depends on the entity and on where you are registered (`Stripe VAT Number` in the EU, `Stripe GST Number` elsewhere), so `taxNumberLabel` reports the label the invoice used rather than assuming one.

**Fee sections** — one per transfer currency. An account settling in several currencies is billed per currency, and each currency gets its own table _and its own totals_. Nothing is summed across sections, because those amounts are not comparable.

**Fee lines** — the description, the fee, and the tax on it. Where the invoice prints a description line, `volume` reads the payment count and gross volume out of it (`17 card payments totaling €1,882.76` → `{ count: 17, kind: "card payments", amount: 1882.76 }`). That is the only place the document states what was actually processed, and it is what lets a month's fees be tied back to the payments that produced them.

**Totals** — `Stripe Fees`, `Total VAT`, `Total`, `Debited from your Balance` and `Amount Due`. The balance row is kept with the sign it is printed with (negative), so `total + debitedFromBalance === amountDue` holds as arithmetic you can check against the paper.

## The two layouts

Stripe changed the fee table in mid-2026, and both forms are still in circulation:

|                  | until mid-2026                                         | from mid-2026                              |
| ---------------- | ------------------------------------------------------ | ------------------------------------------ |
| Line description | a fee category — `Stripe Processing Fees`, `Invoicing` | the product — `Card payments - Stripe fee` |
| Description line | yes, with the payment count and volume                 | none                                       |
| Balance rows     | `Debited from your Balance` and `Amount Due`           | prose instead; both `null`                 |

Nothing needs to be told which one it is reading. The difference shows up in the parsed invoice as `volume` and the balance fields being present or `null`.

## Limits

- **English only.** Stripe issues these in English whatever the customer's country, and the amounts are formatted US-style (`€1,242.00`). A European-formatted amount is rejected rather than guessed at, because reading `1.242,00` as `1.242` would be a hundred-fold error.
- **Amounts are numbers, not minor units.** Convert before you do money arithmetic on them.
- **Verified against EU invoices** from Stripe Payments Europe, Limited. The parser keys off the document's structure rather than the entity, so invoices from Stripe's other entities should read the same way, but that is untested.

## License

MIT
