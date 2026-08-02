import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
	buildDdvOEnvelope,
	NS_DDV_O,
	NS_EDP,
	serializeDdvO,
	type DdvOReturn,
} from "../src/index.js";

const parse = (xml: string) =>
	new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);

/** Tag names of the direct children of the root element (2-space indent). */
const directChildTags = (xml: string): string[] =>
	xml
		.split("\n")
		.map((line) => /^ {2}<(\/?)([\w:.-]+)/.exec(line))
		.filter((m): m is RegExpExecArray => m !== null && m[1] === "")
		.map((m) => m[2]!);

const sampleReturn: DdvOReturn = {
	taxPeriodStart: "2026-01-01",
	taxPeriodEnd: "2026-01-31",
	rates: { higher: 22, lower: 9.5, reduced: 5 },
	appliesDeductibleProportion: false,
	claimsRefund: false,
	fields: {
		f11: 10000,
		f21: 2200,
		f22: 95,
		f31: 4000,
		f41: 880,
		f51: 1415,
	},
};

describe("serializeDdvO", () => {
	it("emits a namespaced standalone DDV-O document", () => {
		const xml = serializeDdvO(sampleReturn);
		const doc = parse(xml);
		expect(doc["DDV-O"]["@_xmlns"]).toBe(NS_DDV_O);
		expect(doc["DDV-O"].taxPeriodStart).toBe("2026-01-01");
		expect(doc["DDV-O"].taxPeriodEnd).toBe("2026-01-31");
	});

	it("formats monetary boxes to 2 decimals and omits absent ones", () => {
		const doc = parse(serializeDdvO(sampleReturn))["DDV-O"];
		expect(doc.f11).toBe("10000.00");
		expect(doc.f21).toBe("2200.00");
		expect(doc.f22).toBe("95.00");
		expect(doc.f51).toBe("1415.00");
		// Unset fields must not appear (FURS treats absent as zero/empty).
		expect(doc.f12).toBeUndefined();
		expect(doc.f52).toBeUndefined();
	});

	it("emits VAT rates as n_ddv/v_ddv/z_ddv before the period", () => {
		const doc = parse(serializeDdvO(sampleReturn))["DDV-O"];
		expect(doc.n_ddv).toBe("9.5");
		expect(doc.v_ddv).toBe("22");
		expect(doc.z_ddv).toBe("5");
	});

	it("orders elements per the XSD sequence", () => {
		const tags = directChildTags(serializeDdvO(sampleReturn));
		const order = (name: string) => tags.indexOf(name);
		// rates -> period -> flags -> f-fields, monotonically increasing.
		expect(order("n_ddv")).toBeLessThan(order("taxPeriodStart"));
		expect(order("taxPeriodStart")).toBeLessThan(order("taxPeriodEnd"));
		expect(order("taxPeriodEnd")).toBeLessThan(order("f03"));
		expect(order("f03")).toBeLessThan(order("f11"));
		expect(order("f11")).toBeLessThan(order("f21"));
		expect(order("f21")).toBeLessThan(order("f22"));
		expect(order("f22")).toBeLessThan(order("f31"));
		expect(order("f41")).toBeLessThan(order("f51"));
	});

	it("emits boolean flags as true/false", () => {
		const doc = parse(serializeDdvO(sampleReturn))["DDV-O"];
		expect(doc.f03).toBe("false");
		expect(doc.f04).toBe("false");
	});

	it("emits a represented foreigner and correction lines in order", () => {
		const xml = serializeDdvO({
			...sampleReturn,
			selfReport: true,
			recordId: "REC-123",
			contactPersonFullName: "Ana Novak",
			representedForeigner: {
				idNumber: "ATU12345678",
				name: "Foreign GmbH",
				address: "Wien",
			},
			corrections: [
				{
					periodStart: "2025-12-01",
					periodEnd: "2025-12-31",
					amount: 120.5,
					interest: 3.21,
				},
			],
		});
		const doc = parse(xml)["DDV-O"];
		expect(doc.selfReport).toBe("true");
		expect(doc.idEvidenc).toBe("REC-123");
		expect(doc.contactPersonFullName).toBe("Ana Novak");
		expect(doc.representedForeigner.idNumber).toBe("ATU12345678");
		expect(doc.selfReportOrCorrection.amount).toBe("120.50");
		expect(doc.selfReportOrCorrection.interest).toBe("3.21");

		const tags = directChildTags(xml);
		expect(tags.indexOf("idEvidenc")).toBeLessThan(
			tags.indexOf("representedForeigner"),
		);
		expect(tags.indexOf("representedForeigner")).toBeLessThan(tags.indexOf("f11"));
		expect(tags.indexOf("f51")).toBeLessThan(
			tags.indexOf("selfReportOrCorrection"),
		);
	});
});

describe("buildDdvOEnvelope", () => {
	it("wraps the return in an EDP envelope with the taxpayer header", () => {
		const xml = buildDdvOEnvelope({
			return: sampleReturn,
			taxpayer: {
				vatNumber: "SI12345678",
				name: "Test d.o.o.",
				taxpayerType: "PO",
			},
		});
		const env = parse(xml).Envelope;
		expect(env["@_xmlns"]).toBe(NS_DDV_O);
		expect(env["@_xmlns:edp"]).toBe(NS_EDP);
		expect(env["edp:Header"]["edp:taxpayer"]["edp:vatNumber"]).toBe("SI12345678");
		expect(env["edp:Header"]["edp:taxpayer"]["edp:taxpayerType"]).toBe("PO");
		// body = bodyContent placeholder + the DDV-O payload.
		expect(env.body["DDV-O"].f51).toBe("1415.00");
		// The nested DDV-O inherits the default namespace (no own xmlns).
		expect(env.body["DDV-O"]["@_xmlns"]).toBeUndefined();
	});

	it("orders Header, Signatures, body inside the envelope", () => {
		const xml = buildDdvOEnvelope({
			return: sampleReturn,
			taxpayer: { taxNumber: "12345678" },
		});
		const tags = directChildTags(xml);
		expect(tags).toEqual(["edp:Header", "edp:Signatures", "body"]);
	});
});
