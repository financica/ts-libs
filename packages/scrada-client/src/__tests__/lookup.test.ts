import { describe, expect, it, vi } from "vitest";
import { ScradaApiError } from "../errors";
import {
	advertisesPeppolCreditNote,
	advertisesPeppolInvoice,
	isPeppolParticipantRegistered,
	peppolLookupSupportsDocument,
	probePeppolParticipant,
} from "../lookup";
import type { ScradaPeppolLookupResponse } from "../types";

const billingDocType = (kind: "Invoice" | "CreditNote") => ({
	scheme: "busdox-docid-qns",
	value: `urn:oasis:names:specification:ubl:schema:xsd:${kind}-2::${kind}##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1`,
});

const smpLookup = (
	id: string,
	kinds: Array<"Invoice" | "CreditNote">,
): ScradaPeppolLookupResponse => ({
	participantIdentifier: { scheme: "iso6523-actorid-upis", id },
	documentTypes: kinds.map(billingDocType),
});

describe("advertisesPeppolInvoice / advertisesPeppolCreditNote", () => {
	it("matches the BIS Billing 3.0 identifiers and nothing else", () => {
		expect(advertisesPeppolInvoice(billingDocType("Invoice").value)).toBe(true);
		expect(advertisesPeppolInvoice(billingDocType("CreditNote").value)).toBe(false);
		expect(advertisesPeppolCreditNote(billingDocType("CreditNote").value)).toBe(
			true,
		);
		expect(advertisesPeppolCreditNote(billingDocType("Invoice").value)).toBe(false);
	});
});

describe("isPeppolParticipantRegistered", () => {
	it("treats a resolved SMP record as registered even without the legacy flag", () => {
		expect(isPeppolParticipantRegistered(smpLookup("9925:be0206582284", []))).toBe(
			true,
		);
		expect(isPeppolParticipantRegistered({})).toBe(false);
	});

	it("honours an explicit registered flag when present", () => {
		expect(isPeppolParticipantRegistered({ registered: false })).toBe(false);
		expect(isPeppolParticipantRegistered({ registered: true })).toBe(true);
	});
});

describe("peppolLookupSupportsDocument", () => {
	it("derives support from advertised documentTypes when booleans are absent", () => {
		const lookup = smpLookup("9925:be0206582284", ["Invoice"]);
		expect(peppolLookupSupportsDocument("invoice", lookup)).toBe(true);
		expect(peppolLookupSupportsDocument("credit_note", lookup)).toBe(false);
	});

	it("prefers the explicit support flags when present", () => {
		const lookup: ScradaPeppolLookupResponse = {
			registered: true,
			supportInvoice: false,
			supportCreditInvoice: true,
		};
		expect(peppolLookupSupportsDocument("invoice", lookup)).toBe(false);
		expect(peppolLookupSupportsDocument("credit_note", lookup)).toBe(true);
	});
});

describe("probePeppolParticipant", () => {
	it("looks candidates up with the iso6523 participant scheme and the full qualified id", async () => {
		const lookupPeppolParticipant = vi
			.fn()
			.mockResolvedValue(
				smpLookup("9925:be0206582284", ["Invoice", "CreditNote"]),
			);

		const match = await probePeppolParticipant(
			{ lookupPeppolParticipant },
			"co_123",
			["9925:BE0206582284"],
		);

		expect(lookupPeppolParticipant).toHaveBeenCalledWith(
			"co_123",
			"iso6523-actorid-upis",
			"9925:BE0206582284",
		);
		expect(match).toMatchObject({
			identifier: "9925:BE0206582284",
			endpoint: { scheme: "9925", value: "BE0206582284" },
			networkRegistered: true,
			supportInvoice: true,
			supportCreditInvoice: true,
		});
	});

	it("skips 404s and returns the first candidate supporting the document type", async () => {
		const lookupPeppolParticipant = vi
			.fn()
			.mockRejectedValueOnce(new ScradaApiError("not found", 404, null))
			.mockResolvedValueOnce(smpLookup("0208:0206582284", ["Invoice"]));

		const match = await probePeppolParticipant(
			{ lookupPeppolParticipant },
			"co_123",
			["9925:BE0206582284", "0208:0206582284"],
		);

		expect(match?.identifier).toBe("0208:0206582284");
		expect(match?.supportInvoice).toBe(true);
	});

	it("falls back to a registered match that lacks the requested document type", async () => {
		const lookupPeppolParticipant = vi
			.fn()
			.mockResolvedValueOnce(smpLookup("9925:be0206582284", ["Invoice"]))
			.mockRejectedValueOnce(new ScradaApiError("not found", 404, null));

		const match = await probePeppolParticipant(
			{ lookupPeppolParticipant },
			"co_123",
			["9925:BE0206582284", "0208:0206582284"],
			"credit_note",
		);

		expect(match?.identifier).toBe("9925:BE0206582284");
		expect(match?.networkRegistered).toBe(true);
		expect(match?.supportCreditInvoice).toBe(false);
	});

	it("returns null when every candidate 404s or is unparseable", async () => {
		const lookupPeppolParticipant = vi
			.fn()
			.mockRejectedValue(new ScradaApiError("not found", 404, null));

		const match = await probePeppolParticipant(
			{ lookupPeppolParticipant },
			"co_123",
			["not-a-qualified-id", "9925:BE0206582284"],
		);

		expect(match).toBeNull();
		// The unqualified candidate is never sent to Scrada.
		expect(lookupPeppolParticipant).toHaveBeenCalledTimes(1);
	});

	it("rethrows non-404 Scrada errors", async () => {
		const lookupPeppolParticipant = vi
			.fn()
			.mockRejectedValue(new ScradaApiError("boom", 500, null));

		await expect(
			probePeppolParticipant({ lookupPeppolParticipant }, "co_123", [
				"9925:BE0206582284",
			]),
		).rejects.toThrow("boom");
	});
});
