/** Normalize a code to the internal format ("70.20" -> "7020", "m" -> "M"). */
export function normalizeCode(code: string): string {
	const trimmed = code.trim();

	if (trimmed.length === 1 && /[A-Za-z]/.test(trimmed)) {
		return trimmed.toUpperCase();
	}

	return trimmed.replace(/\./g, "");
}

/** Get the hierarchical level of a code (1 = section ... 4 = class; 5 and 7 are NACEBEL), or 0 if unrecognized. */
export function determineLevel(code: string): number {
	const normalized = normalizeCode(code);

	if (normalized.length === 1) {
		return /[A-Z]/.test(normalized) ? 1 : 0;
	}

	// Level 6 is intentionally absent: NACEBEL goes from 5-digit codes
	// straight to 7-digit ones, so a 6-character code is not a valid level.
	switch (normalized.length) {
		case 2:
		case 3:
		case 4:
		case 5:
		case 7:
			return normalized.length;
		default:
			return 0;
	}
}

// NACE Rev. 2.1 (Regulation (EU) 2023/137): 22 sections A-V, 87 divisions.
// Division 45 was merged into 46/47; sections J-U shifted and V was added.
const DIVISION_TO_SECTION_MAP = {
	A: ["01", "02", "03"],
	B: ["05", "06", "07", "08", "09"],
	C: [
		"10",
		"11",
		"12",
		"13",
		"14",
		"15",
		"16",
		"17",
		"18",
		"19",
		"20",
		"21",
		"22",
		"23",
		"24",
		"25",
		"26",
		"27",
		"28",
		"29",
		"30",
		"31",
		"32",
		"33",
	],
	D: ["35"],
	E: ["36", "37", "38", "39"],
	F: ["41", "42", "43"],
	G: ["46", "47"],
	H: ["49", "50", "51", "52", "53"],
	I: ["55", "56"],
	J: ["58", "59", "60"],
	K: ["61", "62", "63"],
	L: ["64", "65", "66"],
	M: ["68"],
	N: ["69", "70", "71", "72", "73", "74", "75"],
	O: ["77", "78", "79", "80", "81", "82"],
	P: ["84"],
	Q: ["85"],
	R: ["86", "87", "88"],
	S: ["90", "91", "92", "93"],
	T: ["94", "95", "96"],
	U: ["97", "98"],
	V: ["99"],
} as const;

type Section = keyof typeof DIVISION_TO_SECTION_MAP;
type Division = (typeof DIVISION_TO_SECTION_MAP)[Section][number];

const sectionMap: Record<Division, Section> = Object.entries(
	DIVISION_TO_SECTION_MAP,
).reduce(
	(acc, [section, divisions]) => {
		for (const division of divisions) {
			acc[division] = section as Section;
		}
		return acc;
	},
	{} as Record<Division, Section>,
);

function isDivision(code: string): code is Division {
	return code in sectionMap;
}

/** Get the parent code in the hierarchy, or null for sections and unrecognized codes. */
export function getParentCode(code: string): string | null {
	const normalized = normalizeCode(code);
	const level = determineLevel(normalized);

	switch (level) {
		case 7:
			return normalized.substring(0, 5);
		case 5:
			return normalized.substring(0, 4);
		case 4:
			return normalized.substring(0, 3);
		case 3:
			return normalized.substring(0, 2);
		case 2:
			if (isDivision(normalized)) {
				return sectionMap[normalized];
			}
			return null;
		default:
			return null;
	}
}
