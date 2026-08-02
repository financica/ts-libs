import { NACE } from "@financica/nace-codes";

const nace = new NACE();

/**
 * Print a hierarchical tree of NACE codes
 */
function printTree(code: string, indent = 0, maxDepth = 3): void {
	if (indent > maxDepth) return;

	const node = nace.getCode(code);
	if (!node) return;

	const prefix = "  ".repeat(indent) + (indent > 0 ? "├─ " : "");
	console.log(`${prefix}${node.code}: ${node.description.en}`);

	const children = nace.getChildren(code);
	children.forEach((child) => {
		printTree(child.code, indent + 1, maxDepth);
	});
}

console.log("=== NACE Classification Tree ===\n");
console.log("Section A - Agriculture, Forestry and Fishing\n");
printTree("A");

console.log("\n=== Detailed View of Division 01 ===\n");
printTree("01", 0, 4);

console.log("\n=== All Sections Overview ===\n");
const sections = nace.getAllCodes(1);
sections.forEach((section) => {
	console.log(`${section.code}: ${section.description.en}`);
	const divisions = nace.getChildren(section.code);
	console.log(`  └─ ${divisions.length} divisions`);
});

console.log("\n=== Code Statistics ===\n");
const allCodes = nace.getAllCodes();
const byLevel = {
	1: nace.getAllCodes(1).length,
	2: nace.getAllCodes(2).length,
	3: nace.getAllCodes(3).length,
	4: nace.getAllCodes(4).length,
};

console.log(`Total codes: ${allCodes.length}`);
console.log(`Sections (Level 1): ${byLevel[1]}`);
console.log(`Divisions (Level 2): ${byLevel[2]}`);
console.log(`Groups (Level 3): ${byLevel[3]}`);
console.log(`Classes (Level 4): ${byLevel[4]}`);

console.log("\n=== Finding Related Activities ===\n");
const itServices = nace.getCode("62");
if (itServices) {
	console.log(`\nIT Services (${itServices.code}): ${itServices.description.en}`);

	const siblings = nace.getSiblings("62");
	console.log("\nSibling divisions in same section:");
	siblings.slice(0, 5).forEach((sibling) => {
		console.log(`  ${sibling.code}: ${sibling.description.en}`);
	});

	const descendants = nace.getDescendants("62");
	console.log(`\nTotal descendants: ${descendants.length}`);
	console.log("Sample of activities under IT services:");
	descendants.slice(0, 5).forEach((desc) => {
		console.log(`  ${desc.code}: ${desc.description.en}`);
	});
}
