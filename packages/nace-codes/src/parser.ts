export function parseTSV<T = Record<string, string>>(content: string): T[] {
	if (!content || content.trim() === "") {
		return [];
	}

	const lines = content.split("\n");
	if (lines.length < 2) {
		return [];
	}

	const firstLine = lines[0];
	if (!firstLine) {
		return [];
	}
	const headers = parseRow(firstLine);
	const results: T[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		// Skip only truly empty lines
		if (line === undefined || line === "") {
			continue;
		}

		const values = parseRow(line);
		if (values.length !== headers.length) {
			continue;
		}

		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			const header = headers[j];
			const value = values[j];
			if (header !== undefined && value !== undefined) {
				row[header] = value;
			}
		}
		results.push(row as T);
	}

	return results;
}

function parseRow(line: string): string[] {
	const values: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i]!;
		const nextChar = line[i + 1];

		if (char === '"') {
			if (!inQuotes) {
				inQuotes = true;
			} else if (nextChar === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = false;
			}
		} else if (char === "\t" && !inQuotes) {
			values.push(current);
			current = "";
		} else {
			current += char;
		}
		i++;
	}

	values.push(current);
	return values;
}
