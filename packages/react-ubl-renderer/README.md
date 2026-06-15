# @financica/react-ubl-renderer

Render a parsed UBL / Peppol BIS Billing 3.0 invoice as a React component or a
standalone HTML document.

It takes the `UblInvoice` object produced by
[`@financica/ubl`](https://www.npmjs.com/package/@financica/ubl)'s
`parseUblInvoice` and renders a polished, human-readable invoice: header,
supplier/receiver details, line items, VAT breakdown, totals, and payment
information. All text is escaped; the markup is scoped under a single
`.ubl-invoice` class so it never collides with your app's CSS.

## Install

```sh
npm install @financica/react-ubl-renderer @financica/ubl
```

`react` and `react-dom` (>=18) are peer dependencies.

## Usage

### React component

```tsx
import { parseUblInvoice } from "@financica/ubl";
import { UblInvoice } from "@financica/react-ubl-renderer";
import "@financica/react-ubl-renderer/styles.css";

const invoice = parseUblInvoice(xml);

export function InvoicePreview({ xml }: { xml: string }) {
	const invoice = parseUblInvoice(xml);
	return invoice ? <UblInvoice invoice={invoice} /> : null;
}
```

Props: `invoice: UblInvoice` (required), `locale?: string` (currency
formatting, defaults to `en-US`), `className?: string` (appended to the root).

### Standalone HTML (email, PDF, non-React)

```ts
import { parseUblInvoice } from "@financica/ubl";
import { renderUblInvoiceHtml } from "@financica/react-ubl-renderer";

const html = renderUblInvoiceHtml(parseUblInvoice(xml));
// -> a complete, self-contained <!doctype html> document with styles inlined
```

The raw stylesheet is also exported as `ublInvoiceCss` if you need to inline it
yourself.

## License

MIT
