import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/charts/index.ts"],
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
