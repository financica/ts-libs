import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/parse/index.ts",
		"src/generate/index.ts",
		"src/pdf/index.ts",
		"src/render/index.ts",
	],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
});
