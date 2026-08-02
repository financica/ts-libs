import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FacturXParseError, parseFacturXXml } from "../src/parse/index.js";

const fixture = (name: string): string =>
	readFileSync(join(import.meta.dirname, "fixtures", name), "utf-8");

describe("parseFacturXXml", () => {
	it("parses EN 16931 CII example 3 (subscription invoice)", () => {
		const { invoice, profile, warnings } = parseFacturXXml(
			fixture("CII_example3.xml"),
		);
		expect(profile).toBe("en16931");
		expect(warnings).toEqual([]);
		expect(invoice).toMatchObject({
			id: "TOSL108",
			typeCode: "380",
			issueDate: "2013-04-10",
			currency: "DKK",
		});
		expect(invoice.notes?.[0]?.content).toBe(
			"Contract was established through our website",
		);
		expect(invoice.lines).toHaveLength(1);
		expect(invoice.lines?.[0]).toMatchObject({
			id: "1",
			product: {
				name: "Paper subscription",
				description: "Subscription fee 1st quarter",
			},
			netPrice: { amount: 800 },
			quantity: 1,
			unitCode: "C62",
			tax: { categoryCode: "S", rateApplicablePercent: 25 },
			netTotal: 800,
		});
		expect(invoice.totals).toMatchObject({
			lineTotal: 800,
			chargeTotal: 100,
			taxBasisTotal: 900,
			taxTotal: 225,
			grandTotal: 1125,
			duePayable: 1125,
		});
		expect(invoice.taxBreakdown).toContainEqual(
			expect.objectContaining({
				categoryCode: "S",
				rateApplicablePercent: 25,
			}),
		);
	});

	it("parses parties, payment means and references (example 6)", () => {
		const { invoice } = parseFacturXXml(fixture("CII_example6.xml"));
		expect(invoice.seller.name).toBeTruthy();
		expect(invoice.buyer.name).toBeTruthy();
		expect(invoice.seller.vatId).toMatch(/^[A-Z]{2}/);
		expect(invoice.seller.address?.country).toBeTruthy();
	});

	it("parses every official CII example without throwing", () => {
		for (const name of [
			"CII_example1.xml",
			"CII_example2.xml",
			"CII_example3.xml",
			"CII_example5.xml",
			"CII_example6.xml",
			"CII_example8.xml",
			"CII_example9.xml",
		]) {
			const { invoice } = parseFacturXXml(fixture(name));
			expect(invoice.id).toBeTruthy();
			expect(invoice.currency).toBeTruthy();
			expect(invoice.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("decodes XML numeric character references (issue: Heures prest&#233;es)", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
	<rsm:ExchangedDocumentContext>
		<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
	</rsm:ExchangedDocumentContext>
	<rsm:ExchangedDocument>
		<ram:ID>INV/2022/00002</ram:ID>
		<ram:TypeCode>380</ram:TypeCode>
		<ram:IssueDateTime><udt:DateTimeString format="102">20220131</udt:DateTimeString></ram:IssueDateTime>
	</rsm:ExchangedDocument>
	<rsm:SupplyChainTradeTransaction>
		<ram:IncludedSupplyChainTradeLineItem>
			<ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
			<ram:SpecifiedTradeProduct><ram:Name>Heures prest&#233;es</ram:Name></ram:SpecifiedTradeProduct>
			<ram:SpecifiedLineTradeAgreement>
				<ram:NetPriceProductTradePrice><ram:ChargeAmount>100.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
			</ram:SpecifiedLineTradeAgreement>
			<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="HUR">8</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
			<ram:SpecifiedLineTradeSettlement>
				<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21.00</ram:RateApplicablePercent></ram:ApplicableTradeTax>
				<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>800.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
			</ram:SpecifiedLineTradeSettlement>
		</ram:IncludedSupplyChainTradeLineItem>
		<ram:ApplicableHeaderTradeAgreement>
			<ram:SellerTradeParty><ram:Name>Soci&#233;t&#233; G&#233;n&#233;rale &amp; Fils</ram:Name></ram:SellerTradeParty>
			<ram:BuyerTradeParty><ram:Name>Client</ram:Name></ram:BuyerTradeParty>
		</ram:ApplicableHeaderTradeAgreement>
		<ram:ApplicableHeaderTradeDelivery/>
		<ram:ApplicableHeaderTradeSettlement>
			<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
		</ram:ApplicableHeaderTradeSettlement>
	</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
		const { invoice } = parseFacturXXml(xml);
		expect(invoice.lines?.[0]?.product.name).toBe("Heures prestées");
		expect(invoice.seller.name).toBe("Société Générale & Fils");
	});

	it("accepts XRechnung guidelines instead of rejecting them", () => {
		const xml = fixture("CII_example3.xml").replace(
			"urn:cen.eu:en16931:2017",
			"urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
		);
		const { invoice, profile } = parseFacturXXml(xml);
		expect(profile).toBe("xrechnung");
		expect(invoice.id).toBe("TOSL108");
	});

	it("matches elements regardless of namespace prefixes", () => {
		const xml = fixture("CII_example3.xml")
			.replace(/rsm:/g, "a:")
			.replace(/ram:/g, "b:")
			.replace(/udt:/g, "c:")
			.replace(/xmlns:rsm=/g, "xmlns:a=")
			.replace(/xmlns:ram=/g, "xmlns:b=")
			.replace(/xmlns:udt=/g, "xmlns:c=");
		const { invoice } = parseFacturXXml(xml);
		expect(invoice.id).toBe("TOSL108");
		expect(invoice.lines).toHaveLength(1);
		expect(invoice.totals?.grandTotal).toBe(1125);
	});

	it("throws FacturXParseError on non-CII XML", () => {
		expect(() => parseFacturXXml("<Invoice></Invoice>")).toThrow(FacturXParseError);
	});

	it("throws FacturXParseError on garbage input", () => {
		expect(() => parseFacturXXml("this is not xml at all <<<>")).toThrow(
			FacturXParseError,
		);
	});
});
