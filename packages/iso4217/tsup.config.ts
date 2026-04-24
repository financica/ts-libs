import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/historic.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	minify: false,
	target: "es2022",
	splitting: false,
	outDir: "dist",
});
