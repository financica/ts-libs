#!/usr/bin/env bun
import { $ } from "bun";

// First generate the data modules
await $`bun run generate:data`;

// Clean dist directory
await $`rm -rf dist`;
await $`mkdir -p dist`;

// Build configurations for each entry point
const entryPoints = [
	{
		name: "index",
		entry: "./src/index.ts",
		outfile: "./dist/index.js",
	},
	{
		name: "nace",
		entry: "./src/nace-only.ts",
		outfile: "./dist/nace.js",
	},
	{
		name: "nacebel",
		entry: "./src/nacebel-only.ts",
		outfile: "./dist/nacebel.js",
	},
];

console.log("Building library with bun bundler...");

for (const { name, entry } of entryPoints) {
	console.log(`  Building ${name}...`);

	await Bun.build({
		entrypoints: [entry],
		outdir: "./dist",
		target: "node",
		format: "esm",
		naming: `[dir]/${name}.js`,
		minify: false,
		splitting: true,
		sourcemap: "external",
		external: [], // Bundle everything including generated data
	});
}

// Generate TypeScript declarations using tsc
console.log("Generating TypeScript declarations...");
await $`tsc --emitDeclarationOnly --declaration --declarationMap`;

console.log("✅ Build complete!");
