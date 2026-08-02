import { defineConfig } from "tsdown";

export default defineConfig({
	// Two entry points mirroring the package exports: the top-level barrel (`.`)
	// and the DDV-O subpath (`./ddv-o`). Output paths must match package.json.
	entry: {
		index: "src/index.ts",
		"ddv-o/index": "src/ddv-o/index.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
