import { NACEBEL } from "nace-codes";

// Initialize NACEBEL classifier
const nacebel = new NACEBEL();

console.log("=== NACEBEL Belgian Extensions ===\n");

// Standard NACE code
const naceCode = nacebel.getCode("01.11");
console.log(`NACE 01.11: ${naceCode?.description.en}`);

// Belgian 5-digit extension
const belCode5 = nacebel.getCode("01.110");
if (belCode5 && "nationalTitles" in belCode5) {
	console.log(`\nNACEBEL 01.110 (5-digit):`);
	console.log(`  NL: ${belCode5.nationalTitles.nl}`);
	console.log(`  FR: ${belCode5.nationalTitles.fr}`);
}

// Belgian 7-digit extension
const belCode7 = nacebel.getCode("01.11001");
if (belCode7 && "nationalTitles" in belCode7) {
	console.log(`\nNACEBEL 01.11001 (7-digit):`);
	console.log(`  NL: ${belCode7.nationalTitles.nl}`);
	console.log(`  FR: ${belCode7.nationalTitles.fr}`);
}

// Get all Belgian extensions for a NACE code
console.log("\n=== Belgian Extensions for NACE 01.11 ===\n");
const extensions = nacebel.getBelgianExtensions("01.11");
console.log(`Found ${extensions.length} Belgian extensions:`);
extensions.slice(0, 5).forEach((ext) => {
	if ("nationalTitles" in ext) {
		console.log(`  ${ext.code}: ${ext.nationalTitles.nl}`);
	}
});

// Navigate hierarchy with NACEBEL codes
console.log("\n=== Hierarchy Navigation ===\n");
const ancestors = nacebel.getAncestors("01.11001");
console.log("Ancestors of 01.11001:");
ancestors.forEach((ancestor) => {
	const desc =
		ancestor.description?.en
		|| ("nationalTitles" in ancestor && ancestor.nationalTitles
			? ancestor.nationalTitles.en
			: "");
	console.log(`  Level ${ancestor.level}: ${ancestor.code} - ${desc}`);
});

// Search in Dutch
console.log("\n=== Search in Dutch ===\n");
const dutchResults = nacebel.search("teelt", { language: "nl", limit: 5 });
console.log("Search results for 'teelt' in Dutch:");
dutchResults.forEach((result) => {
	if ("nationalTitles" in result && result.nationalTitles.nl) {
		console.log(`  ${result.code}: ${result.nationalTitles.nl}`);
	}
});

// Search in French
console.log("\n=== Search in French ===\n");
const frenchResults = nacebel.search("culture", { language: "fr", limit: 5 });
console.log("Search results for 'culture' in French:");
frenchResults.forEach((result) => {
	if ("nationalTitles" in result && result.nationalTitles.fr) {
		console.log(`  ${result.code}: ${result.nationalTitles.fr}`);
	} else if (result.description.fr) {
		console.log(`  ${result.code}: ${result.description.fr}`);
	}
});

// Get all codes at a specific level
console.log("\n=== Level 7 Codes (Sample) ===\n");
const level7Codes = nacebel.getAllCodes(7);
console.log(`Total level 7 codes: ${level7Codes.length}`);
console.log("First 5 level 7 codes:");
level7Codes.slice(0, 5).forEach((code) => {
	if ("nationalTitles" in code) {
		console.log(`  ${code.code}: ${code.nationalTitles.nl}`);
	}
});
