export function normalizeCode(code: string): string {
	const trimmed = code.trim();

	if (trimmed.length === 1 && /[A-Za-z]/.test(trimmed)) {
		return trimmed.toUpperCase();
	}

	return trimmed.replace(/\./g, "");
}

export function determineLevel(code: string): number {
	const normalized = normalizeCode(code);

	if (normalized.length === 1 && /[A-Z]/.test(normalized)) {
		return 1;
	}

	if (normalized.length === 2) {
		return 2;
	}

	if (normalized.length === 3) {
		return 3;
	}

	if (normalized.length === 4) {
		return 4;
	}

	if (normalized.length === 5) {
		return 5;
	}

	if (normalized.length === 7) {
		return 7;
	}

	return 0;
}

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
	G: ["45", "46", "47"],
	H: ["49", "50", "51", "52", "53"],
	I: ["55", "56"],
	J: ["58", "59", "60", "61", "62", "63"],
	K: ["64", "65", "66"],
	L: ["68"],
	M: ["69", "70", "71", "72", "73", "74", "75"],
	N: ["77", "78", "79", "80", "81", "82"],
	O: ["84"],
	P: ["85"],
	Q: ["86", "87", "88"],
	R: ["90", "91", "92", "93"],
	S: ["94", "95", "96"],
	T: ["97", "98"],
	U: ["99"],
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

export function formatCodeForDisplay(code: string, level: number): string {
	if (level === 1) {
		return code;
	}
	if (level === 2) {
		return code;
	}
	if (level === 3) {
		return `${code.substring(0, 2)}.${code.substring(2)}`;
	}
	if (level === 4) {
		return `${code.substring(0, 2)}.${code.substring(2)}`;
	}
	if (level === 5) {
		return `${code.substring(0, 2)}.${code.substring(2)}`;
	}
	if (level === 7) {
		return `${code.substring(0, 2)}.${code.substring(2)}`;
	}
	return code;
}
