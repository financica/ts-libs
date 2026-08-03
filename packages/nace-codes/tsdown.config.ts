import { defineConfig } from "tsdown";
// Explicit extension: tsdown's config loader resolves this natively and does not
// apply TypeScript's extensionless resolution.
import { NACEBEL_NOTE_LANGUAGES, OPTIONAL_LANGUAGES } from "./src/languageList.ts";

// Core NACE (`.`) and the Belgian NACEBEL extension (`./nacebel`) are separate
// entry points with disjoint module graphs: importing the core never pulls in
// Belgian data. Future national extensions follow the same pattern — one entry
// per country.
//
// Each language is its own entry too (`./lang/<code>`, `./nacebel/lang/<code>`),
// holding nothing but a data literal and a type-only import. Translations are
// ~95% of the payload, so a consumer needing one locale must be able to load
// exactly one locale.
const languageEntries: Record<string, string> = {};

for (const language of OPTIONAL_LANGUAGES) {
	languageEntries[`lang/${language}`] = `src/generated/lang/${language}.ts`;
}

for (const language of NACEBEL_NOTE_LANGUAGES) {
	languageEntries[`nacebel/lang/${language}`] =
		`src/generated/nacebel/lang/${language}.ts`;
}

export default defineConfig({
	entry: {
		index: "src/index.ts",
		nacebel: "src/nacebel-only.ts",
		...languageEntries,
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
