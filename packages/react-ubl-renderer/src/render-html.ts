import {
	parseUblInvoice,
	type UblInvoice as UblInvoiceData,
	UblParseError,
} from "@financica/ubl";
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
 * Render a UBL invoice to a standalone, self-contained HTML document string
 * (styles inlined). Accepts raw `xml` (parsed internally) or a pre-parsed
 * invoice object. Useful for emails, PDF generation, or serving the preview
 * outside React. For in-app React rendering, use {@link UblInvoice}.
 *
 * @throws {UblParseError} when `input` is XML that is malformed, not a UBL
 * invoice, or lacks a mandatory element.
 */
export const renderUblInvoiceHtml = (
	input: string | UblInvoiceData,
	options: RenderUblInvoiceHtmlOptions = {},
): string => {
	const invoice = typeof input === "string" ? parseUblInvoice(input) : input;
	if (!invoice) {
		throw new UblParseError("Document is not a UBL Invoice or CreditNote");
	}
	const body = renderToStaticMarkup(
		createElement(UblInvoice, {
			invoice,
			...(options.locale !== undefined ? { locale: options.locale } : {}),
		}),
	);
	const label = invoice.documentType === "CreditNote" ? "Credit Note" : "Invoice";
	const title = `${label} ${invoice.id}`;
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
