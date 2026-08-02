// Re-exported from `@financica/ubl` so consumers have a single import surface.
// The component below owns the `UblInvoice` name for the value; the data type is
// re-exported as `UblInvoiceData` to avoid the collision.
export { parseUblInvoice, type UblInvoice as UblInvoiceData } from "@financica/ubl";
export { type RenderUblInvoiceHtmlOptions, renderUblInvoiceHtml } from "./render-html";
export { ublInvoiceCss } from "./styles";
export { UblInvoice, type UblInvoiceProps } from "./ubl-invoice";
