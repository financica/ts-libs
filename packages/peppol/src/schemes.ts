/**
 * Peppol electronic address scheme (EAS / ISO 6523 ICD) per country, for
 * addressing a participant in a reachability lookup.
 *
 * Scheme choice rule: use the country's VAT-based EAS scheme by default (the
 * identifier most cross-border senders address by), and fall back to the
 * national registry scheme only where there is no separate VAT EAS in common
 * Peppol use — Norway (org.nr `0192`) and Denmark (CVR `0184`).
 *
 * Codes verified against the Peppol BIS Billing 3.0 EAS code list
 * (https://docs.peppol.eu/poacc/billing/3.0/codelist/eas/). `example` is an
 * illustrative identifier value (format only), handy for input placeholders.
 *
 * Free of Node built-ins, so it is safe to import in a browser bundle.
 */
export interface PeppolCountryScheme {
	/** ISO 3166-1 alpha-2 country code. */
	country: string;
	/** EAS scheme used to address this country's businesses on Peppol. */
	scheme: string;
	/** Example identifier value (format only), e.g. for an input placeholder. */
	example: string;
}

export const PEPPOL_COUNTRY_SCHEMES: PeppolCountryScheme[] = [
	{ country: "AT", scheme: "9914", example: "ATU12345678" },
	{ country: "BE", scheme: "9925", example: "BE0123456789" },
	{ country: "BG", scheme: "9926", example: "BG123456789" },
	{ country: "HR", scheme: "9934", example: "HR12345678901" },
	{ country: "CY", scheme: "9928", example: "CY12345678X" },
	{ country: "CZ", scheme: "9929", example: "CZ12345678" },
	{ country: "DE", scheme: "9930", example: "DE123456789" },
	{ country: "DK", scheme: "0184", example: "12345678" },
	{ country: "EE", scheme: "9931", example: "EE123456789" },
	{ country: "ES", scheme: "9920", example: "ESA12345678" },
	{ country: "FI", scheme: "0213", example: "FI12345678" },
	{ country: "FR", scheme: "9957", example: "FR40303265045" },
	{ country: "GB", scheme: "9932", example: "GB123456789" },
	{ country: "GR", scheme: "9933", example: "EL123456789" },
	{ country: "HU", scheme: "9910", example: "HU12345678" },
	{ country: "IE", scheme: "9935", example: "IE1234567X" },
	{ country: "IT", scheme: "0211", example: "12345678901" },
	{ country: "LT", scheme: "9937", example: "LT123456789" },
	{ country: "LU", scheme: "9938", example: "LU12345678" },
	{ country: "LV", scheme: "9939", example: "LV12345678901" },
	{ country: "MT", scheme: "9943", example: "MT12345678" },
	{ country: "NL", scheme: "9944", example: "NL123456789B01" },
	{ country: "NO", scheme: "0192", example: "915933149" },
	{ country: "PL", scheme: "9945", example: "PL1234567890" },
	{ country: "PT", scheme: "9946", example: "PT123456789" },
	{ country: "RO", scheme: "9947", example: "RO1234567890" },
	{ country: "SE", scheme: "9955", example: "SE556123456701" },
	{ country: "SI", scheme: "9949", example: "SI12345678" },
	{ country: "SK", scheme: "9950", example: "SK1234567890" },
	{ country: "CH", scheme: "9927", example: "CHE123456789" },
];

const BY_COUNTRY = new Map(
	PEPPOL_COUNTRY_SCHEMES.map((entry) => [entry.country, entry]),
);

/** The addressing scheme for a country, or null when it isn't on the list. */
export const getPeppolCountryScheme = (
	country: string | null | undefined,
): PeppolCountryScheme | null =>
	BY_COUNTRY.get((country ?? "").trim().toUpperCase()) ?? null;
