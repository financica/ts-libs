import { UNREGISTERED_PERSON } from "./types.js";

/** Alphabet the GSTIN checksum works in: base 36, digits then A-Z. */
const CODEPOINTS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * State / union-territory codes, the first two characters of a GSTIN. These are
 * the GST state codes (which follow the 2011 census codes), not ISO 3166-2:IN.
 */
const STATES: Record<string, string> = {
	"01": "Jammu and Kashmir",
	"02": "Himachal Pradesh",
	"03": "Punjab",
	"04": "Chandigarh",
	"05": "Uttarakhand",
	"06": "Haryana",
	"07": "Delhi",
	"08": "Rajasthan",
	"09": "Uttar Pradesh",
	"10": "Bihar",
	"11": "Sikkim",
	"12": "Arunachal Pradesh",
	"13": "Nagaland",
	"14": "Manipur",
	"15": "Mizoram",
	"16": "Tripura",
	"17": "Meghalaya",
	"18": "Assam",
	"19": "West Bengal",
	"20": "Jharkhand",
	"21": "Odisha",
	"22": "Chhattisgarh",
	"23": "Madhya Pradesh",
	"24": "Gujarat",
	"25": "Daman and Diu",
	"26": "Dadra and Nagar Haveli and Daman and Diu",
	"27": "Maharashtra",
	"28": "Andhra Pradesh (old)",
	"29": "Karnataka",
	"30": "Goa",
	"31": "Lakshadweep",
	"32": "Kerala",
	"33": "Tamil Nadu",
	"34": "Puducherry",
	"35": "Andaman and Nicobar Islands",
	"36": "Telangana",
	"37": "Andhra Pradesh",
	"38": "Ladakh",
	"96": "Other Country",
	"97": "Other Territory",
	"99": "Centre Jurisdiction",
};

/** Fourth character of the PAN, identifying the kind of holder. */
const PAN_HOLDER_TYPES: Record<string, string> = {
	A: "Association of Persons",
	B: "Body of Individuals",
	C: "Company",
	F: "Firm / LLP",
	G: "Government",
	H: "Hindu Undivided Family",
	J: "Artificial Juridical Person",
	L: "Local Authority",
	P: "Individual",
	T: "Trust",
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][A-Z0-9][0-9A-Z]$/;

/**
 * The GSTIN check character: a base-36 Luhn variant over the first 14
 * characters, as published by GSTN.
 */
export const gstinCheckCharacter = (gstin: string): string => {
	const mod = CODEPOINTS.length;
	let factor = 2;
	let sum = 0;

	for (let i = gstin.length - 2; i >= 0; i--) {
		const codePoint = CODEPOINTS.indexOf(gstin[i] ?? "");
		if (codePoint < 0) return "";
		const digit = factor * codePoint;
		factor = factor === 2 ? 1 : 2;
		sum += Math.floor(digit / mod) + (digit % mod);
	}

	return CODEPOINTS[(mod - (sum % mod)) % mod] ?? "";
};

/**
 * Whether `value` is a structurally valid GSTIN (format **and** checksum).
 *
 * This says nothing about whether the registration exists or is active; only
 * the GST portal can answer that.
 */
export const isValidGstin = (value: string): boolean => {
	const gstin = value.trim().toUpperCase();
	if (gstin.length !== 15 || !GSTIN_PATTERN.test(gstin)) return false;
	return gstin[14] === gstinCheckCharacter(gstin);
};

/** True for the `URP` placeholder the IRP uses for an unregistered counterparty. */
export const isUnregisteredPerson = (value: string): boolean =>
	value.trim().toUpperCase() === UNREGISTERED_PERSON;

export interface ParsedGstin {
	gstin: string;
	stateCode: string;
	/** Null when the state code is not one we know; the value is still returned. */
	stateName: string | null;
	/** The 10-character PAN embedded at positions 3-12. */
	pan: string;
	/** 4th PAN character, e.g. `C` for a company. */
	panHolderCode: string;
	panHolderType: string | null;
	/**
	 * Registration sequence for this PAN within the state, decoded from the
	 * base-36 13th character. `1` for a first registration.
	 */
	registrationNumber: number;
	checkCharacter: string;
}

/**
 * Split a valid GSTIN into its parts. Returns `null` if the GSTIN does not
 * validate, so a truthy result is always trustworthy.
 */
export const parseGstin = (value: string): ParsedGstin | null => {
	const gstin = value.trim().toUpperCase();
	if (!isValidGstin(gstin)) return null;

	const stateCode = gstin.slice(0, 2);
	const pan = gstin.slice(2, 12);
	const panHolderCode = gstin.slice(5, 6);
	const registrationChar = gstin.slice(12, 13);

	return {
		gstin,
		stateCode,
		stateName: STATES[stateCode] ?? null,
		pan,
		panHolderCode,
		panHolderType: PAN_HOLDER_TYPES[panHolderCode] ?? null,
		registrationNumber: Number.parseInt(registrationChar, 36),
		checkCharacter: gstin.slice(14),
	};
};

/**
 * Whether two GSTINs belong to the same legal entity, i.e. share a PAN.
 *
 * An Indian business holds one GSTIN per state, so the same company appears
 * under different GSTINs in different states. Comparing GSTINs for identity is
 * usually the wrong check; comparing PANs is usually the right one.
 */
export const isSameLegalEntity = (a: string, b: string): boolean => {
	const left = parseGstin(a);
	const right = parseGstin(b);
	return left !== null && right !== null && left.pan === right.pan;
};
