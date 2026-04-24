/**
 * Download the latest ISO 4217 XML lists from SIX Group.
 *
 * list-one.xml   — active currency codes
 * list-three.xml — historic (withdrawn) currency codes
 *
 * After running this, execute `npm run generate` to re-emit src/data.ts et al.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = [
	{
		url: "https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml",
		file: "list-one.xml",
	},
	{
		url: "https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-three.xml",
		file: "list-three.xml",
	},
] as const;

async function main(): Promise<void> {
	const here = dirname(fileURLToPath(import.meta.url));
	const dataDir = resolve(here, "..", "data");
	await mkdir(dataDir, { recursive: true });

	for (const { url, file } of SOURCES) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch ${url}: ${response.status} ${response.statusText}`,
			);
		}
		const xml = await response.text();
		const target = resolve(dataDir, file);
		await writeFile(target, xml, "utf8");
		console.log(`  ✓ ${file} (${xml.length} bytes)`);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
