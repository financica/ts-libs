# @financica/edavki

TypeScript toolkit for Slovenian **eDavki** (FURS) tax documents.

`v0` covers the **DDV-O VAT return**: build a return from plain numbers and
serialize it as [EDP](https://edavki.durs.si/) XML against the vendored
`DDV_O_11.xsd`, either standalone or wrapped in a full submission envelope, for
**manual import** into the eDavki portal. There is no runtime XSD validation;
see [Scope & non-goals](#scope--non-goals-v0).

It is the Slovenian counterpart to `@financica/myminfin` (Belgian SPF Finances
/ Intervat).

## Install

```bash
bun add @financica/edavki
```

## Usage

```ts
import { buildDdvOEnvelope, serializeDdvO } from "@financica/edavki";

const ret = {
	taxPeriodStart: "2026-01-01",
	taxPeriodEnd: "2026-01-31",
	rates: { higher: 22, lower: 9.5, reduced: 5 },
	appliesDeductibleProportion: false,
	claimsRefund: false,
	fields: {
		f11: 10000, // taxable supplies (base)
		f21: 2200, // output VAT @ 22 %
		f31: 4000, // purchases (base)
		f41: 880, // input VAT @ 22 %
		f51: 1320, // VAT liability
	},
};

// Just the <DDV-O> document:
const doc = serializeDdvO(ret);

// A full <Envelope> ready for manual eDavki import:
const xml = buildDdvOEnvelope({
	return: ret,
	taxpayer: { vatNumber: "SI12345678", name: "Test d.o.o.", taxpayerType: "PO" },
});
```

## The field registry

`DDV_O_FIELDS` is the ordered list of every monetary box on the return, with its
section, whether it is a tax **base** or a **VAT amount**, and its rate. It is
exported so a consuming app (e.g. Financica's statutory VAT-return engine) can
drive box mapping, labels and UI from it.

```ts
import { DDV_O_FIELDS, DDV_O_FIELD_BY_ID } from "@financica/edavki";

DDV_O_FIELD_BY_ID.f21; // { id: "f21", section: "vatCharged", kind: "vat", rate: 22, labelEn: "VAT charged at 22 %", ... }
```

Sections mirror the form: `supplies` (I), `vatCharged` (II), `purchases` (III),
`vatDeducted` (IV), `settlement` (V).

## Scope & non-goals (v0)

- **In scope:** building / serializing DDV-O (`DDV_O_11`) as standalone or
  enveloped XML; the field registry; the EDP taxpayer header.
- **Out of scope (for now):** authenticated submission transport (the eDavki
  web service needs a qualified digital certificate and XML-DSig signatures —
  the envelope emits an empty `<edp:Signatures/>` placeholder); the July-2025 VAT
  **ledgers** (KIR/KPR, `DDV_KIR_KPR_1.xsd`); and XSD-level runtime validation.
  These are tracked for later versions.

## Schemas

Vendored under [`schemas/`](./schemas) for reference and deterministic builds:

- `DDV_O_11.xsd` — the VAT return (current version; v12 not yet published)
- `EDP-Common-1.xsd` — the shared envelope/header/signatures

Source of truth: <https://edavki.durs.si/Documents/Schemas/>. FURS bumps the
DDV-O version periodically (the namespace on the root element encodes it); when a
new version ships, vendor the new XSD, add the new fields, and bump `NS_DDV_O`.

## Development

```bash
bun install
bun run ci   # type-check + lint + test + build
```
