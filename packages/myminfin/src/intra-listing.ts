// ---------------------------------------------------------------------------
// Belgian intra-community listing (IntraConsignment) generation.
//
// The listing reports, per period, each EU customer's intra-community supplies:
// goods (L), services (S) and triangular operations (T). It is due whenever
// grids 44, 46 or 48 of the periodic return are filled. XML schema:
// http://www.minfin.fgov.be/IntraConsignment (NewICO-in_v0_9.xsd, which imports
// InputCommon), laid out like the periodic return: InputCommon is the default
// namespace and the consignment's own elements carry the `ns2:` prefix.
// ---------------------------------------------------------------------------

import {
	declarantChildren,
	periodChildren,
	type VatReturnDeclarant,
	type VatReturnPeriod,
} from "./vat-return";
import {
	assertSequenceNumber,
	COMMON_NS,
	escapeXmlAttr,
	escapeXmlText,
	formatAmount as formatSharedAmount,
} from "./xml-escape";

const INTRA_NS = "http://www.minfin.fgov.be/IntraConsignment";

/** L: goods supplied, S: services supplied, T: triangular operation. */
export type IntraListingCode = "L" | "S" | "T";

/** The member-state codes IntraClientVATNumber_Type accepts (MSCountryCodeExclBE). */
const ISSUING_COUNTRIES = new Set([
	"AT",
	"BG",
	"CY",
	"CZ",
	"DK",
	"EE",
	"FI",
	"FR",
	"DE",
	"EL",
	"HU",
	"IE",
	"IT",
	"LV",
	"LT",
	"LU",
	"MT",
	"NL",
	"PL",
	"PT",
	"RO",
	"SK",
	"SI",
	"ES",
	"SE",
	"GB",
	"MC",
	"HR",
	"XI",
	"XU",
]);

export interface IntraListingClient {
	/** Customer VAT number without its country prefix, at most 12 characters. */
	vatNumber: string;
	/** Member state that issued the number (`EL` for Greece, never `BE`). */
	countryCode: string;
	code: IntraListingCode;
	/** Signed amount in EUR: a credit note issued makes it negative. */
	amount: number;
	/**
	 * The period of an earlier listing this line corrects. Only goods (L) and
	 * triangular (T) lines take one; a services correction is netted into the
	 * current period instead.
	 */
	correctingPeriod?: VatReturnPeriod;
}

export interface IntraListingInput {
	declarant: VatReturnDeclarant;
	period: VatReturnPeriod;
	clients: IntraListingClient[];
	/** Position within the consignment. Defaults to 1. */
	sequenceNumber?: number;
	/** Intervat reference of the listing this one replaces (from its receipt). */
	replacedListing?: string;
}

const formatAmount = (value: number): string =>
	formatSharedAmount(value, { label: "Intra-community listing amount" });

/** Normalise and check one customer line against IntraClient_Type. */
function clientChildren(client: IntraListingClient): string[] {
	const countryCode = client.countryCode.toUpperCase();
	if (!ISSUING_COUNTRIES.has(countryCode)) {
		throw new Error(
			`Intra-community listing country must be an EU member state other than BE (EL for Greece), received "${client.countryCode}"`,
		);
	}
	const vatNumber = client.vatNumber.replace(/[\s.-]/g, "").toUpperCase();
	if (vatNumber === "" || vatNumber.length > 12) {
		throw new Error(
			`Intra-community listing VAT number must be 1-12 characters without its country prefix, received "${client.vatNumber}"`,
		);
	}
	if (client.correctingPeriod && client.code === "S") {
		throw new Error(
			"A services (S) line cannot correct an earlier period; net it into the current one",
		);
	}
	const children = [
		`<ns2:CompanyVATNumber issuedBy="${escapeXmlAttr(countryCode)}">${escapeXmlText(vatNumber)}</ns2:CompanyVATNumber>`,
		`<ns2:Code>${client.code}</ns2:Code>`,
		`<ns2:Amount>${formatAmount(client.amount)}</ns2:Amount>`,
	];
	if (client.correctingPeriod) {
		children.push(
			`<ns2:CorrectingPeriod>`,
			...periodChildren(client.correctingPeriod).map((child) => `\t${child}`),
			`</ns2:CorrectingPeriod>`,
		);
	}
	return children;
}

/**
 * Render a Belgian intra-community listing for one declarant and period to
 * Intervat IntraConsignment XML. The client count and amount total are derived
 * from the rows; the schema requires at least one client.
 */
export function generateIntraListingXml(input: IntraListingInput): string {
	const { declarant, period, clients, sequenceNumber = 1, replacedListing } = input;
	assertSequenceNumber(sequenceNumber);
	if (clients.length === 0) {
		throw new Error("An intra-community listing must list at least one client");
	}

	const amountSum = clients.reduce((sum, client) => sum + client.amount, 0);
	const lines: string[] = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<ns2:IntraConsignment IntraListingsNbr="1" xmlns="${COMMON_NS}" xmlns:ns2="${INTRA_NS}">`,
		`\t<ns2:IntraListing SequenceNumber="${sequenceNumber}" ClientsNbr="${clients.length}" AmountSum="${formatAmount(amountSum)}">`,
	];
	if (replacedListing !== undefined) {
		lines.push(
			`\t\t<ns2:ReplacedIntraListing>${escapeXmlText(replacedListing)}</ns2:ReplacedIntraListing>`,
		);
	}
	lines.push(`\t\t<ns2:Declarant>`);
	for (const child of declarantChildren(declarant)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</ns2:Declarant>`);
	lines.push(`\t\t<ns2:Period>`);
	for (const child of periodChildren(period)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</ns2:Period>`);
	clients.forEach((client, index) => {
		lines.push(`\t\t<ns2:IntraClient SequenceNumber="${index + 1}">`);
		for (const child of clientChildren(client)) lines.push(`\t\t\t${child}`);
		lines.push(`\t\t</ns2:IntraClient>`);
	});
	lines.push(`\t</ns2:IntraListing>`);
	lines.push(`</ns2:IntraConsignment>`);
	return lines.join("\n");
}
