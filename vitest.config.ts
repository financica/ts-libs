import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// One project per package, on vitest defaults: tests live in `test/`
		// (or next to the source as `*.test.ts`) and need no per-package config.
		projects: [`${import.meta.dirname}/packages/*`],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["packages/*/src/**/*.{ts,tsx}"],
			exclude: ["**/*.test.ts", "**/*.spec.ts", "**/src/generated/**"],
		},
	},
});
