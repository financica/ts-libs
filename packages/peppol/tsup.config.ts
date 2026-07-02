import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/schemes.ts",
		"src/document-types.ts",
		"src/countries.ts",
	],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
});
