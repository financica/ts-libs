# @ingram-tech/ubl

TypeScript parser for [UBL (Universal Business Language)](https://www.oasis-open.org/committees/ubl/) invoice XML documents. Parses UBL 2.1 Invoice and CreditNote documents into typed objects, with an optional normalization layer that produces a flat DTO suitable for database storage or API responses.

## Installation

```bash
npm install @ingram-tech/ubl
```

## Usage

### Parse UBL XML

```typescript
import { parseUblInvoice } from "@ingram-tech/ubl";

const xml = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ...>
  <cbc:ID>INV-001</cbc:ID>
  ...
</Invoice>`;

const invoice = parseUblInvoice(xml);
// invoice.id => "INV-001"
// invoice.seller.name => "Acme BV"
// invoice.lines[0].description => "Consulting services"
// invoice.monetaryTotal.payableAmount => 121
```

Returns a typed `UblInvoice` object, or `null` if the XML is not a valid UBL Invoice/CreditNote.

### Normalize to DTO

```typescript
import { normalizeUblResponse } from "@ingram-tech/ubl";

const { extracted, rawPayload } = normalizeUblResponse(xml, "doc-123");
// extracted.invoice.invoice_number => "INV-001"
// extracted.invoice.supplier.name => "Acme BV"
// extracted.line_items[0].tax_rate => 21
```

### Parse from raw bytes

```typescript
import { parseUblInvoiceDocument } from "@ingram-tech/ubl";

const result = parseUblInvoiceDocument({
	bytes: new Uint8Array(buffer),
	documentId: "doc-123",
	mimeType: "application/xml",
});
```

Handles UTF-8 BOM stripping automatically.

## Supported document types

- UBL 2.1 Invoice
- UBL 2.1 CreditNote

## Parsed fields

Parties (seller/buyer), addresses, contacts, endpoint IDs, line items with quantities/prices/tax, allowance/charge at both header and line level, tax subtotals, monetary totals, payment means (including multiple), payment terms, invoice period, delivery information, order/contract/project references, notes, and embedded attachments.

## Development

```bash
npm test          # run tests in watch mode
npm run test:run  # run tests once
npm run lint      # eslint
npm run format    # prettier
npm run build     # build to dist/
npm run ci        # type-check + lint + test + build
```
