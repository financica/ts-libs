import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/schemes.ts", "src/document-types.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
});
