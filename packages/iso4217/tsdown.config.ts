import { defineConfig } from "tsdown";

export default defineConfig({
	// Two entry points with disjoint module graphs: the main entry (`.`) exposes
	// active ISO 4217 currencies, while `./historic` carries the withdrawn-code
	// dataset so it stays out of the main bundle unless explicitly imported.
	entry: {
		index: "src/index.ts",
		historic: "src/historic.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: ({ format }) => ({
		js: format === "cjs" ? ".cjs" : ".js",
		dts: format === "cjs" ? ".d.cts" : ".d.ts",
	}),
});
