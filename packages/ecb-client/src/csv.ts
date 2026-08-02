/**
 * Minimal RFC 4180 CSV parser, sufficient for the ECB data API's `text/csv`
 * responses. Handles quoted fields containing commas, line breaks and escaped
 * (doubled) quotes — the ECB's `TITLE_COMPL` column, for instance, embeds
 * commas inside quotes.
 */
export const parseCsv = (text: string): Record<string, string>[] => {
	const rows = splitRows(text);
	const header = rows.shift();
	if (!header) return [];
	const records: Record<string, string>[] = [];
	for (const row of rows) {
		// Skip blank trailing lines (a single empty field, no real data).
		if (row.length === 1 && row[0] === "") continue;
		const record: Record<string, string> = {};
		for (let i = 0; i < header.length; i++) {
			record[header[i] ?? `column_${i}`] = row[i] ?? "";
		}
		records.push(record);
	}
	return records;
};

const splitRows = (text: string): string[][] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}

	// Flush a final row when the text does not end with a line break.
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
};
