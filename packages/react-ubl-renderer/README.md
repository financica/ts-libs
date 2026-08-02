# @financica/react-ubl-renderer

Render a parsed UBL / Peppol BIS Billing 3.0 invoice as a React component or a
standalone HTML document.

Give it raw UBL XML (or a `UblInvoice` object already parsed by
[`@financica/ubl`](https://www.npmjs.com/package/@financica/ubl)) and it renders
a polished, human-readable invoice: header,
supplier/receiver details, line items, VAT breakdown, totals, and payment
information. All text is escaped; the markup is scoped under a single
`.ubl-invoice` class so it never collides with your app's CSS.

## Install

```sh
npm install @financica/react-ubl-renderer @financica/ubl react react-dom
```

`@financica/ubl` (the parser), `react`, and `react-dom` (>=18) are peer
dependencies — the renderer binds to the single copy your app installs, so the
parsed `UblInvoice` type can never go out of sync. Modern package managers
install peers automatically; the line above is explicit for clarity.

## Usage

### React component

Pass it the raw XML — it parses internally:

```tsx
import { UblInvoice } from "@financica/react-ubl-renderer";
import "@financica/react-ubl-renderer/styles.css";

export function InvoicePreview({ xml }: { xml: string }) {
	return <UblInvoice xml={xml} fallback={<p>Could not read invoice.</p>} />;
}
```

Props:

- `xml: string` **or** `invoice: UblInvoiceData` (one of the two is required)
- `locale?: string` — currency formatting, defaults to `en-US`
- `className?: string` — appended to the `.ubl-invoice` root
- `fallback?: React.ReactNode` — rendered when `xml` fails to parse (default `null`)

### Standalone HTML (email, PDF, non-React)

```ts
import { renderUblInvoiceHtml } from "@financica/react-ubl-renderer";

const html = renderUblInvoiceHtml(xml);
// -> a complete, self-contained <!doctype html> document with styles inlined
// Throws if the XML cannot be parsed.
```

The raw stylesheet is also exported as `ublInvoiceCss` if you need to inline it
yourself.

### Advanced: render a pre-parsed invoice

If you already have a parsed invoice — or want to inspect, transform, or
validate it before rendering — pass `invoice` instead of `xml`. The parser and
its type are re-exported, so you never need a separate import:

```tsx
import { parseUblInvoice, UblInvoice } from "@financica/react-ubl-renderer";
import type { UblInvoiceData } from "@financica/react-ubl-renderer";

const invoice = parseUblInvoice(xml); // UblInvoiceData | null
if (invoice) {
	// ...inspect or transform...
	return <UblInvoice invoice={invoice} />;
}
```

The same `invoice` overload is available on `renderUblInvoiceHtml(invoice)`.

## License

MIT
