// Every package ships a CHANGELOG.md whose first version heading matches the
// package.json version. An `## Unreleased` section may sit above it while work
// is in flight. Run by `bun run ci`.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const packagesDir = join(import.meta.dirname, "..", "packages");
const failures: string[] = [];

for (const name of readdirSync(packagesDir).sort()) {
	const dir = join(packagesDir, name);
	const pkgPath = join(dir, "package.json");
	if (!existsSync(pkgPath)) continue;
	const { version } = JSON.parse(readFileSync(pkgPath, "utf8")) as {
		version: string;
	};
	const changelogPath = join(dir, "CHANGELOG.md");
	if (!existsSync(changelogPath)) {
		failures.push(`${name}: no CHANGELOG.md`);
		continue;
	}
	const headings = [
		...readFileSync(changelogPath, "utf8").matchAll(/^## (\S+)/gm),
	].map((m) => m[1]);
	const first = headings[0] === "Unreleased" ? headings[1] : headings[0];
	if (first !== version) {
		failures.push(
			`${name}: package.json is ${version} but CHANGELOG.md's first release heading is ${first ?? "missing"}`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("changelogs in sync");
