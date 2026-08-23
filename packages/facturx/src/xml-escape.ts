/**
 * XML escaping shared by the CII serializer and the XMP packet builder.
 * `escapeXmlText` covers element content (`&`, `<`, `>`); `escapeXmlAttribute`
 * additionally escapes `"` for double-quoted attribute values.
 */

export const escapeXmlText = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escapeXmlAttribute = (value: string): string =>
	escapeXmlText(value).replace(/"/g, "&quot;");
