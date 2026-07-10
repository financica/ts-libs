import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
	{
		ignores: ["dist/", "src/render/fonts.ts", "src/pdf/icc.ts"],
	},
	{
		extends: [...tseslint.configs.strictTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mjs",
						"tsup.config.ts",
						"vitest.config.ts",
					],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/no-unnecessary-condition": "off",
		},
	},
	{
		files: ["test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-non-null-assertion": "off",
		},
	},
]);
