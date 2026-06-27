# @financica/ubl

TypeScript toolkit for [UBL (Universal Business Language)](https://www.oasis-open.org/committees/ubl/) invoice XML documents. Parses UBL 2.1 Invoice and CreditNote documents into typed objects, with an optional normalization layer that produces a flat DTO suitable for database storage or API responses, and builds Peppol BIS Billing 3.0 documents from a vendor-neutral model.

The package is split into two entry points:

- `@financica/ubl` — the parse side: read UBL XML into typed objects (`parseUblInvoice`, `normalizeUblResponse`, MLR parsing).
- `@financica/ubl/build` — the build side: assemble a `UblDocument` and serialize it to Peppol BIS Billing 3.0 XML.

## Installation

```bash
npm install @financica/ubl
```

## Usage

### Parse UBL XML

```typescript
import { parseUblInvoice } from "@financica/ubl";

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
import { normalizeUblResponse } from "@financica/ubl";

const { extracted, rawPayload } = normalizeUblResponse(xml, "doc-123");
// extracted.invoice.invoice_number => "INV-001"
// extracted.invoice.supplier.name => "Acme BV"
// extracted.line_items[0].tax_rate => 21
```

### Parse from raw bytes

```typescript
import { parseUblInvoiceDocument } from "@financica/ubl";

const result = parseUblInvoiceDocument({
	bytes: new Uint8Array(buffer),
	documentId: "doc-123",
	mimeType: "application/xml",
});
```

Handles UTF-8 BOM stripping automatically.

### Build UBL XML

Construct a `UblDocument` — a thin, vendor-neutral mirror of the Peppol BIS
Billing 3.0 fields — and serialize it with `serializeUblDocument`. Builders and
helpers for parties, tax totals, identifiers, and attachments are exported from
the same subpath.

```typescript
import { serializeUblDocument, type UblDocument } from "@financica/ubl/build";

const doc: UblDocument = {
	documentType: "invoice",
	id: "INV-001",
	issueDate: "2026-01-15",
	dueDate: "2026-02-14",
	note: null,
	currency: "EUR",
	buyerReference: null,
	precedingInvoiceId: null,
	supplier: {
		endpoint: { scheme: "0208", value: "0800279001" },
		name: "Acme BV",
		legalName: "Acme BV",
		vatNumber: "BE0800279001",
		companyId: { value: "0800279001", scheme: "0208" },
		address: {
			street: "Rue de la Loi 1",
			additionalStreet: null,
			city: "Brussels",
			postalZone: "1000",
			countrySubentity: null,
			countryCode: "BE",
		},
	},
	customer: {
		endpoint: { scheme: "0208", value: "0123456789" },
		name: "Globex SA",
		legalName: "Globex SA",
		vatNumber: "BE0123456789",
		companyId: { value: "0123456789", scheme: "0208" },
		address: {
			street: "Avenue Louise 50",
			additionalStreet: null,
			city: "Brussels",
			postalZone: "1050",
			countrySubentity: null,
			countryCode: "BE",
		},
	},
	lines: [
		{
			id: "1",
			name: "Consulting services",
			quantity: 1,
			unitCode: "C62",
			lineExtensionAmount: 100,
			priceAmount: 100,
			taxCategory: { id: "S", percent: 21 },
		},
	],
	taxTotal: {
		taxAmount: 21,
		subtotals: [
			{ taxableAmount: 100, taxAmount: 21, category: { id: "S", percent: 21 } },
		],
	},
	monetaryTotal: {
		lineExtensionAmount: 100,
		taxExclusiveAmount: 100,
		taxInclusiveAmount: 121,
		payableAmount: 121,
	},
	attachments: [],
};

const xml = serializeUblDocument(doc);
```

Set `documentType: "creditNote"` (with `precedingInvoiceId` referencing the
original invoice) to emit a `CreditNote` instead. The build subpath also exports
helpers such as `buildSupplierParty`, `buildTaxTotals`, `buildCompanyId`,
`buildPdfAttachment`, and Peppol identifier utilities (`resolveVatEndpoint`,
`parsePeppolEndpoint`, `listPeppolReceiverIdentifierCandidates`).

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
