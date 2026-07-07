// ---------------------------------------------------------------------------
// Belgian annual client listing (ClientListingConsignment) generation.
//
// The client listing reports each Belgian VAT-registered customer's yearly
// turnover and VAT. Filed on Intervat like the periodic return, but a distinct
// XML schema: http://www.minfin.fgov.be/ClientListingConsignment (which imports
// InputCommon). Here the consignment namespace is the default and the Declarant's
// child elements carry the `common:` prefix.
// ---------------------------------------------------------------------------

import { escapeXmlAttr, escapeXmlText } from "./xml-escape";

const LISTING_NS = "http://www.minfin.fgov.be/ClientListingConsignment";
const COMMON_NS = "http://www.minfin.fgov.be/InputCommon";

export interface ClientListingDeclarant {
	/** VAT number without the `BE` prefix. Emitted verbatim (may be empty). */
	vatNumber: string;
	name?: string;
	street?: string;
	postCode?: string;
	city?: string;
	countryCode?: string;
	email?: string;
	phone?: string;
}

export interface ClientListingClient {
	/** Customer VAT number without country prefix. */
	vatNumber: string;
	/** ISO country code that issued the VAT number, e.g. "BE". */
	countryCode: string;
	/** Yearly turnover excl. VAT. */
	turnover: number;
	/** Yearly VAT amount. */
	vatAmount: number;
}

export interface ClientListingInput {
	declarant: ClientListingDeclarant;
	/** Reporting year, e.g. 2025. */
	period: number;
	clients: ClientListingClient[];
	/** Position within the consignment. Defaults to 1. */
	sequenceNumber?: number;
}

function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		throw new Error(`Client listing amount must be finite, received ${value}`);
	}
	return value.toFixed(2);
}

function declarantChildren(declarant: ClientListingDeclarant): string[] {
	// Declarant children live in the InputCommon namespace (common: prefix).
	const el = (name: string, text: string) =>
		`<common:${name}>${escapeXmlText(text)}</common:${name}>`;
	const children = [
		el("VATNumber", declarant.vatNumber),
		el("Name", declarant.name ?? ""),
		el("Street", declarant.street ?? ""),
		el("PostCode", declarant.postCode ?? ""),
		el("City", declarant.city ?? ""),
		el("CountryCode", declarant.countryCode ?? ""),
	];
	if (declarant.email) children.push(el("EmailAddress", declarant.email));
	if (declarant.phone) children.push(el("Phone", declarant.phone));
	return children;
}

/**
 * Render a Belgian annual client listing to Intervat ClientListingConsignment
 * XML. Per-listing totals (client count, turnover, VAT) are derived from the
 * client rows.
 */
export function generateClientListingXml(input: ClientListingInput): string {
	const { declarant, period, clients, sequenceNumber = 1 } = input;

	if (!Number.isInteger(period) || period < 1000 || period > 9999) {
		throw new Error(
			`Client listing period must be a 4-digit year, received ${period}`,
		);
	}
	if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
		throw new Error(
			`sequenceNumber must be a positive integer, received ${sequenceNumber}`,
		);
	}

	const turnOverSum = clients.reduce((sum, c) => sum + c.turnover, 0);
	const vatAmountSum = clients.reduce((sum, c) => sum + c.vatAmount, 0);

	const lines: string[] = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<ClientListingConsignment xmlns="${LISTING_NS}" xmlns:common="${COMMON_NS}" ClientListingsNbr="1">`,
		`\t<ClientListing SequenceNumber="${sequenceNumber}" ClientsNbr="${clients.length}" TurnOverSum="${formatAmount(turnOverSum)}" VATAmountSum="${formatAmount(vatAmountSum)}">`,
		`\t\t<Declarant>`,
	];
	for (const child of declarantChildren(declarant)) lines.push(`\t\t\t${child}`);
	lines.push(`\t\t</Declarant>`);
	lines.push(`\t\t<Period>${period}</Period>`);
	lines.push(`\t\t<TurnOver>${formatAmount(turnOverSum)}</TurnOver>`);
	clients.forEach((client, index) => {
		lines.push(`\t\t<Client SequenceNumber="${index + 1}">`);
		lines.push(
			`\t\t\t<CompanyVATNumber issuedBy="${escapeXmlAttr(client.countryCode)}">${escapeXmlText(client.vatNumber)}</CompanyVATNumber>`,
		);
		lines.push(`\t\t\t<TurnOver>${formatAmount(client.turnover)}</TurnOver>`);
		lines.push(`\t\t\t<VATAmount>${formatAmount(client.vatAmount)}</VATAmount>`);
		lines.push(`\t\t</Client>`);
	});
	lines.push(`\t</ClientListing>`);
	lines.push(`</ClientListingConsignment>`);
	return lines.join("\n");
}
