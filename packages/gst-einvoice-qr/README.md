# @financica/gst-einvoice-qr

Decode, cryptographically verify and reconcile the **signed QR code** printed on
Indian GST e-invoices. Zero dependencies; signature checking uses `node:crypto`.

```bash
npm install @financica/gst-einvoice-qr
```

## What this is for

Under Rule 48(4) of the CGST Rules, an Indian supplier above the turnover
threshold must register every B2B, SEZ and export invoice with an Invoice
Registration Portal (IRP) before issuing it. The IRP returns an **IRN** (a
64-character hash) and a **signed QR code**, and both must be printed on the
document the buyer receives.

That QR is a compact JWS (RS256) signed by the IRP. It attests to ten header
fields, which makes it the one part of an Indian invoice PDF you can trust
without trusting the sender:

| QR field | Meaning |
| --- | --- |
| `SellerGstin` | Supplier GSTIN |
| `BuyerGstin` | Buyer GSTIN, or `URP` if unregistered / an export |
| `DocNo`, `DocTyp`, `DocDt` | Document number, type (`INV`/`CRN`/`DBN`), date |
| `TotInvVal` | Total including tax, INR |
| `ItemCnt` | Line count |
| `MainHsnCode` | HSN/SAC of the highest-value line |
| `Irn`, `IrnDt` | The IRN and when it was minted |

**It is not an embedded document.** Unlike Factur-X or ZUGFeRD you cannot
reconstruct the invoice from it, only confirm that the IRP saw those ten values.
That distinction drives this library's API: it gives you an attestation to
compare against, not a parsed invoice.

## Quick start

```ts
import {
	loadSignerCertificate,
	reconcileWithQr,
	verifySignedQr,
} from "@financica/gst-einvoice-qr";

// Certificates you trust, fetched and cached by you. See "Certificates" below.
const certificates = [loadSignerCertificate(nicProductionPem, "NIC production")];

const result = verifySignedQr(qrTextFromScanner, { certificates });

if (!result.verified) {
	console.warn("Not verified:", result.signatureVerification.status);
}

console.log(result.invoice.irn, result.invoice.totalInvoiceValue);
```

The library takes the QR **text**, not an image. Getting that text out of a PDF
or photo is your pipeline's job (render the page, run a QR reader). Pass the
scanner's output through unchanged: the signature covers those exact base64url
bytes, so re-encoding it breaks verification.

## Verification is a union, not a boolean

`signatureVerification` distinguishes outcomes that a `false` would flatten:

| Status | Meaning |
| --- | --- |
| `verified` | A supplied certificate cryptographically verified it. |
| `invalid_signature` | We hold the signer's certificate and the signature does not check out. Treat as forged or corrupted. |
| `unknown_key` | The header names a signer we hold no certificate for. **We could not check** — not evidence of anything. |
| `not_checked` | No certificates supplied. |
| `unsupported_algorithm` | The header asked for something other than RS256. |
| `certificate_expired` | The matched certificate was outside its validity window at `at`. |

`verified` is true only after a real cryptographic check passed, so gating on it
directly is safe.

## Certificates

**No certificates are bundled, on purpose.** Six IRPs are authorised (NIC's two
plus IRIS, Cygnet, Clear and EY), each signs with its own key, and those keys
rotate. A bundled list goes stale silently, and the failure mode is the bad one:
an invoice cleared through an IRP you have no key for looks *forged* rather than
*uncheckable*. So you supply the certificates you trust and decide how to
refresh them.

Selection is by SHA-1 thumbprint: the JWS header carries it as `kid` (uppercase
hex) and `x5t` (base64url of the same 20 bytes). If the header names neither and
you supplied exactly one certificate, that one is used; with several, the
library refuses to guess rather than trying each key in turn.

For an old invoice, pass `at` to check the certificate was valid **when the
invoice was cleared** rather than today:

```ts
verifySignedQr(text, { certificates, at: new Date(invoice.documentDate) });
```

## Reconciling against your own extraction

The point of a verified QR in an accounts-payable pipeline: compare it with what
your OCR or LLM read off the page.

```ts
import { reconcileWithQr } from "@financica/gst-einvoice-qr";

const check = reconcileWithQr(result.invoice, {
	supplierTaxId: extracted.supplierVatNumber,
	invoiceNumber: extracted.number,
	invoiceDate: extracted.issueDate,
	totalAmount: extracted.total,
	lineCount: extracted.lines.length,
});

if (!check.consistent) {
	console.warn(check.mismatches); // [{ field, attested, extracted, status }]
}
```

Each check comes back `match`, `mismatch`, `not_extracted`, or `explained`.
`explained` covers the two cases that look like mismatches but are not:

- **Same PAN, different state.** An Indian business holds one GSTIN per state,
  so a supplier's letterhead GSTIN can legitimately differ from the one on the
  invoice. `isSameLegalEntity()` compares the embedded PANs.
- **`URP` against a foreign buyer's VAT number.** If you are an EU buyer, the
  IRP holds no GSTIN for you and the QR says `URP`. That is correct, not a
  discrepancy.

Invoice numbers are compared with separators stripped by default (Indian numbers
are separator-heavy and extraction mangles them); pass `{ loose: false }` for
exact comparison. Amounts use a `±0.01` tolerance by default.

## GSTIN utilities

```ts
import { isValidGstin, parseGstin, isSameLegalEntity } from "@financica/gst-einvoice-qr";

isValidGstin("27AAPFU0939F1ZV"); // true — format and base-36 checksum
parseGstin("27AAPFU0939F1ZV");
// { stateCode: "27", stateName: "Maharashtra", pan: "AAPFU0939F",
//   panHolderType: "Firm / LLP", registrationNumber: 1, ... }

isSameLegalEntity("27AAPFU0939F1ZV", "29AAPFU0939F1ZR"); // true — same PAN
```

Validation is structural. Whether a registration exists or is active can only be
answered by the GST portal.

## Behaviour worth knowing

- **`DocDt` is `DD/MM/YYYY`** and is normalised to `YYYY-MM-DD`. `05/08/2020` is
  5 August, not 8 May. Impossible dates like `31/02` are rejected rather than
  rolled forward.
- **`IrnDt` stays naive.** The IRP stamps it in IST without saying so, so it is
  returned as `YYYY-MM-DDTHH:mm:ss` with no offset. Appending `Z` would be
  inventing information.
- **Unknown document types pass through.** The code list belongs to the IRP;
  rejecting a value we have not heard of would break on their next release.
- **Quoted numerics are accepted.** Some gateway wrappers emit `"16650.50"`.
- **`data` as an object is accepted.** The IRP emits an escaped JSON string;
  some wrappers pre-parse it.
- **GSTINs in the payload are not checksum-validated.** The IRP's attestation
  outranks our regex, and refusing a real invoice over our own validation would
  be the wrong trade. Run `isValidGstin()` yourself if you want that signal.
- **B2C dynamic QRs throw `DynamicB2cQrError`.** The other Indian invoice QR
  (notification 14/2020) is a UPI payment string with no IRN. Scanning the wrong
  one is the likeliest way to end up here, so it gets its own error rather than
  a confusing "not a JWS".

## Scope

This library reads and checks what an IRP already issued. It does **not**
generate IRNs, talk to an IRP, or build `INV-01` payloads: that requires GSTIN
credentials and either an Indian IP whitelist or a GSP/ASP relationship.

## Prior art

[`gstin-validator`](https://www.npmjs.com/package/gstin-validator) covers
GSTIN checksums and signed-QR verification and was the starting point for this
research. It is unmaintained since 2022, ships no types, depends on
`jsonwebtoken@8`, and bundles a fixed certificate list keyed to NIC — which is
the design decision this package deliberately inverts.

## License

MIT
