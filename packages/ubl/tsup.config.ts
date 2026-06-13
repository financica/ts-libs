import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/build/index.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
});
