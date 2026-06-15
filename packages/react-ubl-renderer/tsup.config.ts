import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/styles.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	external: ["react", "react-dom", "react-dom/server", "@financica/ubl"],
	esbuildOptions(options) {
		options.jsx = "automatic";
	},
});
