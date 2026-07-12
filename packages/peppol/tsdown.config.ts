import { defineConfig } from "tsdown";

export default defineConfig({
	// One entry per public export. `.` is the full toolkit (Node-only SML/SMP
	// discovery); `./schemes`, `./document-types`, and `./countries` are the
	// browser-safe data modules, kept as separate entries so importing one never
	// pulls the Node built-ins in the SMP lookup into a browser bundle.
	entry: {
		index: "src/index.ts",
		schemes: "src/schemes.ts",
		"document-types": "src/document-types.ts",
		countries: "src/countries.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
