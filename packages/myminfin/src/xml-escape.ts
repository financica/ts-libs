// Minimal XML text/attribute escaping shared by the document generators. Kept
// internal (not re-exported from the package index): the generators own their
// serialization and callers should never assemble raw XML by hand.

export function escapeXmlText(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeXmlAttr(value: string): string {
	return escapeXmlText(value).replace(/"/g, "&quot;");
}
