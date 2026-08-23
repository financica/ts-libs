/**
 * Root entry point (`@financica/facturx`): the data model, code lists,
 * country/currency tables, numeric helpers, profiles and totals calculator.
 * The heavier operations live behind subpath exports so their dependencies
 * are only loaded when used:
 * - `@financica/facturx/parse`    — CII XML → FacturXInvoice
 * - `@financica/facturx/generate` — FacturXInvoice → CII XML
 * - `@financica/facturx/pdf`      — embed the XML into a PDF/A-3 document
 * - `@financica/facturx/render`   — render an invoice PDF from the model
 */
export * from "./codes.js";
export * from "./countries.js";
export * from "./currencies.js";
export * from "./model.js";
export * from "./numeric.js";
export * from "./profiles.js";
export * from "./totals.js";
