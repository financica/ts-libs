import { describe, expect, it } from "vitest";
import { type ContraSide, contraSideForCode, isContraCode } from "../src/contra.js";

describe("contraSideForCode", () => {
	// Codes and sides read off the PCMN, where each of these is printed "(–)".
	const contra: [string, ContraSide][] = [
		["101", "debit"], // Capital non appelé
		["14", "debit"], // Bénéfice (Perte) reporté(e)
		["19", "debit"], // Avance aux associés
		["2801", "credit"], // Montants non appelés
		["419", "credit"], // Réductions de valeur actées
		["511", "credit"],
		["561", "credit"], // Chèques émis
		["608", "credit"], // Remises obtenues
		["6511", "credit"], // Reprises de réductions de valeur
		["659", "credit"], // Charges financières portées à l'actif
		["66201", "credit"],
		["708", "debit"], // Remises accordées
	];

	it.each(contra)("reads %s as a %s-side contra rubric", (code, side) => {
		expect(contraSideForCode(code)).toBe(side);
		expect(isContraCode(code)).toBe(true);
	});

	it("treats a sub-account of a contra rubric as contra", () => {
		expect(contraSideForCode("1010")).toBe("debit");
		expect(contraSideForCode("4190")).toBe("credit");
	});

	it("applies the …9 convention to accumulated depreciation, including minted sub-accounts", () => {
		// The register mints 2409 against a 240 cost account, 2009 against 200.
		expect(contraSideForCode("2409")).toBe("credit");
		expect(contraSideForCode("2009")).toBe("credit");
		expect(contraSideForCode("2209")).toBe("credit");
		expect(contraSideForCode("24091")).toBe("credit");
	});

	it("leaves ordinary rubrics alone", () => {
		// 100 issued capital, 240 the cost account 2409 offsets, 2800 the
		// participation 2801 offsets, 560 beside 561, 600/700 ordinary P&L.
		for (const code of ["100", "13", "240", "2800", "560", "600", "700", "5500"]) {
			expect(contraSideForCode(code)).toBeNull();
			expect(isContraCode(code)).toBe(false);
		}
	});

	it("returns null for an empty or blank code", () => {
		expect(contraSideForCode("")).toBeNull();
		expect(contraSideForCode("   ")).toBeNull();
	});
});
