import { defineConfig } from "tsdown";

export default defineConfig({
	// Two entry points: the React component surface (`.`) and the CSS source
	// (`./styles`), whose emitted `dist/styles.js` exports `ublInvoiceCss` for
	// scripts/emit-css.mjs to write out as `dist/styles.css`.
	entry: {
		index: "src/index.ts",
		styles: "src/styles.ts",
	},
	format: ["esm"],
	// React, react-dom (incl. /server) and @financica/ubl stay external so the
	// bundle never inlines them. tsdown externalizes deps/peerDeps by default;
	// listing them keeps that guarantee explicit.
	deps: {
		neverBundle: ["react", "react-dom", "react-dom/server", "@financica/ubl"],
	},
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
