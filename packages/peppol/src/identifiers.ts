/**
 * Peppol participant identifier normalization.
 *
 * A participant identifier is `<scheme>:<value>`, and the SML name that locates
 * the participant's SMP is `base32(sha256(lowercase("<scheme>:<value>")))`
 * (Peppol Policy for use of Identifiers 4.4.0, POLICY 7). Hashing is exact:
 * **every character added or removed addresses a different participant.** So
 * normalization has to be scheme-aware, not a blanket strip.
 *
 * What the policy allows in a value (POLICY 1): letters, digits, and the four
 * unreserved marks `-` `.` `_` `~`; 1–130 characters; whitespace is never legal.
 * Values are compared case-insensitively (POLICY 2) — but we do not case-fold
 * here, because {@link buildSmlHostname} lowercases before hashing and callers
 * display the identifier as the party wrote it.
 *
 * Rule: drop whitespace and anything outside the legal repertoire always; drop
 * the separators `-` `.` `_` `~` **only** for schemes whose registered structure
 * has no separator, where they can only be typing decoration (`0762.747.721` →
 * `0762747721`). Every other scheme — and every scheme we have not catalogued —
 * is preserved verbatim. Stripping a German Leitweg-ID `0204:991-07335-68` down
 * to `0204:9910733568` yields NXDOMAIN and a false "not reachable"; the default
 * must fail safe, so a scheme added to the code list next year keeps its value.
 *
 * Free of Node built-ins, so it is safe to import in a browser bundle.
 */

/** Characters a participant identifier value may legally contain (POLICY 1). */
const ILLEGAL_VALUE_CHARS = /[^A-Za-z0-9.\-_~]/g;

/** The four unreserved marks POLICY 1 permits, and the only ones we ever drop. */
const SEPARATORS = /[.\-_~]/g;

export interface PeppolParticipantScheme {
	/** ISO 6523 ICD / Peppol EAS code, e.g. `"0208"`. */
	scheme: string;
	/** eDEC code-list `schemeid`, e.g. `"BE:EN"`. */
	schemeId: string;
	/**
	 * The registered value structure as a format expression (digits, fixed
	 * prefixes and literal separators), condensed from the `structure` and
	 * `display` fields of the Peppol Code List "Participant identifier schemes"
	 * v9.7. Deliberately not prose: a separator that appears here is a separator
	 * the registered identifier really carries.
	 */
	structure: string;
	/**
	 * True when {@link structure} carries no separator, so a `-` `.` `_` `~` in
	 * user input is formatting noise to drop. False (and the default for any
	 * scheme absent from this table) means preserve the value verbatim.
	 */
	separatorFree: boolean;
}

/**
 * VAT-based EAS schemes (`<CC>:VAT` in the code list). A VAT registration number
 * is a country prefix plus alphanumerics with no separator anywhere in the EU —
 * the code list leaves `structure` empty for most of them, so the rule is stated
 * here rather than copied. `0213` (FI:VAT) and `9955` (SE:VAT) were removed from
 * the code list but are still mapped by `PEPPOL_COUNTRY_SCHEMES`.
 */
const VAT_SCHEMES: Record<string, string> = {
	"0213": "FI:VAT",
	"0248": "OM:VAT",
	"9906": "IT:VAT",
	"9909": "NO:VAT",
	"9910": "HU:VAT",
	"9912": "EU:VAT",
	"9914": "AT:VAT",
	"9920": "ES:VAT",
	"9922": "AD:VAT",
	"9923": "AL:VAT",
	"9924": "BA:VAT",
	"9925": "BE:VAT",
	"9926": "BG:VAT",
	"9927": "CH:VAT",
	"9928": "CY:VAT",
	"9929": "CZ:VAT",
	"9930": "DE:VAT",
	"9931": "EE:VAT",
	"9932": "GB:VAT",
	"9933": "GR:VAT",
	"9934": "HR:VAT",
	"9935": "IE:VAT",
	"9936": "LI:VAT",
	"9937": "LT:VAT",
	"9938": "LU:VAT",
	"9939": "LV:VAT",
	"9940": "MC:VAT",
	"9941": "ME:VAT",
	"9942": "MK:VAT",
	"9943": "MT:VAT",
	"9944": "NL:VAT",
	"9945": "PL:VAT",
	"9946": "PT:VAT",
	"9947": "RO:VAT",
	"9948": "RS:VAT",
	"9949": "SI:VAT",
	"9950": "SK:VAT",
	"9951": "SM:VAT",
	"9952": "TR:VAT",
	"9953": "VA:VAT",
	"9955": "SE:VAT",
	"9957": "FR:VAT",
};

/**
 * Value structures for the schemes we make a normalization claim about. Absence
 * from this table is not an error: an uncatalogued scheme is simply preserved
 * verbatim, which is always the safe reading of POLICY 1.
 */
export const PEPPOL_PARTICIPANT_SCHEMES: readonly PeppolParticipantScheme[] = [
	// --- Separator-free national registers -------------------------------------
	{
		scheme: "0007",
		schemeId: "SE:ORGNR",
		structure: "10 digits",
		separatorFree: true,
	},
	{ scheme: "0088", schemeId: "GLN", structure: "13 digits", separatorFree: true },
	{ scheme: "0096", schemeId: "DK:P", structure: "10 digits", separatorFree: true },
	{ scheme: "0106", schemeId: "NL:KVK", structure: "17 digits", separatorFree: true },
	{
		scheme: "0184",
		schemeId: "DK:DIGST",
		structure: "8 digits",
		separatorFree: true,
	},
	{
		scheme: "0190",
		schemeId: "NL:OINO",
		structure: "20 digits",
		separatorFree: true,
	},
	{ scheme: "0192", schemeId: "NO:ORG", structure: "9 digits", separatorFree: true },
	{
		scheme: "0198",
		schemeId: "DK:ERST",
		structure: "DK + 8 digits",
		separatorFree: true,
	},
	{ scheme: "0208", schemeId: "BE:EN", structure: "10 digits", separatorFree: true },
	{
		scheme: "0211",
		schemeId: "IT:IVA",
		structure: "IT + 11 digits",
		separatorFree: true,
	},
	{
		scheme: "0216",
		schemeId: "FI:OVT2",
		// "the Business ID without a hyphen", plus an optional free suffix.
		structure: "0037 + 8 digits + up to 5 alphanumerics",
		separatorFree: true,
	},
	{ scheme: "0240", schemeId: "LU:MAT", structure: "11 digits", separatorFree: true },

	// --- Separator-bearing schemes: preserve verbatim ---------------------------
	{
		scheme: "0204",
		schemeId: "DE:LWID",
		// Leitweg-ID, e.g. `991-07335-68`. Stripping the hyphens is the live bug
		// this table exists to prevent.
		structure: "up to 12 digits + '-' + up to 30 alphanumerics + '-' + 2 digits",
		separatorFree: false,
	},
	{
		scheme: "0225",
		schemeId: "FR:CTC",
		// Only constrained to POLICY 1's repertoire, which includes the marks.
		structure: "up to 130 characters from A-Z a-z 0-9 . - _ ~",
		separatorFree: false,
	},
	{
		scheme: "0246",
		schemeId: "DE:GEBA",
		structure: "DE[0-9]{9}(-[0-9]{5})?(\\.[0-9A-Z]{1,8})?",
		separatorFree: false,
	},
	...Object.entries(VAT_SCHEMES).map(([scheme, schemeId]) => ({
		scheme,
		schemeId,
		structure: "country prefix (2 letters) + alphanumerics",
		separatorFree: true,
	})),
];

const BY_SCHEME = new Map(
	PEPPOL_PARTICIPANT_SCHEMES.map((entry) => [entry.scheme, entry]),
);

/** The scheme's catalogued structure, or null when we have not catalogued it. */
export const getPeppolParticipantScheme = (
	scheme: string | null | undefined,
): PeppolParticipantScheme | null => BY_SCHEME.get((scheme ?? "").trim()) ?? null;

/**
 * Normalize a participant identifier *value* for its scheme.
 *
 * Always removes whitespace and characters outside POLICY 1's repertoire. Then
 * removes `-` `.` `_` `~` only when the scheme's registered structure has none,
 * so `0208:0762.747.721` becomes `0208:0762747721` while the German Leitweg-ID
 * `0204:991-07335-68` and every uncatalogued scheme survive intact.
 */
export const normalizeParticipantValue = (scheme: string, value: string): string => {
	const cleaned = value.trim().replace(/\s+/g, "").replace(ILLEGAL_VALUE_CHARS, "");
	return getPeppolParticipantScheme(scheme)?.separatorFree
		? cleaned.replace(SEPARATORS, "")
		: cleaned;
};

/** Human participant id, e.g. `9925:BE0123456789`. */
export const buildParticipantId = (scheme: string, value: string) =>
	`${scheme.trim()}:${normalizeParticipantValue(scheme, value)}`;
