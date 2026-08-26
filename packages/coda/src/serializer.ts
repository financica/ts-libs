import type {
	CodaAccount,
	CodaFile,
	CodaInformation,
	CodaMovement,
	CodaStatement,
	CodaTransactionCode,
} from "./types.js";

/**
 * Serialize a {@link CodaFile} to CODA 2.x text: 128-column records, CRLF
 * terminated, one statement group (records 0 → 9) per statement.
 *
 * Positions cite the Febelfin CODA 2.6 layout, 1-based inclusive, the same
 * columns `parseCoda` reads; `parseCoda(serializeCoda(file))` reproduces
 * `file`. Text is clipped to its field and every character outside Latin-1
 * (or below space) becomes `?`, so a record is always exactly 128 bytes once
 * encoded as ISO-8859-1.
 */
export function serializeCoda(file: CodaFile): string {
	const last = file.statements.length - 1;
	return file.statements
		.map((stmt, i) => serializeStatement(stmt, i === last))
		.join("");
}

const WIDTH = 128;

class Line {
	private readonly chars = Array.from({ length: WIDTH }, () => " ");

	/** Left-aligned text, clipped to `[start, end]`. */
	text(start: number, end: number, value: string | undefined): this {
		const clean = sanitize(value ?? "").slice(0, end - start + 1);
		for (let i = 0; i < clean.length; i++)
			this.chars[start - 1 + i] = clean[i] as string;
		return this;
	}

	/** Zero-padded unsigned integer, right-aligned in `[start, end]`. */
	num(start: number, end: number, value: number): this {
		const width = end - start + 1;
		const digits = String(Math.max(0, Math.trunc(value)));
		if (digits.length > width)
			throw new RangeError(`Value ${value} does not fit ${width} digits`);
		return this.text(start, end, digits.padStart(width, "0"));
	}

	/** Sign (`0` credit, `1` debit) at `start` and the thousandths amount in the next 15 columns. */
	amount(start: number, value: number): this {
		this.text(start, start, value < 0 ? "1" : "0");
		return this.num(start + 1, start + 15, Math.round(Math.abs(value) * 1000));
	}

	date(start: number, value: Date | undefined): this {
		return this.text(start, start + 5, value ? formatDate(value) : "000000");
	}

	toString(): string {
		return `${this.chars.join("")}\r\n`;
	}
}

const sanitize = (value: string): string => value.replace(/[^ -ÿ]/g, "?");

const formatDate = (date: Date): string => {
	const dd = String(date.getDate()).padStart(2, "0");
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const yy = String(date.getFullYear() % 100).padStart(2, "0");
	return `${dd}${mm}${yy}`;
};

const formatTransactionCode = (code: CodaTransactionCode): string =>
	`${code.type}${String(code.family).padStart(2, "0")}${String(code.transaction).padStart(2, "0")}${String(code.category).padStart(3, "0")}`;

// ── Account field (37 columns, mirrors parseAccountField) ─────────────

const ACCOUNT_STRUCTURE_CODE: Record<CodaAccount["structure"], string> = {
	"belgian-bban": "0",
	"foreign-bban": "1",
	"belgian-iban": "2",
	"foreign-iban": "3",
};

const accountField = (account: CodaAccount): string => {
	const currency = (account.currency ?? "").padEnd(3);
	switch (account.structure) {
		case "belgian-bban":
			// 12N account + 1 blank + 3 currency + 1 qualifier + 2 country + 18 extension
			return `${account.number.padEnd(12)} ${currency}0${(account.countryCode ?? "").padEnd(2)}`;
		case "belgian-iban":
			// 31 IBAN + 3 extension + 3 currency
			return `${account.number.padEnd(31)}   ${currency}`;
		default:
			// 34 number + 3 currency
			return `${account.number.padEnd(34)}${currency}`;
	}
};

// ── Communication splitting ───────────────────────────────────────────

/**
 * Cut `text` into the consecutive field widths; the parser concatenates the
 * raw fields back and trims the end. Text past the last field is dropped.
 */
const split = (text: string, widths: number[]): string[] => {
	const parts: string[] = [];
	let offset = 0;
	for (const width of widths) {
		parts.push(text.slice(offset, offset + width));
		offset += width;
	}
	return parts;
};

const communicationText = (item: {
	communication: string;
	communicationType: "structured" | "unstructured";
	structuredCommunicationType?: number | undefined;
}): { type: "0" | "1"; text: string } =>
	item.communicationType === "structured"
		? {
				type: "1",
				text: `${String(item.structuredCommunicationType ?? 0).padStart(3, "0")}${item.communication}`,
			}
		: { type: "0", text: item.communication };

// ── Records ───────────────────────────────────────────────────────────

const header = (stmt: CodaStatement): string =>
	new Line()
		.text(1, 5, "00000")
		.date(6, stmt.creationDate)
		.num(12, 14, stmt.bankId)
		.text(15, 16, "05")
		.text(17, 17, stmt.isDuplicate ? "D" : " ")
		.text(25, 34, stmt.fileReference)
		.text(35, 60, stmt.addressee)
		.text(61, 71, stmt.bic)
		.text(72, 82, stmt.companyId)
		.text(84, 88, stmt.separateApplication)
		.text(89, 104, stmt.transactionReference)
		.text(105, 120, stmt.relatedReference)
		.num(128, 128, stmt.version)
		.toString();

const oldBalance = (stmt: CodaStatement): string =>
	new Line()
		.text(1, 1, "1")
		.text(2, 2, ACCOUNT_STRUCTURE_CODE[stmt.account.structure])
		.num(3, 5, stmt.paperStatementSequence)
		.text(6, 42, accountField(stmt.account))
		.amount(43, stmt.oldBalance.amount)
		.date(59, stmt.oldBalance.date)
		.text(65, 90, stmt.accountHolderName)
		.text(91, 125, stmt.accountDescription)
		.num(126, 128, stmt.codaStatementSequence)
		.toString();

const movementRecords = (movement: CodaMovement): string => {
	const comm = communicationText(movement);
	const [c21, c22, c23] = split(comm.text, [53, 53, 43]);
	const has23 = Boolean(
		movement.counterpartyAccountNumber ||
		movement.counterpartyName ||
		(c23 && c23.trim()),
	);
	const has22 =
		has23 ||
		Boolean(
			movement.customerReference ||
			movement.counterpartyBic ||
			movement.rTransactionType !== undefined ||
			movement.rTransactionReason ||
			movement.categoryPurpose ||
			movement.purpose ||
			(c22 && c22.trim()),
		);
	const hasInfo = movement.information.length > 0;
	const seq = (r: Line) =>
		r.num(3, 6, movement.sequenceNumber).num(7, 10, movement.detailNumber);

	const r21 = seq(new Line().text(1, 2, "21"))
		.text(11, 31, movement.bankReference)
		.amount(32, movement.amount)
		.date(48, movement.valueDate)
		.text(54, 61, formatTransactionCode(movement.transactionCode))
		.text(62, 62, comm.type)
		.text(63, 115, c21)
		.date(116, movement.entryDate)
		.num(122, 124, movement.paperStatementSequence)
		.num(125, 125, movement.globalisationCode ?? 0)
		.text(126, 126, has22 ? "1" : "0")
		.text(128, 128, !has22 && hasInfo ? "1" : "0");
	if (!has22) return r21.toString() + informationRecords(movement.information);

	const r22 = seq(new Line().text(1, 2, "22"))
		.text(11, 63, c22)
		.text(64, 98, movement.customerReference)
		.text(99, 109, movement.counterpartyBic)
		.text(
			113,
			113,
			movement.rTransactionType === undefined
				? ""
				: String(movement.rTransactionType),
		)
		.text(114, 117, movement.rTransactionReason)
		.text(118, 121, movement.categoryPurpose)
		.text(122, 125, movement.purpose)
		.text(126, 126, has23 ? "1" : "0")
		.text(128, 128, !has23 && hasInfo ? "1" : "0");
	if (!has23)
		return (
			r21.toString() + r22.toString() + informationRecords(movement.information)
		);

	const counterpartyAccount = movement.counterpartyAccountNumber
		? `${movement.counterpartyAccountNumber.padEnd(34)}${movement.counterpartyAccountCurrency ?? ""}`
		: "";
	const r23 = seq(new Line().text(1, 2, "23"))
		.text(11, 47, counterpartyAccount)
		.text(48, 82, movement.counterpartyName)
		.text(83, 125, c23)
		.text(126, 126, "0")
		.text(128, 128, hasInfo ? "1" : "0");
	return (
		r21.toString() +
		r22.toString() +
		r23.toString() +
		informationRecords(movement.information)
	);
};

const informationRecords = (information: CodaInformation[]): string =>
	information
		.map((info, index) => {
			const comm = communicationText(info);
			const [c31, c32, c33] = split(comm.text, [73, 105, 90]);
			const has32 = Boolean(c32 && c32.trim());
			const has33 = Boolean(c33 && c33.trim());
			const next = index < information.length - 1;
			const seq = (r: Line) =>
				r.num(3, 6, info.sequenceNumber).num(7, 10, info.detailNumber);
			let out = seq(new Line().text(1, 2, "31"))
				.text(11, 31, info.bankReference)
				.text(32, 39, formatTransactionCode(info.transactionCode))
				.text(40, 40, comm.type)
				.text(41, 113, c31)
				.text(126, 126, has32 ? "1" : "0")
				.text(128, 128, !has32 && next ? "1" : "0")
				.toString();
			if (!has32) return out;
			out += seq(new Line().text(1, 2, "32"))
				.text(11, 115, c32)
				.text(126, 126, has33 ? "1" : "0")
				.text(128, 128, !has33 && next ? "1" : "0")
				.toString();
			if (!has33) return out;
			out += seq(new Line().text(1, 2, "33"))
				.text(11, 100, c33)
				.text(126, 126, "0")
				.text(128, 128, next ? "1" : "0")
				.toString();
			return out;
		})
		.join("");

const newBalance = (stmt: CodaStatement, hasFreeCommunications: boolean): string => {
	if (!stmt.newBalance) return "";
	return new Line()
		.text(1, 1, "8")
		.num(2, 4, stmt.paperStatementSequence)
		.text(5, 41, accountField(stmt.account))
		.amount(42, stmt.newBalance.amount)
		.date(58, stmt.newBalance.date)
		.text(128, 128, hasFreeCommunications ? "1" : "0")
		.toString();
};

const freeCommunications = (texts: string[]): string =>
	texts
		.map((text, index) =>
			split(text, [80, 80, 80, 80])
				.filter((part, partIndex) => partIndex === 0 || part.trim().length > 0)
				.map((part, partIndex) =>
					new Line()
						.text(1, 1, "4")
						.num(3, 6, index + 1)
						.num(7, 10, partIndex)
						.text(33, 112, part)
						.text(128, 128, index < texts.length - 1 ? "1" : "0")
						.toString(),
				)
				.join(""),
		)
		.join("");

const trailer = (stmt: CodaStatement, recordCount: number, isLast: boolean): string => {
	const totals = stmt.movements.filter((m) => m.detailNumber === 0);
	const totalDebit =
		stmt.totalDebit ??
		totals.filter((m) => m.amount < 0).reduce((sum, m) => sum - m.amount, 0);
	const totalCredit =
		stmt.totalCredit ??
		totals.filter((m) => m.amount > 0).reduce((sum, m) => sum + m.amount, 0);
	return new Line()
		.text(1, 1, "9")
		.num(17, 22, recordCount)
		.num(23, 37, Math.round(totalDebit * 1000))
		.num(38, 52, Math.round(totalCredit * 1000))
		.text(128, 128, isLast ? "2" : "1")
		.toString();
};

function serializeStatement(stmt: CodaStatement, isLast: boolean): string {
	const body =
		oldBalance(stmt) +
		stmt.movements.map(movementRecords).join("") +
		newBalance(stmt, stmt.freeCommunications.length > 0) +
		freeCommunications(stmt.freeCommunications);
	const recordCount = body.split("\r\n").length - 1;
	return header(stmt) + body + trailer(stmt, recordCount, isLast);
}
