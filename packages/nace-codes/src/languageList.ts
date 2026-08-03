// Single source of truth for the language axis. Imported by the data generator
// and the build config as well as by runtime code, so the set of emitted
// per-language modules can never drift from the `Language` type.

/** Every language the EU publishes NACE Rev. 2.1 headings in. */
export const LANGUAGES = [
	"en",
	"fr",
	"de",
	"nl",
	"es",
	"it",
	"pt",
	"bg",
	"cs",
	"da",
	"el",
	"et",
	"fi",
	"ga",
	"hr",
	"hu",
	"lt",
	"lv",
	"mt",
	"pl",
	"ro",
	"sk",
	"sl",
	"sv",
] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

/**
 * The one language that ships inside the default bundle. Everything else is an
 * opt-in module, because the 23 translations are ~95% of the payload.
 */
export const BUNDLED_LANGUAGE = "en";

export type OptionalLanguage = Exclude<LanguageCode, typeof BUNDLED_LANGUAGE>;

/** Languages available as `nace-codes/lang/<code>` modules. */
export const OPTIONAL_LANGUAGES: readonly OptionalLanguage[] = LANGUAGES.filter(
	(language): language is OptionalLanguage => language !== BUNDLED_LANGUAGE,
);

/**
 * Languages the NACEBEL explanatory notes exist in, available as
 * `nace-codes/nacebel/lang/<code>` modules. Belgium's three national languages;
 * the EU set does not apply here.
 */
export const NACEBEL_NOTE_LANGUAGES = [
	"fr",
	"nl",
	"de",
] as const satisfies readonly OptionalLanguage[];
