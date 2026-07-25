import { describe, expect, it } from "vitest";
import type { GstEInvoiceQr } from "../src/index.js";
import { reconcileWithQr } from "../src/index.js";

const qr: GstEInvoiceQr = {
	sellerGstin: "27AAPFU0939F1ZV",
	buyerGstin: "24AAACC1206D1ZM",
	documentNumber: "INV/2026-27/0042",
	documentType: "INV",
	documentDate: "2026-07-15",
	totalInvoiceValue: 118000,
	itemCount: 3,
	mainHsnCode: "998313",
	irn: "afdcc32a0eaa3a054cffcd251884d3e3f4f726b75c8943e7d35fbabc82f05d8a",
	irnDate: "2026-07-15T09:12:44",
};

const statusOf = (result: ReturnType<typeof reconcileWithQr>, field: string) =>
	result.checks.find((check) => check.field === field)?.status;

describe("reconcileWithQr", () => {
	it("is consistent when the extraction agrees", () => {
		const result = reconcileWithQr(qr, {
			supplierTaxId: "27AAPFU0939F1ZV",
			customerTaxId: "24AAACC1206D1ZM",
			invoiceNumber: "INV/2026-27/0042",
			invoiceDate: "2026-07-15",
			totalAmount: 118000,
			lineCount: 3,
		});

		expect(result.consistent).toBe(true);
		expect(result.mismatches).toEqual([]);
		expect(result.comparedCount).toBe(6);
	});

	it("catches a total that does not match the attested value", () => {
		const result = reconcileWithQr(qr, { totalAmount: 11800 });

		expect(result.consistent).toBe(false);
		expect(result.mismatches).toHaveLength(1);
		expect(result.mismatches[0]).toMatchObject({
			field: "totalAmount",
			attested: 118000,
			extracted: 11800,
		});
	});

	it("absorbs sub-paisa rounding but not a real difference", () => {
		expect(reconcileWithQr(qr, { totalAmount: 118000.004 }).consistent).toBe(true);
		expect(reconcileWithQr(qr, { totalAmount: 118000.5 }).consistent).toBe(false);
	});

	it("honours a widened amount tolerance", () => {
		const result = reconcileWithQr(
			qr,
			{ totalAmount: 118000.5 },
			{
				amountTolerance: 1,
			},
		);
		expect(result.consistent).toBe(true);
	});

	it("ignores separator noise in invoice numbers by default", () => {
		expect(
			reconcileWithQr(qr, { invoiceNumber: "INV 2026 27 0042" }).consistent,
		).toBe(true);
	});

	it("compares invoice numbers exactly when loose matching is off", () => {
		expect(
			reconcileWithQr(qr, { invoiceNumber: "INV 2026 27 0042" }, { loose: false })
				.consistent,
		).toBe(false);
	});

	it("still catches a genuinely different invoice number", () => {
		expect(
			reconcileWithQr(qr, { invoiceNumber: "INV/2026-27/0043" }).consistent,
		).toBe(false);
	});

	it("compares only the date part of a timestamped extraction", () => {
		expect(
			reconcileWithQr(qr, { invoiceDate: "2026-07-15T00:00:00.000Z" }).consistent,
		).toBe(true);
	});

	it("reports fields the extraction did not produce as not_extracted", () => {
		const result = reconcileWithQr(qr, { totalAmount: 118000 });

		expect(statusOf(result, "invoiceNumber")).toBe("not_extracted");
		expect(result.comparedCount).toBe(1);
	});

	it("is not consistent when nothing could be compared", () => {
		const result = reconcileWithQr(qr, {});

		expect(result.consistent).toBe(false);
		expect(result.comparedCount).toBe(0);
		expect(result.mismatches).toEqual([]);
	});

	it("explains a same-PAN, different-state supplier GSTIN", () => {
		// One legal entity, two state registrations. Not a mismatch worth alerting on.
		const result = reconcileWithQr(qr, { supplierTaxId: "29AAPFU0939F1ZR" });

		expect(statusOf(result, "supplierTaxId")).toBe("explained");
		expect(result.consistent).toBe(true);
		expect(result.checks.find((c) => c.field === "supplierTaxId")?.note).toMatch(
			/one GSTIN per state/,
		);
	});

	it("treats a different supplier PAN as a real mismatch", () => {
		const result = reconcileWithQr(qr, { supplierTaxId: "24AAACC1206D1ZM" });

		expect(statusOf(result, "supplierTaxId")).toBe("mismatch");
		expect(result.consistent).toBe(false);
	});

	it("explains URP against a foreign buyer's own VAT number", () => {
		// The common case for us: an EU buyer, so the IRP holds no GSTIN for them.
		const result = reconcileWithQr(
			{ ...qr, buyerGstin: "URP" },
			{ customerTaxId: "BE0123456789" },
		);

		expect(statusOf(result, "customerTaxId")).toBe("explained");
		expect(result.consistent).toBe(true);
	});

	it("compares a separately extracted IRN case-insensitively", () => {
		expect(reconcileWithQr(qr, { irn: qr.irn.toUpperCase() }).consistent).toBe(
			true,
		);
		expect(reconcileWithQr(qr, { irn: `${qr.irn.slice(0, 63)}b` }).consistent).toBe(
			false,
		);
	});

	it("catches a QR lifted from a different invoice", () => {
		// Everything on the page belongs to one document, the QR to another.
		const result = reconcileWithQr(qr, {
			invoiceNumber: "INV/2026-27/0099",
			invoiceDate: "2026-06-01",
			totalAmount: 59000,
			lineCount: 1,
		});

		expect(result.mismatches.map((check) => check.field)).toEqual([
			"invoiceNumber",
			"invoiceDate",
			"totalAmount",
			"lineCount",
		]);
	});
});
