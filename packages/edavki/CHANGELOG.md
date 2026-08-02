# Changelog

## 0.1.0

Initial release.

- DDV-O VAT return builder (`DDV_O_11`): `serializeDdvO` (standalone document)
  and `buildDdvOEnvelope` (full EDP submission envelope for manual eDavki import).
- `DDV_O_FIELDS` field registry (id, section, base/VAT kind, rate, EN/SL labels)
  as a single source of truth for box mapping.
- EDP-Common taxpayer header builder.
- Vendored `DDV_O_11.xsd` and `EDP-Common-1.xsd` under `schemas/`.
