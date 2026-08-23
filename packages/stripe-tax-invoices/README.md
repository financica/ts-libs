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
invoice.totals; // { currency: "EUR", fees: 45.59, vat: 0 }

for (const section of invoice.sections) {
	section.currency; // "EUR"
	section.totals.total; // 45.59

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

It never throws.

### Errors

`parseStripeTaxInvoice` throws a `StripeTaxInvoiceParseError` (name set, fields `readonly`) carrying a `code` — `not_a_stripe_tax_invoice` when the document is not one, `missing_field` when it is but a required field could not be read — and `cause` when it wraps an underlying error. It throws rather than returning `null` for "not this document" because `isStripeTaxInvoice` is the cheap gate for format chaining; the thrown code distinguishes the two cases for callers that skip the gate. Failures inside the PDF reader (unpdf) are not wrapped.

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

**Fee sections** — one per transfer currency, normally one per page. An account settling in several currencies is billed per currency, and each currency gets its own table _and its own totals_. Nothing is summed across sections, because those amounts are not comparable; `invoice.totals` is the figure that spans them.

**Fee lines** — the description, the fee, and the tax on it. Descriptions are kept verbatim and do not identify a line: the same name can appear several times in one section, each covering a different group of payments. A fee can be negative (`Fee Adjustment`), and a footnote marker is part of the name as printed (`Refunded Fees †`), with the note itself in `invoice.footnotes`.

Where the invoice prints a description line, `volume` reads the count and gross volume out of it (`17 card payments totaling €1,882.76` → `{ count: 17, kind: "card payments", amount: 1882.76 }`). That is the only place the document states what was actually processed, and it is what lets a month's fees be tied back to the payments that produced them.

**Totals** — `Stripe Fees`, `Total VAT`, `Total`, `Debited from your Balance` and `Amount Due`. The balance row is kept with the sign it is printed with (negative), so `total + debitedFromBalance === amountDue` holds as arithmetic you can check against the paper.

## Invoices that span currencies

A section billed in a currency other than the one Stripe reports the invoice in restates its totals in a second column, under `in USD` / `in EUR` headings. Only the totals are restated; the fee lines stay in the section's own currency.

```ts
const [usd] = invoice.sections;

usd.currency; // "USD"
usd.totals.total; // 1.64
usd.convertedCurrency; // "EUR"
usd.convertedTotals.total; // 1.40

invoice.totals; // { currency: "EUR", fees: 10.75, vat: 0 }
invoice.exchangeRates; // [{ from: "USD", to: "EUR", rate: 0.8555883449056172 }]
invoice.exchangeRateBasis; // "derived from average rate for period"
```

`invoice.totals` comes from the `Total fees in EUR` rows the invoice prints under its last section. Those rows appear whenever anything had to be converted — including on a single-section invoice, when that one section is not in the reporting currency. Only an invoice with nothing to convert prints neither, and there the sole section's own totals are the invoice's.

## What varies between invoices

These invoices are consistent in structure and inconsistent in wording, so anything whose wording carries meaning is kept verbatim rather than reduced to a flag:

- **`settlementNote`** — what happened to the money. At least six wordings are in circulation, differing on singular/plural and on tense. When the total has not been debited yet the note says so in the future tense, and the `Debited from your Balance` and `Amount Due` rows are omitted entirely, leaving both `null`.
- **`reverseChargeNote`** — `Reverse Charge VAT may be applicable.` and `VAT reverse charge applies.` are both in use. Note that the legal paragraph at the foot of _every_ invoice mentions reverse charge whether or not the note applies, so a text search is not a test of it; this reads the note's own position beside the customer block.
- **Fee descriptions** — mostly fee categories (`Stripe Processing Fees`, `Tax Product Fees`, `Billing - Usage Fee`, `Transfer Fees`, `Payout Fees`), but a product name is also possible (`Card payments - Stripe fee`).
- **Column labels** — a narrow converted column wraps `Debited from your Balance` onto two rows, with the amount on the first.

## Limits

- **English only.** Stripe issues these in English whatever the customer's country, and the amounts are formatted US-style (`€1,242.00`). A European-formatted amount is rejected rather than guessed at, because reading `1.242,00` as `1.242` would be a hundred-fold error.
- **Amounts are numbers, not minor units.** Convert before you do money arithmetic on them.
- **Verified against 78 real invoices** from five Stripe accounts, spanning Aug 2021 to Jul 2026, single- and multi-page, EUR and USD — all issued by Stripe Payments Europe, Limited. On every one, the fee lines sum to `Stripe Fees`, `Total` equals fees plus VAT, `Amount Due` equals `Total` plus the debited amount, each converted total matches the printed exchange rate, and the invoice total matches the sum of its sections. The parser keys off the document's structure rather than the entity, so invoices from Stripe's other entities should read the same way, but that is untested.

## License

MIT
