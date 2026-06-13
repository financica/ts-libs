/**
 * Minimal, dependency-free XML builder + serializer.
 *
 * UBL is order-sensitive (every element sequence is fixed by the schema), so
 * children are always explicit, ordered arrays. There is no attribute or text
 * coercion magic beyond escaping — the UBL layer is responsible for emitting
 * elements in the right order.
 */

export type XmlAttrs = Record<string, string | number | null | undefined>;

export interface XmlElement {
	name: string;
	attrs?: XmlAttrs;
	/** Leaf text content. Mutually exclusive with `children`. */
	text?: string | number | null;
	/** Child elements. Mutually exclusive with `text`. */
	children?: XmlElement[];
}

/** Falsy children are dropped, so callers can write `cond && el(...)`. */
type ChildSpec = XmlElement | null | undefined | false;

/**
 * Build an XML element.
 *
 *   el("cbc:ID", null, "INV-1")                       → <cbc:ID>INV-1</cbc:ID>
 *   el("cbc:Amount", { currencyID: "EUR" }, "10.00")  → <cbc:Amount currencyID="EUR">10.00</cbc:Amount>
 *   el("cac:Party", null, [child, cond && child2])     → nested element
 */
export const el = (
	name: string,
	attrs?: XmlAttrs | null,
	content?: string | number | null | ChildSpec[],
): XmlElement => {
	if (Array.isArray(content)) {
		return {
			name,
			attrs: attrs ?? undefined,
			children: content.filter((c): c is XmlElement => Boolean(c)),
		};
	}
	return { name, attrs: attrs ?? undefined, text: content ?? undefined };
};

const escapeText = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (value: string): string => escapeText(value).replace(/"/g, "&quot;");

const serializeAttrs = (attrs: XmlAttrs | undefined): string => {
	if (!attrs) return "";
	return Object.entries(attrs)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
		.join("");
};

const serializeElement = (node: XmlElement, indentLevel: number): string => {
	const pad = "  ".repeat(indentLevel);
	const attrs = serializeAttrs(node.attrs);

	if (node.text !== undefined && node.text !== null) {
		return `${pad}<${node.name}${attrs}>${escapeText(String(node.text))}</${node.name}>`;
	}

	const children = node.children ?? [];
	if (children.length === 0) {
		return `${pad}<${node.name}${attrs}/>`;
	}

	const inner = children
		.map((child) => serializeElement(child, indentLevel + 1))
		.join("\n");
	return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
};

/** Serialize a root element into a UTF-8 XML document string. */
export const serializeDocument = (root: XmlElement): string =>
	`<?xml version="1.0" encoding="UTF-8"?>\n${serializeElement(root, 0)}\n`;
