import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Each package keeps its own vitest.config.ts where it needs one
		// (different test locations, jsdom, coverage tweaks); packages without
		// one run on vitest defaults.
		projects: ["packages/*"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["packages/*/src/**/*.{ts,tsx}"],
			exclude: ["**/*.test.ts", "**/*.spec.ts", "**/src/generated/**"],
		},
	},
});
