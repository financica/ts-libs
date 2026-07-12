import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	// The Stripe SDK (peer dep) and the sibling @financica/ubl core (dependency)
	// are auto-externalized by tsdown, so they stay imports rather than being
	// inlined into the bundle.
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
