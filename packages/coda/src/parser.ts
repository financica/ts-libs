import type {
	CodaFile,
	CodaStatement,
	CodaAccount,
	CodaBalance,
	CodaMovement,
	CodaTransactionCode,
	CodaInformation,
} from "./types.js";

/**
 * Parse a CODA file content string into a structured {@link CodaFile}.
 * Returns `null` if the input cannot be parsed.
 */
export function parseCoda(content: string): CodaFile | null {
	try {
		const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
		if (lines.length === 0) return null;
		if (lines[0]?.[0] !== "0") return null;

		const groups = groupIntoStatements(lines);
		if (groups.length === 0) return null;

		const statements: CodaStatement[] = [];
		for (const group of groups) {
			const stmt = parseStatementGroup(group);
			if (stmt) statements.push(stmt);
		}

		if (statements.length === 0) return null;
		return { statements };
	} catch {
		return null;
	}
}

// ── Line grouping ─────────────────────────────────────────────────────

function groupIntoStatements(lines: string[]): string[][] {
	const groups: string[][] = [];
	let current: string[] = [];

	for (const line of lines) {
		if (line[0] === "0") {
			if (current.length > 0) groups.push(current);
			current = [line];
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) groups.push(current);
	return groups;
}

// ── Substring helpers (1-indexed, inclusive) ───────────────────────────

function sub(line: string, start: number, end: number): string {
	return line.substring(start - 1, end);
}

function trimSub(line: string, start: number, end: number): string {
	return sub(line, start, end).trim();
}

function numSub(line: string, start: number, end: number): number {
	const s = sub(line, start, end).trim();
	if (s === "") return 0;
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

// ── Value parsers ─────────────────────────────────────────────────────

function parseAmount(signChar: string, amountStr: string): number {
	const raw = Number(amountStr.trim());
	if (!Number.isFinite(raw)) return 0;
	const amount = raw / 1000;
	return signChar === "1" ? -amount : amount;
}

function parseCodaDate(s: string): Date | undefined {
	const t = s.trim();
	if (!t || t === "000000") return undefined;
	const day = Number(t.substring(0, 2));
	const month = Number(t.substring(2, 4));
	const year = Number(t.substring(4, 6));
	if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year))
		return undefined;
	const fullYear = year >= 80 ? 1900 + year : 2000 + year;
	return new Date(fullYear, month - 1, day);
}

function parseTransactionCode(raw: string): CodaTransactionCode {
	return {
		type: Number(raw.substring(0, 1)) || 0,
		family: Number(raw.substring(1, 3)) || 0,
		transaction: Number(raw.substring(3, 5)) || 0,
		category: Number(raw.substring(5, 8)) || 0,
	};
}

// ── Account parsing ───────────────────────────────────────────────────

function parseAccountField(structureCode: string, field: string): CodaAccount {
	switch (structureCode) {
		case "0":
			// Belgian BBAN: 12N account + 1AN blank + 3AN currency + 1N qual + 2AN country + 18AN extension
			return {
				structure: "belgian-bban",
				number: field.substring(0, 12).trim(),
				currency: field.substring(13, 16).trim() || undefined,
				countryCode: field.substring(17, 19).trim() || undefined,
			};
		case "1":
			// Foreign BBAN: 34AN number + 3AN currency
			return {
				structure: "foreign-bban",
				number: field.substring(0, 34).trim(),
				currency: field.substring(34, 37).trim() || undefined,
			};
		case "2":
			// Belgian IBAN: 31AN IBAN + 3AN extension + 3AN currency
			return {
				structure: "belgian-iban",
				number: field.substring(0, 31).trim(),
				currency: field.substring(34, 37).trim() || undefined,
			};
		case "3":
			// Foreign IBAN: 34AN IBAN + 3AN currency
			return {
				structure: "foreign-iban",
				number: field.substring(0, 34).trim(),
				currency: field.substring(34, 37).trim() || undefined,
			};
		default:
			return { structure: "belgian-bban", number: field.trim() };
	}
}

function parseCounterpartyAccount(field: string): {
	number?: string;
	currency?: string;
} {
	const trimmed = field.trimEnd();
	if (!trimmed) return {};

	// Currency is 3 uppercase letters at the end, preceded by whitespace
	const match = /^(.*\S)\s+([A-Z]{3})$/.exec(trimmed);
	if (match?.[1] && match[2]) {
		return { number: match[1], currency: match[2] };
	}
	return { number: trimmed };
}

// ── Communication parsing ─────────────────────────────────────────────

interface ParsedComm {
	rawContent: string;
	communicationType: "structured" | "unstructured";
	structuredCommunicationType?: number;
}

function parseCommunicationField(typeChar: string, field: string): ParsedComm {
	if (typeChar === "1") {
		const code = Number(field.substring(0, 3));
		return {
			rawContent: field.substring(3),
			communicationType: "structured",
			structuredCommunicationType: Number.isFinite(code) ? code : undefined,
		};
	}
	return { rawContent: field, communicationType: "unstructured" };
}

// ── Record-level parsers ──────────────────────────────────────────────

interface HeaderResult {
	creationDate: Date;
	bankId: number;
	isDuplicate: boolean;
	fileReference?: string;
	addressee: string;
	bic?: string;
	companyId?: string;
	separateApplication: string;
	transactionReference?: string;
	relatedReference?: string;
	version: number;
}

function parseHeader(line: string): HeaderResult | null {
	if (line[0] !== "0") return null;
	return {
		creationDate: parseCodaDate(sub(line, 6, 11)) ?? new Date(0),
		bankId: numSub(line, 12, 14),
		isDuplicate: sub(line, 17, 17) === "D",
		fileReference: trimSub(line, 25, 34) || undefined,
		addressee: trimSub(line, 35, 60),
		bic: trimSub(line, 61, 71) || undefined,
		companyId: trimSub(line, 72, 82) || undefined,
		separateApplication: trimSub(line, 84, 88),
		transactionReference: trimSub(line, 89, 104) || undefined,
		relatedReference: trimSub(line, 105, 120) || undefined,
		version: numSub(line, 128, 128),
	};
}

interface OldBalanceResult {
	account: CodaAccount;
	paperStatementSequence: number;
	codaStatementSequence: number;
	accountHolderName?: string;
	accountDescription?: string;
	oldBalance: CodaBalance;
}

function parseOldBalance(line: string): OldBalanceResult | null {
	if (line[0] !== "1") return null;
	return {
		account: parseAccountField(sub(line, 2, 2), sub(line, 6, 42)),
		paperStatementSequence: numSub(line, 3, 5),
		codaStatementSequence: numSub(line, 126, 128),
		accountHolderName: trimSub(line, 65, 90) || undefined,
		accountDescription: trimSub(line, 91, 125) || undefined,
		oldBalance: {
			amount: parseAmount(sub(line, 43, 43), sub(line, 44, 58)),
			date: parseCodaDate(sub(line, 59, 64)) ?? new Date(0),
		},
	};
}

interface Raw21 {
	sequenceNumber: number;
	detailNumber: number;
	bankReference: string;
	amount: number;
	valueDate?: Date;
	entryDate: Date;
	transactionCode: CodaTransactionCode;
	comm: ParsedComm;
	paperStatementSequence: number;
	globalisationCode?: number;
}

function parseRecord21(line: string): Raw21 | null {
	if (line[0] !== "2" || line[1] !== "1") return null;
	const glob = numSub(line, 125, 125);
	return {
		sequenceNumber: numSub(line, 3, 6),
		detailNumber: numSub(line, 7, 10),
		bankReference: trimSub(line, 11, 31),
		amount: parseAmount(sub(line, 32, 32), sub(line, 33, 47)),
		valueDate: parseCodaDate(sub(line, 48, 53)),
		entryDate: parseCodaDate(sub(line, 116, 121)) ?? new Date(0),
		transactionCode: parseTransactionCode(sub(line, 54, 61)),
		comm: parseCommunicationField(sub(line, 62, 62), sub(line, 63, 115)),
		paperStatementSequence: numSub(line, 122, 124),
		globalisationCode: glob > 0 ? glob : undefined,
	};
}

interface Raw22 {
	sequenceNumber: number;
	detailNumber: number;
	commContinuation: string;
	customerReference?: string;
	counterpartyBic?: string;
	rTransactionType?: number;
	rTransactionReason?: string;
	categoryPurpose?: string;
	purpose?: string;
}

function parseRecord22(line: string): Raw22 | null {
	if (line[0] !== "2" || line[1] !== "2") return null;
	const rTypeStr = trimSub(line, 113, 113);
	const rType = rTypeStr ? Number(rTypeStr) : undefined;
	return {
		sequenceNumber: numSub(line, 3, 6),
		detailNumber: numSub(line, 7, 10),
		commContinuation: sub(line, 11, 63),
		customerReference: trimSub(line, 64, 98) || undefined,
		counterpartyBic: trimSub(line, 99, 109) || undefined,
		rTransactionType:
			rType !== undefined && Number.isFinite(rType) ? rType : undefined,
		rTransactionReason: trimSub(line, 114, 117) || undefined,
		categoryPurpose: trimSub(line, 118, 121) || undefined,
		purpose: trimSub(line, 122, 125) || undefined,
	};
}

interface Raw23 {
	sequenceNumber: number;
	detailNumber: number;
	counterpartyAccountField: string;
	counterpartyName: string;
	commContinuation: string;
}

function parseRecord23(line: string): Raw23 | null {
	if (line[0] !== "2" || line[1] !== "3") return null;
	return {
		sequenceNumber: numSub(line, 3, 6),
		detailNumber: numSub(line, 7, 10),
		counterpartyAccountField: sub(line, 11, 47),
		counterpartyName: trimSub(line, 48, 82),
		commContinuation: sub(line, 83, 125),
	};
}

interface Raw31 {
	sequenceNumber: number;
	detailNumber: number;
	bankReference: string;
	transactionCode: CodaTransactionCode;
	comm: ParsedComm;
}

function parseRecord31(line: string): Raw31 | null {
	if (line[0] !== "3" || line[1] !== "1") return null;
	return {
		sequenceNumber: numSub(line, 3, 6),
		detailNumber: numSub(line, 7, 10),
		bankReference: trimSub(line, 11, 31),
		transactionCode: parseTransactionCode(sub(line, 32, 39)),
		comm: parseCommunicationField(sub(line, 40, 40), sub(line, 41, 113)),
	};
}

function parseRecord32Comm(line: string): string | null {
	if (line[0] !== "3" || line[1] !== "2") return null;
	return sub(line, 11, 115);
}

function parseRecord33Comm(line: string): string | null {
	if (line[0] !== "3" || line[1] !== "3") return null;
	return sub(line, 11, 100);
}

function parseNewBalance(line: string): CodaBalance | null {
	if (line[0] !== "8") return null;
	return {
		amount: parseAmount(sub(line, 42, 42), sub(line, 43, 57)),
		date: parseCodaDate(sub(line, 58, 63)) ?? new Date(0),
	};
}

interface TrailerResult {
	totalDebit: number;
	totalCredit: number;
}

function parseTrailer(line: string): TrailerResult | null {
	if (line[0] !== "9") return null;
	return {
		totalDebit: Number(sub(line, 23, 37).trim()) / 1000 || 0,
		totalCredit: Number(sub(line, 38, 52).trim()) / 1000 || 0,
	};
}

// ── Movement assembly ─────────────────────────────────────────────────

function assembleMovement(
	r21: Raw21,
	r22: Raw22 | null,
	r23: Raw23 | null,
	infoGroups: { r31: Raw31; continuations: string[] }[],
): CodaMovement {
	// Concatenate communication from all record parts, trim trailing spaces only
	const commParts = [r21.comm.rawContent];
	if (r22) commParts.push(r22.commContinuation);
	if (r23) commParts.push(r23.commContinuation);
	const fullComm = commParts.join("").trimEnd();

	// Counterparty account
	let counterpartyAccountNumber: string | undefined;
	let counterpartyAccountCurrency: string | undefined;
	if (r23) {
		const cp = parseCounterpartyAccount(r23.counterpartyAccountField);
		counterpartyAccountNumber = cp.number;
		counterpartyAccountCurrency = cp.currency;
	}

	// Information records
	const information: CodaInformation[] = infoGroups.map((ig) => {
		const parts = [ig.r31.comm.rawContent, ...ig.continuations];
		const comm = parts.join("").trimEnd();
		return {
			sequenceNumber: ig.r31.sequenceNumber,
			detailNumber: ig.r31.detailNumber,
			bankReference: ig.r31.bankReference,
			transactionCode: ig.r31.transactionCode,
			communication: comm,
			communicationType: ig.r31.comm.communicationType,
			structuredCommunicationType: ig.r31.comm.structuredCommunicationType,
		};
	});

	return {
		sequenceNumber: r21.sequenceNumber,
		detailNumber: r21.detailNumber,
		bankReference: r21.bankReference,
		amount: r21.amount,
		valueDate: r21.valueDate,
		entryDate: r21.entryDate,
		transactionCode: r21.transactionCode,
		communication: fullComm,
		communicationType: r21.comm.communicationType,
		structuredCommunicationType: r21.comm.structuredCommunicationType,
		paperStatementSequence: r21.paperStatementSequence,
		globalisationCode: r21.globalisationCode,
		customerReference: r22?.customerReference,
		counterpartyBic: r22?.counterpartyBic,
		rTransactionType: r22?.rTransactionType,
		rTransactionReason: r22?.rTransactionReason,
		categoryPurpose: r22?.categoryPurpose,
		purpose: r22?.purpose,
		counterpartyAccountNumber,
		counterpartyAccountCurrency,
		counterpartyName: r23?.counterpartyName,
		information,
	};
}

// ── Statement assembly ────────────────────────────────────────────────

function parseStatementGroup(lines: string[]): CodaStatement | null {
	if (lines.length === 0) return null;

	// Header (record 0)
	const headerLine = lines.find((l) => l[0] === "0");
	if (!headerLine) return null;
	const header = parseHeader(headerLine);
	if (!header) return null;

	// Old balance (record 1)
	const balLine = lines.find((l) => l[0] === "1");
	if (!balLine) return null;
	const oldBal = parseOldBalance(balLine);
	if (!oldBal) return null;

	// Movements: iterate through records 2.x and 3.x in order
	const movements: CodaMovement[] = [];
	const movInfoLines = lines.filter((l) => l[0] === "2" || l[0] === "3");

	let cur21: Raw21 | null = null;
	let cur22: Raw22 | null = null;
	let cur23: Raw23 | null = null;
	let curInfoGroups: { r31: Raw31; continuations: string[] }[] = [];

	function flushMovement(): void {
		if (cur21) {
			movements.push(assembleMovement(cur21, cur22, cur23, curInfoGroups));
		}
		cur21 = null;
		cur22 = null;
		cur23 = null;
		curInfoGroups = [];
	}

	let i = 0;
	while (i < movInfoLines.length) {
		const line = movInfoLines[i] ?? "";
		const recType = line[0];
		const article = line[1];

		if (recType === "2" && article === "1") {
			flushMovement();
			cur21 = parseRecord21(line);
			i++;
		} else if (recType === "2" && article === "2") {
			cur22 = parseRecord22(line);
			i++;
		} else if (recType === "2" && article === "3") {
			cur23 = parseRecord23(line);
			i++;
		} else if (recType === "3" && article === "1") {
			const r31 = parseRecord31(line);
			if (r31) {
				const continuations: string[] = [];
				i++;
				while (i < movInfoLines.length) {
					const next = movInfoLines[i] ?? "";
					if (next[0] === "3" && next[1] === "2") {
						const c = parseRecord32Comm(next);
						if (c) continuations.push(c);
						i++;
					} else if (next[0] === "3" && next[1] === "3") {
						const c = parseRecord33Comm(next);
						if (c) continuations.push(c);
						i++;
					} else {
						break;
					}
				}
				curInfoGroups.push({ r31, continuations });
			} else {
				i++;
			}
		} else {
			i++;
		}
	}
	flushMovement();

	// New balance (record 8)
	const newBalLine = lines.find((l) => l[0] === "8");
	const newBalance = newBalLine ? parseNewBalance(newBalLine) : undefined;

	// Free communications (record 4)
	const freeCommMap = new Map<number, string[]>();
	for (const line of lines) {
		if (line[0] !== "4") continue;
		const seqNum = numSub(line, 3, 6);
		const text = trimSub(line, 33, 112);
		if (!text) continue;
		const parts = freeCommMap.get(seqNum) ?? [];
		parts.push(text);
		freeCommMap.set(seqNum, parts);
	}
	const freeCommunications = [...freeCommMap.values()].map((p) => p.join(""));

	// Trailer (record 9)
	const trailerLine = lines.find((l) => l[0] === "9");
	const trailer = trailerLine ? parseTrailer(trailerLine) : null;

	return {
		...header,
		...oldBal,
		movements,
		newBalance: newBalance ?? undefined,
		freeCommunications,
		totalDebit: trailer?.totalDebit ?? 0,
		totalCredit: trailer?.totalCredit ?? 0,
	};
}
