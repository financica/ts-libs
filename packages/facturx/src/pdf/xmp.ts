/**
 * The Factur-X slice of the XMP packet. pdf-lib's `convertToPDFA` owns the
 * dc / xmp / pdf / pdfaid descriptions and rebuilds them from the Info
 * dictionary; these fragments are handed to it as `extensions` and appended
 * verbatim, so only what the Factur-X specification adds lives here.
 */

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** One pdfaSchema:property entry of the Factur-X extension schema. */
const property = (name: string, description: string) =>
	`<rdf:li rdf:parseType="Resource">
							<pdfaProperty:name>${name}</pdfaProperty:name>
							<pdfaProperty:valueType>Text</pdfaProperty:valueType>
							<pdfaProperty:category>external</pdfaProperty:category>
							<pdfaProperty:description>${description}</pdfaProperty:description>
						</rdf:li>`;

/**
 * The PDF/A extension schema declaring the `fx:` properties. PDF/A validators
 * reject metadata in a namespace the document does not describe, so this
 * travels with every Factur-X document and never varies.
 */
const FACTUR_X_EXTENSION_SCHEMA = `<rdf:Description rdf:about=""
		xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
		xmlns:pdfaField="http://www.aiim.org/pdfa/ns/field#"
		xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"
		xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
		xmlns:pdfaType="http://www.aiim.org/pdfa/ns/type#">
	<pdfaExtension:schemas>
		<rdf:Bag>
			<rdf:li rdf:parseType="Resource">
				<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
				<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
				<pdfaSchema:prefix>fx</pdfaSchema:prefix>
				<pdfaSchema:property>
					<rdf:Seq>
						${property("DocumentFileName", "The name of the embedded XML invoice file")}
						${property("DocumentType", "The type of the hybrid document, INVOICE or ORDER")}
						${property("Version", "The actual version of the standard applying to the embedded XML document")}
						${property("ConformanceLevel", "The conformance level of the embedded XML document")}
					</rdf:Seq>
				</pdfaSchema:property>
			</rdf:li>
		</rdf:Bag>
	</pdfaExtension:schemas>
</rdf:Description>`;

export interface FacturXXmpInput {
	/** Identity of this document, for xmpMM:DocumentID. */
	documentId: string;
	/** fx:DocumentFileName — factur-x.xml or xrechnung.xml. */
	documentFileName: string;
	/** fx:ConformanceLevel — MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED, XRECHNUNG. */
	conformanceLevel: string;
}

/**
 * The `rdf:Description` fragments Factur-X adds on top of a plain PDF/A
 * document, in the order they should appear.
 */
export const buildFacturXXmpExtensions = (input: FacturXXmpInput): string[] => [
	`<rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
	<xmpMM:DocumentID>${escapeXml(input.documentId)}</xmpMM:DocumentID>
</rdf:Description>`,
	`<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
	<fx:DocumentType>INVOICE</fx:DocumentType>
	<fx:DocumentFileName>${escapeXml(input.documentFileName)}</fx:DocumentFileName>
	<fx:Version>1.0</fx:Version>
	<fx:ConformanceLevel>${escapeXml(input.conformanceLevel)}</fx:ConformanceLevel>
</rdf:Description>`,
	FACTUR_X_EXTENSION_SCHEMA,
];
