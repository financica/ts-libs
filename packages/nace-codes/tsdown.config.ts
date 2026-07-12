import { defineConfig } from "tsdown";

export default defineConfig({
	// Core NACE (`.`) and the Belgian NACEBEL extension (`./nacebel`) are
	// separate entry points with disjoint module graphs: importing the core
	// never pulls in Belgian data. Future national extensions follow the same
	// pattern — one entry per country.
	entry: {
		index: "src/index.ts",
		nacebel: "src/nacebel-only.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
