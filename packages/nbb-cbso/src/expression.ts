/**
 * Evaluator for the test expressions carried by the NBB's formula linkbases.
 *
 * The language is a small subset of XPath: variable references, numbers,
 * addition and subtraction, the comparison operators, `and`/`or`, and
 * parentheses. Every published check is of the form `$am1 eq $am12 + $am13`
 * or `$am1 le $am12`, so nothing more is implemented — an expression using
 * anything else is rejected rather than guessed at.
 */

export type ExpressionValue = number | boolean;

/** Amounts are reported to the cent, so equality is to within half a cent. */
const EPSILON = 0.005;

type Token =
	| { kind: "number"; value: number }
	| { kind: "variable"; name: string }
	| { kind: "operator"; value: string }
	| { kind: "paren"; value: "(" | ")" };

const OPERATORS = new Set([
	"+",
	"-",
	"eq",
	"ne",
	"lt",
	"le",
	"gt",
	"ge",
	"=",
	"!=",
	"<",
	"<=",
	">",
	">=",
	"and",
	"or",
]);

export class ExpressionError extends Error {}

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;

	while (index < source.length) {
		const char = source[index]!;
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if (char === "(" || char === ")") {
			tokens.push({ kind: "paren", value: char });
			index++;
			continue;
		}
		if (char === "$") {
			const match = /^\$([A-Za-z_][\w.-]*)/.exec(source.slice(index));
			if (!match) throw new ExpressionError(`bad variable reference at ${index}`);
			tokens.push({ kind: "variable", name: match[1]! });
			index += match[0].length;
			continue;
		}
		const number = /^\d+(?:\.\d+)?/.exec(source.slice(index));
		if (number) {
			tokens.push({ kind: "number", value: Number(number[0]) });
			index += number[0].length;
			continue;
		}
		const word = /^[a-z]+/.exec(source.slice(index));
		if (word && OPERATORS.has(word[0])) {
			tokens.push({ kind: "operator", value: word[0] });
			index += word[0].length;
			continue;
		}
		const symbol = ["!=", "<=", ">=", "+", "-", "=", "<", ">"].find((candidate) =>
			source.startsWith(candidate, index),
		);
		if (symbol) {
			tokens.push({ kind: "operator", value: symbol });
			index += symbol.length;
			continue;
		}
		throw new ExpressionError(
			`unsupported syntax at ${index}: ${source.slice(index, index + 12)}`,
		);
	}
	return tokens;
}

/**
 * Evaluates a check's test expression.
 *
 * @throws {ExpressionError} if the expression uses syntax outside the subset,
 * or refers to a variable that has no value.
 */
export function evaluateExpression(
	source: string,
	variables: Readonly<Record<string, number>>,
): ExpressionValue {
	const tokens = tokenize(source);
	let position = 0;

	const peek = (): Token | undefined => tokens[position];
	const eat = (value: string): boolean => {
		const token = peek();
		if (
			token &&
			((token.kind === "operator" && token.value === value) ||
				(token.kind === "paren" && token.value === value))
		) {
			position++;
			return true;
		}
		return false;
	};

	const primary = (): ExpressionValue => {
		const token = peek();
		if (!token) throw new ExpressionError("unexpected end of expression");
		if (token.kind === "paren" && token.value === "(") {
			position++;
			const value = logical();
			if (!eat(")")) throw new ExpressionError("missing closing parenthesis");
			return value;
		}
		if (token.kind === "number") {
			position++;
			return token.value;
		}
		if (token.kind === "variable") {
			position++;
			const value = variables[token.name];
			if (value === undefined) {
				throw new ExpressionError(`no value for $${token.name}`);
			}
			return value;
		}
		if (token.kind === "operator" && token.value === "-") {
			position++;
			return -asNumber(primary());
		}
		throw new ExpressionError(`unexpected token: ${JSON.stringify(token)}`);
	};

	const additive = (): ExpressionValue => {
		let left = primary();
		for (;;) {
			if (eat("+")) left = asNumber(left) + asNumber(primary());
			else if (eat("-")) left = asNumber(left) - asNumber(primary());
			else return left;
		}
	};

	const comparison = (): ExpressionValue => {
		const left = additive();
		for (const operator of [
			"eq",
			"ne",
			"le",
			"ge",
			"lt",
			"gt",
			"=",
			"!=",
			"<=",
			">=",
			"<",
			">",
		]) {
			if (eat(operator)) {
				const right = additive();
				return compare(operator, asNumber(left), asNumber(right));
			}
		}
		return left;
	};

	const logical = (): ExpressionValue => {
		let left = comparison();
		for (;;) {
			if (eat("and")) left = asBoolean(left) && asBoolean(comparison());
			else if (eat("or")) left = asBoolean(left) || asBoolean(comparison());
			else return left;
		}
	};

	const result = logical();
	if (position !== tokens.length) {
		throw new ExpressionError(`unexpected trailing input in "${source}"`);
	}
	return result;
}

function compare(operator: string, left: number, right: number): boolean {
	switch (operator) {
		case "eq":
		case "=":
			return Math.abs(left - right) <= EPSILON;
		case "ne":
		case "!=":
			return Math.abs(left - right) > EPSILON;
		case "le":
		case "<=":
			return left <= right + EPSILON;
		case "ge":
		case ">=":
			return left >= right - EPSILON;
		case "lt":
		case "<":
			return left < right - EPSILON;
		case "gt":
		case ">":
			return left > right + EPSILON;
		default:
			throw new ExpressionError(`unknown operator "${operator}"`);
	}
}

function asNumber(value: ExpressionValue): number {
	if (typeof value !== "number") {
		throw new ExpressionError("expected a number");
	}
	return value;
}

function asBoolean(value: ExpressionValue): boolean {
	if (typeof value !== "boolean") {
		throw new ExpressionError("expected a boolean");
	}
	return value;
}

/**
 * Rewrites a test into the rubric codes it refers to, for display.
 *
 * `$am1 eq $am12 + $am13` becomes `20/58 = 20 + 21/28`.
 */
export function describeExpression(
	source: string,
	codes: Readonly<Record<string, readonly string[]>>,
): string {
	return source
		.replace(/\$(\w+)/g, (whole, name: string) => {
			const matched = codes[name];
			if (!matched || matched.length === 0) return whole;
			return matched.length === 1 ? matched[0]! : `(${matched.join(" or ")})`;
		})
		.replace(/\beq\b/g, "=")
		.replace(/\bne\b/g, "≠")
		.replace(/\ble\b/g, "≤")
		.replace(/\bge\b/g, "≥")
		.replace(/\blt\b/g, "<")
		.replace(/\bgt\b/g, ">");
}
