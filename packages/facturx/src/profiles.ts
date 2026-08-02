/**
 * Factur-X / ZUGFeRD profile identifiers (BT-24 guideline URNs) and helpers
 * to classify the guideline found in a document.
 */

export type FacturXProfile =
	| "minimum"
	| "basic-wl"
	| "basic"
	| "en16931"
	| "extended"
	| "xrechnung";

/** Canonical guideline URN per profile (current Factur-X 1.0.7 / XRechnung 3.0). */
export const PROFILE_URNS: Record<FacturXProfile, string> = {
	minimum: "urn:factur-x.eu:1p0:minimum",
	"basic-wl": "urn:factur-x.eu:1p0:basicwl",
	basic: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
	en16931: "urn:cen.eu:en16931:2017",
	extended: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
	xrechnung: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
};

/**
 * Conformance level string used in the PDF/A XMP metadata
 * (fx:ConformanceLevel), per the Factur-X specification.
 */
export const PROFILE_CONFORMANCE_LEVELS: Record<FacturXProfile, string> = {
	minimum: "MINIMUM",
	"basic-wl": "BASIC WL",
	basic: "BASIC",
	en16931: "EN 16931",
	extended: "EXTENDED",
	xrechnung: "XRECHNUNG",
};

/**
 * Classify a guideline URN (BT-24). Recognizes every Factur-X / ZUGFeRD 2.x
 * profile and all XRechnung CIUS versions (1.2 through 3.x, both the legacy
 * `xoev-de` and current `xeinkauf.de` namespaces). Returns undefined for
 * unrelated guidelines.
 */
export const detectProfile = (
	guideline: string | undefined,
): FacturXProfile | undefined => {
	if (!guideline) return undefined;
	const urn = guideline.trim().toLowerCase();
	if (urn === PROFILE_URNS.minimum) return "minimum";
	if (urn === PROFILE_URNS["basic-wl"]) return "basic-wl";
	if (urn === PROFILE_URNS.basic) return "basic";
	if (urn.includes(":kosit:") && urn.includes("xrechnung")) return "xrechnung";
	if (urn.startsWith("urn:cen.eu:en16931:2017#conformant#")) return "extended";
	if (urn === PROFILE_URNS.en16931 || urn.startsWith("urn:cen.eu:en16931:2017#")) {
		return "en16931";
	}
	return undefined;
};

/** Profiles that carry invoice lines (everything above MINIMUM / BASIC WL). */
export const profileHasLines = (profile: FacturXProfile): boolean =>
	profile !== "minimum" && profile !== "basic-wl";
