/**
 * XMP metadata packet for PDF/A-3B with the Factur-X PDF/A extension schema,
 * as required by the Factur-X / ZUGFeRD specification (§6.2).
 */

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** ISO timestamp without milliseconds, as XMP expects. */
const formatXmpDate = (date: Date): string => `${date.toISOString().split(".")[0]}Z`;

export interface XmpMetadataInput {
	documentId: string;
	title: string;
	author: string;
	creatorTool: string;
	producer: string;
	createDate: Date;
	modifyDate: Date;
	/** fx:DocumentFileName — factur-x.xml or xrechnung.xml. */
	documentFileName: string;
	/** fx:ConformanceLevel — MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED, XRECHNUNG. */
	conformanceLevel: string;
}

/** One pdfaSchema:property entry of the Factur-X extension schema. */
const property = (name: string, description: string) =>
	`<rdf:li rdf:parseType="Resource">
							<pdfaProperty:name>${name}</pdfaProperty:name>
							<pdfaProperty:valueType>Text</pdfaProperty:valueType>
							<pdfaProperty:category>external</pdfaProperty:category>
							<pdfaProperty:description>${description}</pdfaProperty:description>
						</rdf:li>`;

export const buildXmpMetadata = (input: XmpMetadataInput): string => {
	const createDate = formatXmpDate(input.createDate);
	const modifyDate = formatXmpDate(input.modifyDate);
	return `<?xpacket begin="\u{FEFF}" id="${escapeXml(input.documentId)}"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
	<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
		<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
			<dc:format>application/pdf</dc:format>
			<dc:creator>
				<rdf:Seq>
					<rdf:li>${escapeXml(input.author)}</rdf:li>
				</rdf:Seq>
			</dc:creator>
			<dc:title>
				<rdf:Alt>
					<rdf:li xml:lang="x-default">${escapeXml(input.title)}</rdf:li>
				</rdf:Alt>
			</dc:title>
		</rdf:Description>
		<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
			<xmp:CreatorTool>${escapeXml(input.creatorTool)}</xmp:CreatorTool>
			<xmp:CreateDate>${createDate}</xmp:CreateDate>
			<xmp:ModifyDate>${modifyDate}</xmp:ModifyDate>
			<xmp:MetadataDate>${modifyDate}</xmp:MetadataDate>
		</rdf:Description>
		<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
			<pdf:Producer>${escapeXml(input.producer)}</pdf:Producer>
		</rdf:Description>
		<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
			<pdfaid:part>3</pdfaid:part>
			<pdfaid:conformance>B</pdfaid:conformance>
		</rdf:Description>
		<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
			<fx:DocumentType>INVOICE</fx:DocumentType>
			<fx:DocumentFileName>${escapeXml(input.documentFileName)}</fx:DocumentFileName>
			<fx:Version>1.0</fx:Version>
			<fx:ConformanceLevel>${escapeXml(input.conformanceLevel)}</fx:ConformanceLevel>
		</rdf:Description>
		<rdf:Description rdf:about=""
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
		</rdf:Description>
	</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};
