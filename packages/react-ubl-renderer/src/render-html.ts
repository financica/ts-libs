import type { UblInvoice as UblInvoiceData } from "@financica/ubl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ublInvoiceCss } from "./styles";
import { UblInvoice } from "./ubl-invoice";

export type RenderUblInvoiceHtmlOptions = {
	/** Locale for currency formatting. Defaults to `en-US`. */
	locale?: string;
};

const escapeHtml = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Page chrome for the standalone document. The invoice itself is fully styled
// by ublInvoiceCss; this only paints the surrounding page.
const PAGE_CSS = `
body {
	margin: 0;
	padding: 24px;
	background: radial-gradient(1200px 400px at 15% -10%, #e7efff, transparent), #f6f8fb;
}
`;

/**
 * Render a parsed UBL invoice to a standalone, self-contained HTML document
 * string (styles inlined). Useful for emails, PDF generation, or serving the
 * preview outside React. For in-app React rendering, use {@link UblInvoice}.
 */
export const renderUblInvoiceHtml = (
	invoice: UblInvoiceData,
	options: RenderUblInvoiceHtmlOptions = {},
): string => {
	const body = renderToStaticMarkup(
		createElement(UblInvoice, { invoice, locale: options.locale }),
	);
	const label = invoice.documentType === "CreditNote" ? "Credit Note" : "Invoice";
	const title = `${label} ${invoice.id || ""}`.trim();
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}${ublInvoiceCss}</style>
</head>
<body>${body}</body>
</html>`;
};
