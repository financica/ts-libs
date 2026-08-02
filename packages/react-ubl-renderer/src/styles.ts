/**
 * Styles for {@link UblInvoice}, scoped entirely under the `.ubl-invoice` root
 * class so they neither leak into nor inherit from a host application's CSS.
 * Every element we render has an explicit rule, so a host reset (e.g. Tailwind
 * preflight, which zeroes heading/table margins via low-specificity selectors)
 * cannot strip our layout.
 *
 * Shipped three ways from this single source: exported as a string, written to
 * `dist/styles.css` for `import "@financica/react-ubl-renderer/styles.css"`, and
 * inlined into the document returned by `renderUblInvoiceHtml`.
 */
export const ublInvoiceCss = `
.ubl-invoice {
	--ubl-card: #ffffff;
	--ubl-ink: #0f172a;
	--ubl-muted: #475569;
	--ubl-line: #dbe3ef;
	--ubl-brand: #0b5fff;
	box-sizing: border-box;
	max-width: 1000px;
	margin: 0 auto;
	padding: 28px;
	background: var(--ubl-card);
	border: 1px solid var(--ubl-line);
	border-radius: 16px;
	box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
	color: var(--ubl-ink);
	font-family: "Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif;
	font-size: 14px;
	line-height: 1.4;
	text-align: left;
}
.ubl-invoice *,
.ubl-invoice *::before,
.ubl-invoice *::after { box-sizing: border-box; }
.ubl-invoice .ubl-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 24px;
	margin-bottom: 20px;
}
.ubl-invoice h1 {
	margin: 0 0 8px 0;
	font-size: 30px;
	font-weight: 700;
	line-height: 1.1;
	letter-spacing: -0.02em;
	color: var(--ubl-ink);
}
.ubl-invoice .ubl-badge {
	display: inline-block;
	padding: 6px 10px;
	background: #edf3ff;
	color: #1d4ed8;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.02em;
	text-transform: uppercase;
}
.ubl-invoice .ubl-meta {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px 18px;
	font-size: 14px;
	color: var(--ubl-muted);
}
.ubl-invoice .ubl-meta strong { color: var(--ubl-ink); font-weight: 600; }
.ubl-invoice .ubl-meta .ubl-full { grid-column: 1 / -1; }
.ubl-invoice .ubl-parties {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 16px;
	margin: 22px 0;
}
.ubl-invoice .ubl-box {
	padding: 14px;
	border: 1px solid var(--ubl-line);
	border-radius: 12px;
	background: #fbfdff;
}
.ubl-invoice .ubl-box h2 {
	margin: 0 0 8px 0;
	font-size: 13px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--ubl-muted);
}
.ubl-invoice .ubl-party-name {
	font-size: 15px;
	font-weight: 600;
	margin-bottom: 8px;
}
.ubl-invoice .ubl-party-address {
	font-size: 13px;
	line-height: 1.45;
	color: var(--ubl-ink);
	margin-bottom: 10px;
}
.ubl-invoice .ubl-party-empty { color: var(--ubl-muted); }
.ubl-invoice .ubl-party-fields { margin: 0; }
.ubl-invoice .ubl-party-row {
	display: grid;
	grid-template-columns: 108px 1fr;
	gap: 8px;
	font-size: 12px;
	padding: 2px 0;
}
.ubl-invoice .ubl-party-row dt { color: var(--ubl-muted); }
.ubl-invoice .ubl-party-row dd { margin: 0; color: var(--ubl-ink); overflow-wrap: anywhere; }
.ubl-invoice .ubl-reference {
	margin: 0 0 16px 0;
	padding: 12px 14px;
	border-left: 4px solid var(--ubl-brand);
	background: #f0f5ff;
	border-radius: 6px;
	font-size: 14px;
}
.ubl-invoice table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.ubl-invoice th,
.ubl-invoice td {
	border-bottom: 1px solid var(--ubl-line);
	padding: 10px 8px;
	font-size: 13px;
	text-align: left;
	vertical-align: top;
}
.ubl-invoice th {
	color: var(--ubl-muted);
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	font-size: 11px;
}
.ubl-invoice .ubl-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ubl-invoice .ubl-totals {
	margin-top: 16px;
	margin-left: auto;
	width: min(400px, 100%);
	border: 1px solid var(--ubl-line);
	border-radius: 12px;
	padding: 10px 14px;
	background: #fcfdff;
}
.ubl-invoice .ubl-totals-row {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	gap: 12px;
	padding: 6px 0;
	font-size: 14px;
}
.ubl-invoice .ubl-totals-row strong { font-size: 17px; font-weight: 700; }
.ubl-invoice .ubl-totals-divider { border: none; border-top: 1px solid var(--ubl-line); margin: 4px 0; }
.ubl-invoice .ubl-tax-label { flex: 1; }
.ubl-invoice .ubl-muted { color: var(--ubl-muted); font-size: 11px; }
.ubl-invoice .ubl-exemption-note {
	display: block;
	font-size: 11px;
	color: var(--ubl-muted);
	font-style: italic;
}
.ubl-invoice .ubl-section-label {
	font-size: 13px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--ubl-muted);
	margin: 0 0 10px 0;
}
.ubl-invoice .ubl-payment {
	margin-top: 20px;
	padding: 16px;
	border: 1px solid var(--ubl-line);
	border-radius: 12px;
	background: #fbfdff;
}
.ubl-invoice .ubl-pm-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.ubl-invoice .ubl-pm-entry { flex: 1; min-width: 200px; font-size: 13px; }
.ubl-invoice .ubl-pm-name { font-weight: 600; margin-bottom: 6px; }
.ubl-invoice .ubl-pm-row { display: flex; gap: 8px; padding: 2px 0; align-items: baseline; }
.ubl-invoice .ubl-pm-row span {
	color: var(--ubl-muted);
	font-size: 11px;
	min-width: 64px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding-top: 1px;
}
.ubl-invoice .ubl-pm-row code {
	font-family: "Consolas", "Menlo", monospace;
	font-size: 12px;
	background: #f1f5f9;
	padding: 1px 5px;
	border-radius: 4px;
	letter-spacing: 0.03em;
	overflow-wrap: anywhere;
}
.ubl-invoice .ubl-note {
	margin-top: 18px;
	font-size: 14px;
	color: var(--ubl-ink);
	white-space: pre-wrap;
}
@media (max-width: 720px) {
	.ubl-invoice { padding: 16px; border-radius: 12px; }
	.ubl-invoice .ubl-header,
	.ubl-invoice .ubl-parties { grid-template-columns: 1fr; display: grid; }
}
@media print {
	.ubl-invoice { box-shadow: none; border: none; max-width: none; padding: 0; }
}
`;
