import { defineConfig } from "tsdown";

export default defineConfig({
	// One entry per taxonomy module, so that each model is its own file under
	// `dist/taxonomies/` and a consumer bundles only the ones it imports.
	entry: ["src/index.ts", "src/taxonomies/*.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
