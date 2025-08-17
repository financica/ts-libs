import { NACE } from "nace-codes";

// Initialize NACE classifier
const nace = new NACE();

console.log("=== Basic NACE Usage ===\n");

// Look up a code
const agriculture = nace.getCode("A");
console.log(`Section A: ${agriculture?.description.en}`);

// Get a specific class
const cereals = nace.getCode("01.11");
console.log(`\nClass 01.11: ${cereals?.description.en}`);

// Different input formats work
const consulting1 = nace.getCode("70.20");
const consulting2 = nace.getCode("7020");
console.log(
	`\nAre "70.20" and "7020" the same? ${consulting1?.code === consulting2?.code}`,
);

// Get parent of a code
const parent = nace.getParent("01.11");
console.log(`\nParent of 01.11: ${parent?.code} - ${parent?.description.en}`);

// Get children of a division
const children = nace.getChildren("01");
console.log(`\nChildren of division 01:`);
children.slice(0, 3).forEach((child) => {
	console.log(`  ${child.code}: ${child.description.en}`);
});

// Search for codes
console.log("\n=== Search Functionality ===\n");
const searchResults = nace.search("consultancy", { limit: 3 });
console.log("Search results for 'consultancy':");
searchResults.forEach((result) => {
	console.log(`  ${result.code}: ${result.description.en}`);
});

// Multi-language support
console.log("\n=== Multi-language Support ===\n");
const transport = nace.getCode("H");
if (transport) {
	console.log("Transport and storage in different languages:");
	console.log(`  EN: ${transport.description.en}`);
	console.log(`  FR: ${transport.description.fr}`);
	console.log(`  DE: ${transport.description.de}`);
	console.log(`  NL: ${transport.description.nl}`);
}

// Includes/Excludes information
console.log("\n=== Includes/Excludes Information ===\n");
const vegetables = nace.getCode("01.13");
if (vegetables) {
	console.log(`Code 01.13: ${vegetables.description.en}`);
	if (vegetables.includes) {
		console.log("\nIncludes:");
		console.log(vegetables.includes.substring(0, 200) + "...");
	}
	if (vegetables.excludes) {
		console.log("\nExcludes:");
		console.log(vegetables.excludes.substring(0, 100) + "...");
	}
}
