import { defineConfig } from "tsdown";

export default defineConfig({
	// Each public subpath (".", "./parse", "./generate", "./pdf", "./render")
	// is its own entry so the emitted dist layout matches the package.json
	// exports map one-to-one (dist/index.js, dist/parse/index.js, ...).
	entry: {
		index: "src/index.ts",
		"parse/index": "src/parse/index.ts",
		"generate/index": "src/generate/index.ts",
		"pdf/index": "src/pdf/index.ts",
		"render/index": "src/render/index.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
