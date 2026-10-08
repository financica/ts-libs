import { describe, expect, it } from "vitest";
import {
	BiztaxParseError,
	parseBiztaxFile,
	renderBiztaxReturn,
	wrapBiztax,
	buildBiztaxReturn,
	type BiztaxReadTuple,
} from "../src/index.js";
import ay2026 from "../src/taxonomies/ay2026-rcorp.js";
import ay2026Rle from "../src/taxonomies/ay2026-rle.js";
import { PDF, srl2025Return } from "./fixtures/srl-2025-return.js";

const file = (): string =>
	wrapBiztax([renderBiztaxReturn(buildBiztaxReturn(srl2025Return()))]);

const findTuple = (
	tuples: readonly BiztaxReadTuple[],
	concept: string,
): BiztaxReadTuple | undefined => {
	for (const tuple of tuples) {
		if (tuple.concept === concept) return tuple;
		const nested = findTuple(
			tuple.children.filter((child) => child.kind === "tuple"),
			concept,
		);
		if (nested) return nested;
	}
	return undefined;
};

describe("parseBiztaxFile", () => {
	it("reads a return back with its form codes, labels and dimensions", () => {
		const [read, ...rest] = parseBiztaxFile(file(), [ay2026Rle, ay2026]) ?? [];
		expect(rest).toEqual([]);
		expect(read?.taxonomy).toBe(ay2026);
		expect(read?.entity).toBe("BE0766280697");
		expect(
			read?.items.find(
				(item) =>
					item.concept ===
					"tax-inc:AnnualWorkForceAverageCorporationCodeCurrentTaxPeriod",
			),
		).toMatchObject({
			code: "1872",
			labels: { fr: "Nombre de travailleurs, en moyenne annuelle" },
			value: "1.00",
			unit: "pure",
		});
		const belgian = read?.items.find(
			(item) =>
				item.concept === "tax-inc:RemainingFiscalResultCITRN" &&
				item.dimensions.length > 0,
		);
		expect(belgian?.dimensions).toEqual([
			{
				dimension: "d-origin:OriginDimension",
				member: "d-origin:BelgiumMember",
				labels: expect.objectContaining({ fr: "Belge" }),
			},
		]);
		const reserves = read?.items.filter(
			(item) => item.concept === "tax-inc:TaxableReserves",
		);
		expect(reserves?.map((item) => item.period.type)).toEqual([
			"instant",
			"instant",
		]);
	});

	it("decodes code lists and sets the annexes apart", () => {
		const [read] = parseBiztaxFile(file(), [ay2026]) ?? [];
		expect(
			findTuple(read?.identification ?? [], "pfs-gcd:EntityForm")?.children,
		).toEqual([
			{
				kind: "code",
				list: "pfs-vl:LegalFormCodeHead",
				code: "610",
				labels: expect.objectContaining({
					fr: "Société à responsabilité limitée",
				}),
			},
		]);
		expect(read?.annexes.map((annex) => annex.concept)).toEqual([
			"tax-inc:StatutoryAccounts",
			"tax-inc:GeneralMeetingMinutesDecisions",
		]);
		expect(atob(read?.annexes[0]?.base64 ?? "")).toBe(
			new TextDecoder().decode(PDF),
		);
		expect(
			read?.items.some((item) => item.concept === "tax-inc:StatutoryAccounts"),
		).toBe(false);
	});

	it("returns null for a document that is not a return", () => {
		expect(parseBiztaxFile("<Invoice/>", [ay2026])).toBeNull();
	});

	it("refuses a return under a taxonomy it was not given", () => {
		expect(() => parseBiztaxFile(file(), [ay2026Rle])).toThrow(BiztaxParseError);
	});
});
