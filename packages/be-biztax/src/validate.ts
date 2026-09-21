import { biztaxItems, type BiztaxItem, type BiztaxReturn } from "./build.js";
import type { DataType } from "./taxonomy.js";
import type { Finding } from "./types.js";

/** Each PDF annex may be this large. */
export const MAX_ANNEX_BYTES = 5 * 1024 * 1024;
/** The instance may be this large, annexes included. */
export const MAX_INSTANCE_BYTES = 15 * 1024 * 1024;

export interface BiztaxValidationResult {
	/** True when nothing found would make Biztax refuse the file. */
	valid: boolean;
	findings: readonly Finding[];
}

/** Whether the ten digits carry the KBO/BCE's mod-97 check. */
function hasValidCheckDigits(identifier: string): boolean {
	const digits = identifier.slice(2);
	return 97 - (Number(digits.slice(0, 8)) % 97) === Number(digits.slice(8));
}

/** A lexical value against the facets of its datatype. `undefined` when it fits. */
function facetViolation(type: DataType, value: string): string | undefined {
	if (
		type.base === "monetary" ||
		type.base === "decimal" ||
		type.base === "integer"
	) {
		const number = Number(value);
		if (type.minInclusive !== undefined && number < type.minInclusive) {
			return `is below the minimum of ${type.minInclusive}`;
		}
		if (type.maxInclusive !== undefined && number > type.maxInclusive) {
			return `is above the maximum of ${type.maxInclusive}`;
		}
		const digits = value
			.replace(/^-/, "")
			.replace(".", "")
			.replace(/^0+(?=\d)/, "");
		if (type.totalDigits !== undefined && digits.length > type.totalDigits) {
			return `has more than ${type.totalDigits} digits`;
		}
		return undefined;
	}
	if (type.base === "token" && value === "") return "is empty";
	if (type.minLength !== undefined && value.length < type.minLength) {
		return `is shorter than ${type.minLength} characters`;
	}
	if (type.maxLength !== undefined && value.length > type.maxLength) {
		return `is longer than ${type.maxLength} characters`;
	}
	// XSD patterns are anchored at both ends by definition.
	if (
		type.pattern !== undefined &&
		!new RegExp(`^(?:${type.pattern})$`).test(value)
	) {
		return `does not match ${type.pattern}`;
	}
	return undefined;
}

/** Size in bytes of what a base64 value encodes. */
const decodedLength = (value: string): number =>
	Math.floor((value.length * 3) / 4) -
	(value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);

/**
 * Check a built return against what can be checked without a formula
 * processor: the datatypes, the typed members, the period against the
 * assessment year, the identifier and the annexes.
 *
 * This is sound but far from complete. FPS Finance validates a return against
 * the several hundred XBRL formula assertions of the taxonomy, which are not
 * evaluated here: a return this accepts can still be refused by Biztax.
 */
export function validateBiztaxReturn(filing: BiztaxReturn): BiztaxValidationResult {
	const findings: Finding[] = [];
	const error = (rule: string, message: string, concept?: string): void => {
		findings.push({
			severity: "error",
			rule,
			message,
			...(concept ? { concept } : {}),
		});
	};
	const { module, input } = filing;

	if (!/^BE[01][0-9]{9}$/.test(filing.entityIdentifier)) {
		error(
			"enterprise-number",
			`"${input.entity.enterpriseNumber}" is not a ten-digit enterprise number`,
		);
	} else if (!hasValidCheckDigits(filing.entityIdentifier)) {
		error(
			"enterprise-number",
			`"${input.entity.enterpriseNumber}" fails the enterprise number's check digits`,
		);
	}

	const { startDate, endDate } = input.period;
	if (startDate >= endDate) {
		error(
			"period-order",
			`the taxable period starts ${startDate}, which is not before it ends ${endDate}`,
		);
	}
	const first = module.parameters["AssessmentYearEndFirst"];
	const last = module.parameters["AssessmentYearEndLast"];
	if (first && last && (endDate < first || endDate > last)) {
		error(
			"period-assessment-year",
			`a period ending ${endDate} does not belong to assessment year ${module.assessmentYear}, which takes ${first} to ${last}`,
		);
	}

	let instanceBytes = 0;
	const check = (item: BiztaxItem): void => {
		if (!item.dataType) return;
		const violation = facetViolation(item.dataType, item.value);
		if (violation) error("datatype", `${item.name} ${violation}`, item.name);

		if (item.dataType.base === "base64") {
			const bytes = decodedLength(item.value);
			instanceBytes += item.value.length;
			if (bytes > MAX_ANNEX_BYTES) {
				error(
					"annex-size",
					`${item.name} is ${bytes} bytes; an annex may be 5 MB`,
					item.name,
				);
			}
			// `%PDF` in base64. Biztax refuses a file merely renamed to .pdf.
			if (!item.value.startsWith("JVBERi")) {
				error("annex-pdf", `${item.name} is not a PDF`, item.name);
			}
		}

		for (const [name, member] of Object.entries(item.dimensions)) {
			const typed = module.dimensions[name]?.typed;
			const memberViolation = typed
				? facetViolation(typed.type, member)
				: undefined;
			if (memberViolation) {
				error(
					"typed-member",
					`the ${name} member "${member}" of ${item.name} ${memberViolation}`,
					item.name,
				);
			}
		}
	};
	for (const item of biztaxItems(filing.facts)) check(item);

	if (instanceBytes > MAX_INSTANCE_BYTES) {
		error("instance-size", "the annexes alone exceed the 15 MB an instance may be");
	}

	return {
		valid: findings.every((finding) => finding.severity !== "error"),
		findings,
	};
}
