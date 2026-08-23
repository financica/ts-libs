# @financica/facturx

Factur-X / ZUGFeRD (EN 16931 CII) hybrid e-invoice toolkit for TypeScript:
parse, generate, and embed structured invoices in PDF/A-3.

- No native bindings; runs on Node ≥ 24.
- Parsing and generation share one `FacturXInvoice` data model with EN 16931
  business-term naming.
- Any CII document parses: every Factur-X / ZUGFeRD 2.x profile (MINIMUM
  through EXTENDED) and XRechnung CIUS documents. Numeric character references
  (`&#233;`) are decoded per XML 1.0, and elements match by local name, so
  unusual namespace prefixes don't matter.
- Entry points are split so bundlers tree-shake what you don't use: parsing an
  XML string never pulls in the PDF machinery or the bundled fonts.

| Entry point                   | What it exports                                               | Dependencies pulled in                  |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `@financica/facturx`          | `FacturXInvoice` model, code lists, profiles, `computeTotals` | none                                    |
| `@financica/facturx/parse`    | `parseFacturXXml`                                             | fast-xml-parser                         |
| `@financica/facturx/generate` | `buildFacturXXml`, `validateForBuild`                         | none                                    |
| `@financica/facturx/pdf`      | `extractFacturXXml`, `attachFacturXXml`                       | @cantoo/pdf-lib                         |
| `@financica/facturx/render`   | `renderInvoicePdf`, `generateFacturXPdf`                      | @cantoo/pdf-lib, fontkit, bundled fonts |

## Install

```sh
npm install @financica/facturx
```

## Reading a hybrid PDF or CII XML

```ts
import { extractFacturXXml } from "@financica/facturx/pdf";
import { parseFacturXXml } from "@financica/facturx/parse";

const embedded = await extractFacturXXml(pdfBytes); // null if not a hybrid PDF
if (embedded) {
	const { invoice, profile, warnings } = parseFacturXXml(embedded.xml);
	console.log(profile, invoice.id, invoice.totals?.grandTotal);
	console.log(invoice.lines?.map((line) => line.product.name));
}
```

`parseFacturXXml` returns `null` when the input is well-formed XML but not a
CII invoice (no `CrossIndustryInvoice` root). It throws `FacturXParseError`
when the XML is malformed or a mandatory business term is missing (BT-1, BT-2,
BT-3, BT-5, seller, buyer, line id/name/quantity/unit/VAT category, VAT
breakdown amounts). Non-fatal oddities — an unrecognised guideline, a profile
mismatch — are reported in `warnings`.

## Generating a Factur-X invoice

```ts
import { computeTotals } from "@financica/facturx";
import { generateFacturXPdf } from "@financica/facturx/render";

const invoice = computeTotals({
	id: "INV-2026-001",
	typeCode: "380",
	issueDate: "2026-06-01",
	currency: "EUR",
	seller: {
		name: "Acme SARL",
		address: {
			line1: "1 Rue Test",
			postcode: "75001",
			city: "Paris",
			country: "FR",
		},
		vatId: "FR11999999998",
	},
	buyer: { name: "Client SA", address: { country: "FR" } },
	paymentTerms: { dueDate: "2026-07-01" },
	lines: [
		{
			id: "1",
			product: { name: "Consulting" },
			netPrice: { amount: 90 },
			quantity: 8,
			unitCode: "HUR",
			tax: { categoryCode: "S", rateApplicablePercent: 20 },
		},
	],
});

const { pdfBytes, xml } = await generateFacturXPdf(invoice, { locale: "fr" });
```

`computeTotals` derives the per-line net amounts, the VAT breakdown (BG-23)
and the document totals (BG-22) per the EN 16931 calculation rules
(BR-CO-10..17), including `roundingAmount` / `prepaidAmount` handling and
VATEX exemption-reason defaults for AE/K/G/O categories.

`generateFacturXPdf` renders an A4 template (locales `en`, `fr`, `de`, `nl`;
fonts fully embedded, PDF/A-3B output intent and XMP metadata), or embeds into
your own PDF via `existingPdf`. To keep full control, compose the pieces
yourself:

```ts
import { buildFacturXXml } from "@financica/facturx/generate";
import { attachFacturXXml } from "@financica/facturx/pdf";

const xml = buildFacturXXml(invoice);
const pdfBytes = await attachFacturXXml({ pdf: myPdfBytes, xml });
```

Note: embedding into an arbitrary existing PDF applies the PDF/A-3 furniture
(attachment relationship, output intent, metadata) but cannot retrofit fonts
the source PDF didn't embed. The built-in template embeds its own.

## Profiles

Guideline URNs for MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED and
XRechnung are exported as `PROFILE_URNS`; `detectProfile(urn)` classifies a
BT-24 guideline (all XRechnung versions recognized). Generation defaults to
the EN 16931 (COMFORT) profile.

## Code lists

Subsets of the code lists ship as constants:
`DOCUMENT_TYPE_CODES` (UNTDID 1001), `TAX_CATEGORY_CODES` (UNTDID 5305),
`PAYMENT_MEANS_CODES` (UNTDID 4461), `UNIT_CODES` (UN/ECE Rec 20/21),
`IDENTIFIER_SCHEMES` (ISO 6523), plus full `COUNTRY_CODES` (ISO 3166-1) and
`CURRENCY_CODES` (ISO 4217) with `isCountryCode` / `isCurrencyCode` guards.
Every model field also accepts plain strings, so uncommon codes round-trip.

## Bundled assets

The renderer embeds Liberation Sans (SIL OFL 1.1, subset to Latin coverage);
the PDF/A output intent uses a compact sRGB v2 ICC profile from
[Compact-ICC-Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles)
(CC0-1.0). Both live behind the `/render` and `/pdf` entry points.

## License

MIT © Financica — https://financica.app/open-source
