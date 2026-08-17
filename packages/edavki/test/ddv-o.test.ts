import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
	buildDdvOElement,
	buildDdvOEnvelope,
	buildDdvOEnvelopeElement,
	NS_DDV_O,
	NS_EDP,
	serializeDdvO,
	type DdvOReturn,
	type XmlElement,
} from "../src/index.js";

const parse = (xml: string) =>
	new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);

const childNames = (node: XmlElement): string[] =>
	(node.children ?? []).map((c) => c.name);

/**
 * The element names of the top-level `<xs:sequence>` of a global element in
 * `schemas/DDV_O_11.xsd`, in schema order. Nested complex types are not
 * descended into, so `representedForeigner`'s children do not leak in.
 */
const xsdSequence = (elementName: string): string[] => {
	const xsd = readFileSync(
		fileURLToPath(new URL("../schemas/DDV_O_11.xsd", import.meta.url)),
		"utf8",
	);
	type Node = Record<string, unknown> & { ":@"?: Record<string, string> };
	const tree = new XMLParser({
		ignoreAttributes: false,
		preserveOrder: true,
	}).parse(xsd) as Node[];
	const kids = (n: Node, tag: string): Node[] => (n[tag] as Node[] | undefined) ?? [];
	const schema = tree.find((n) => "xs:schema" in n)!;
	const element = kids(schema, "xs:schema").find(
		(n) => "xs:element" in n && n[":@"]?.["@_name"] === elementName,
	)!;
	const complexType = kids(element, "xs:element").find((n) => "xs:complexType" in n)!;
	const sequence = kids(complexType, "xs:complexType").find(
		(n) => "xs:sequence" in n,
	)!;
	return kids(sequence, "xs:sequence")
		.filter((n) => "xs:element" in n)
		.map((n) => n[":@"]?.["@_name"] ?? n[":@"]?.["@_ref"] ?? "");
};

/** `actual` is a subsequence of `order` (every element present, same relative order). */
const expectSubsequenceOf = (actual: string[], order: string[]) => {
	for (const name of actual) expect(order).toContain(name);
	let cursor = -1;
	for (const name of actual) {
		const idx = order.indexOf(name);
		// Repeated (maxOccurs="unbounded") elements may sit at the same index.
		expect(idx).toBeGreaterThanOrEqual(cursor);
		cursor = idx;
	}
};

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

const fullReturn: DdvOReturn = {
	...sampleReturn,
	selfReport: true,
	depositAfterDeadline: false,
	declineSelfReportInstitute: false,
	recordId: "REC-123",
	contactPersonFullName: "Ana Novak",
	contactPersonPhoneNumber: "+386 1 234 5678",
	representativeTaxNumber: 87654321,
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
		{
			periodStart: "2025-11-01",
			periodEnd: "2025-11-30",
			amount: -40,
			interest: 0,
		},
	],
};

describe("serializeDdvO", () => {
	it("emits a namespaced standalone DDV-O with rates, period, flags and 2-decimal boxes", () => {
		const doc = parse(serializeDdvO(sampleReturn))["DDV-O"];
		expect(doc).toMatchObject({
			"@_xmlns": NS_DDV_O,
			// n_ddv = lower (nižja), v_ddv = higher (višja), z_ddv = reduced (znižana).
			n_ddv: "9.5",
			v_ddv: "22",
			z_ddv: "5",
			taxPeriodStart: "2026-01-01",
			taxPeriodEnd: "2026-01-31",
			f03: "false",
			f04: "false",
			f11: "10000.00",
			f21: "2200.00",
			f22: "95.00",
			f31: "4000.00",
			f41: "880.00",
			f51: "1415.00",
		});
		// Unset boxes and optional blocks must not appear at all (FURS treats
		// absent as empty; an explicit "0.00" is a different statement).
		const emitted = new Set(childNames(buildDdvOElement(sampleReturn)));
		for (const absent of [
			"f12",
			"f52",
			"selfReport",
			"idEvidenc",
			"representedForeigner",
			"f02",
			"selfReportOrCorrection",
		]) {
			expect(emitted.has(absent)).toBe(false);
		}
	});

	it("emits children as a subsequence of the DDV-O <xs:sequence> in DDV_O_11.xsd", () => {
		const order = xsdSequence("DDV-O");
		expect(order[0]).toBe("n_ddv");
		expect(order.at(-1)).toBe("selfReportOrCorrection");
		expectSubsequenceOf(childNames(buildDdvOElement(sampleReturn)), order);
		expectSubsequenceOf(childNames(buildDdvOElement(fullReturn)), order);
		// The nested blocks follow their own sequences too.
		const full = buildDdvOElement(fullReturn);
		const foreigner = full.children!.find(
			(c) => c.name === "representedForeigner",
		)!;
		expect(childNames(foreigner)).toEqual(["idNumber", "name", "address"]);
		const correction = full.children!.find(
			(c) => c.name === "selfReportOrCorrection",
		)!;
		expect(childNames(correction)).toEqual([
			"periodStart",
			"periodEnd",
			"amount",
			"interest",
		]);
	});

	it("emits the full optional block set with corrections in input order", () => {
		const doc = parse(serializeDdvO(fullReturn))["DDV-O"];
		expect(doc).toMatchObject({
			selfReport: "true",
			depositAfterDeadline: "false",
			selfReportDoNotUseInstitute: "false",
			idEvidenc: "REC-123",
			contactPersonFullName: "Ana Novak",
			contactPersonPhoneNumber: "+386 1 234 5678",
			representedForeigner: {
				idNumber: "ATU12345678",
				name: "Foreign GmbH",
				address: "Wien",
			},
			f02: "87654321",
		});
		expect(doc.selfReportOrCorrection).toEqual([
			{
				periodStart: "2025-12-01",
				periodEnd: "2025-12-31",
				amount: "120.50",
				interest: "3.21",
			},
			{
				periodStart: "2025-11-01",
				periodEnd: "2025-11-30",
				amount: "-40.00",
				interest: "0.00",
			},
		]);
	});

	it("omits n_ddv/v_ddv/z_ddv when no rates are given, and foreigner sub-elements when absent", () => {
		const { rates: _rates, ...noRates } = sampleReturn;
		const doc = parse(
			serializeDdvO({
				...noRates,
				representedForeigner: { idNumber: "ATU12345678" },
			}),
		)["DDV-O"];
		expect(doc.n_ddv).toBeUndefined();
		expect(doc.v_ddv).toBeUndefined();
		expect(doc.z_ddv).toBeUndefined();
		expect(doc.representedForeigner).toEqual({ idNumber: "ATU12345678" });
	});

	it("formats money boxes: 0 is emitted as 0.00, negatives keep their sign, and pads/rounds to cents", () => {
		const doc = parse(
			serializeDdvO({
				...sampleReturn,
				fields: { f11: 0, f12: -12.5, f13: 1.1, f14: 0.125, f15: 1.005 },
			}),
		)["DDV-O"];
		expect(doc).toMatchObject({
			f11: "0.00", // 0 is a value, not absence: only null/undefined boxes are dropped.
			f12: "-12.50",
			f13: "1.10",
			f14: "0.13", // exactly representable half-cent rounds away from zero
		});
		// Pinned limitation: `toFixed(2)` on a binary float renders 1.005 as
		// "1.00" (1.005 is 1.00499999… in IEEE 754). Callers are expected to pass
		// cent-precise euro amounts; this package does not implement decimal
		// half-up rounding. Revisit if FURS ever specifies rounding of inputs.
		expect(doc.f15).toBe("1.00");
	});

	it("escapes markup in text and survives a parse round-trip", () => {
		const name = 'Foreign & Sons <GmbH> "Wien"';
		const xml = serializeDdvO({
			...sampleReturn,
			contactPersonFullName: name,
			representedForeigner: { idNumber: "ATU1", name },
		});
		const doc = parse(xml)["DDV-O"];
		expect(doc.contactPersonFullName).toBe(name);
		expect(doc.representedForeigner.name).toBe(name);
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
				registrationNumber: "1234567000",
			},
		});
		const env = parse(xml).Envelope;
		expect(env["@_xmlns"]).toBe(NS_DDV_O);
		expect(env["@_xmlns:edp"]).toBe(NS_EDP);
		expect(env["edp:Header"]["edp:taxpayer"]).toEqual({
			"edp:vatNumber": "SI12345678",
			"edp:taxpayerType": "PO",
			"edp:name": "Test d.o.o.",
			// EDP-Common-1.xsd names the company registration number maticnaStevilka.
			"edp:maticnaStevilka": "1234567000",
		});
		expect(env.body["DDV-O"].f51).toBe("1415.00");
		// The nested DDV-O inherits the default namespace (no own xmlns).
		expect(env.body["DDV-O"]["@_xmlns"]).toBeUndefined();
	});

	it("emits taxNumber only when there is no vatNumber (schema choice: exactly one)", () => {
		const opts = { return: sampleReturn };
		const taxOnly = parse(
			buildDdvOEnvelope({ ...opts, taxpayer: { taxNumber: "12345678" } }),
		).Envelope["edp:Header"]["edp:taxpayer"];
		expect(taxOnly).toEqual({ "edp:taxNumber": "12345678" });

		const both = parse(
			buildDdvOEnvelope({
				...opts,
				taxpayer: { taxNumber: "12345678", vatNumber: "SI12345678" },
			}),
		).Envelope["edp:Header"]["edp:taxpayer"];
		expect(both["edp:vatNumber"]).toBe("SI12345678");
		expect(both["edp:taxNumber"]).toBeUndefined();
	});

	it("orders Envelope and body children per the XSD sequence", () => {
		const env = buildDdvOEnvelopeElement({
			return: sampleReturn,
			taxpayer: { taxNumber: "12345678" },
		});
		expectSubsequenceOf(childNames(env), xsdSequence("Envelope"));
		expect(childNames(env)).toEqual(["edp:Header", "edp:Signatures", "body"]);
		const body = env.children!.find((c) => c.name === "body")!;
		expect(childNames(body)).toEqual(["edp:bodyContent", "DDV-O"]);
	});
});
