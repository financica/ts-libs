import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"examples/**",
			"*.config.ts",
			"**/*.test.ts",
			"**/*.spec.ts",
		],
	},
	js.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: ".",
			},
			globals: {
				process: "readonly",
				console: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": typescript,
		},
		rules: {
			...typescript.configs["strict-type-checked"].rules,
			...typescript.configs["stylistic-type-checked"].rules,
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/strict-boolean-expressions": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/no-unnecessary-condition": "error",
			"@typescript-eslint/prefer-readonly": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-return": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/require-await": "error",
			"@typescript-eslint/await-thenable": "error",
			"no-console": "warn",
		},
	},
];
