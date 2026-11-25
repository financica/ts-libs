import { buildXbrlInstance, serializeXbrl } from "@financica/xbrl";
import type {
	XbrlContext,
	XbrlDimensionMember,
	XbrlFact,
	XbrlQName,
	XbrlUnit,
} from "@financica/xbrl";
import type { NbbFiling } from "./build.js";
import { isMonetary } from "./taxonomy.js";

/**
 * Scheme the NBB uses for the entity identifier.
 *
 * The Crossroads Bank for Enterprises. Note that the technical guide's prose
 * names `https://economie.fgov.be`, but accepted filings carry this one, which
 * is also what the guide's own example shows.
 */
export const ENTERPRISE_NUMBER_SCHEME = "http://www.fgov.be";

const NS_ISO4217 = "http://www.xbrl.org/2003/iso4217";
const NS_XBRLI = "http://www.xbrl.org/2003/instance";

/**
 * The unit a numeric metric is measured in, by the item type its dictionary
 * entry declares: money in a currency, `int1`/`int2` in shares, and the
 * counts, decimals and percentages (`int3`, `int4`, `dec1`, `pct1`) as pure
 * numbers. Text, dates and booleans take none.
 */
function unitKind(metric: string): "currency" | "shares" | "pure" | undefined {
	if (isMonetary(metric)) return "currency";
	if (metric === "int1" || metric === "int2") return "shares";
	if (/^(int[34]|dec\d|pct\d)$/.test(metric)) return "pure";
	return undefined;
}

/** The value of a typed member: an `open:id` line number or an `open:str` name. */
const TYPED_ELEMENT = (dimension: string) =>
	dimension === "dim:open" ? "open:id" : "open:str";

/**
 * Render a filing as an NBB/CBSO instance document.
 *
 * Follows the conventions of accepted filings: a single instant context per
 * fact at the closing date of the exercise, the current-versus-preceding
 * column carried by the period dimension rather than by the period itself,
 * `decimals="INF"` on every monetary fact, and one EUR unit.
 */
export function renderNbbFiling(filing: NbbFiling): string {
	const { module: taxonomy, input } = filing;
	const instant = input.identification.exercise.endDate;

	const qname = (prefixed: string): XbrlQName => {
		const [prefix, localName] = prefixed.split(":") as [string, string];
		return {
			namespace: taxonomy.namespaces[prefix] ?? "",
			localName,
			prefix,
		};
	};

	const contexts: XbrlContext[] = [];
	const facts: XbrlFact[] = [];
	const units = new Map<string, XbrlUnit>();
	const unitFor = (
		kind: "currency" | "shares" | "pure",
		currency: string,
	): string => {
		const id = kind === "currency" ? currency : kind;
		if (!units.has(id)) {
			units.set(id, {
				id,
				measures: [
					kind === "currency"
						? {
								namespace: NS_ISO4217,
								localName: currency,
								prefix: "iso4217",
							}
						: { namespace: NS_XBRLI, localName: kind, prefix: "xbrli" },
				],
			});
		}
		return id;
	};

	filing.facts.forEach((fact, index) => {
		const dimensions = { ...fact.datapoint.dimensions };
		const period =
			fact.period === "previous"
				? fact.datapoint.previousPeriod
				: fact.datapoint.currentPeriod;
		if (period) dimensions["dim:prd"] = period;

		const contextId = `c${index + 1}`;
		contexts.push({
			id: contextId,
			entity: {
				scheme: ENTERPRISE_NUMBER_SCHEME,
				value: input.entity.enterpriseNumber,
			},
			period: { type: "instant", instant },
			// Explicit and typed members interleaved in dimension order, as an
			// accepted filing writes them.
			scenario: [
				...Object.entries(dimensions).map(
					([dimension, member]): [string, XbrlDimensionMember] => [
						dimension,
						{ dimension: qname(dimension), member: qname(member) },
					],
				),
				...Object.entries(fact.typedMembers ?? {}).map(
					([dimension, value]): [string, XbrlDimensionMember] => [
						dimension,
						{
							dimension: qname(dimension),
							typedElement: qname(TYPED_ELEMENT(dimension)),
							typedValue: value,
						},
					],
				),
			]
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([, member]) => member),
		});

		const kind = unitKind(fact.datapoint.metric);
		const unitRef = kind ? unitFor(kind, fact.unit ?? "EUR") : undefined;
		facts.push({
			type: "item",
			name: {
				namespace:
					fact.datapoint.metricPrefix === undefined
						? taxonomy.metricNamespace
						: (taxonomy.namespaces[fact.datapoint.metricPrefix] ?? ""),
				localName: fact.datapoint.metric,
				prefix: fact.datapoint.metricPrefix ?? "met",
			},
			id: `f${index + 1}`,
			contextRef: contextId,
			...(unitRef ? { unitRef, decimals: "INF" as const } : {}),
			value: fact.value,
			isNil: false,
		});
	});

	const document = buildXbrlInstance({
		namespaces: taxonomy.namespaces,
		schemaRefs: [{ href: taxonomy.schemaRef }],
		contexts,
		units: [...units.values()],
		facts,
	});

	return serializeXbrl(document, { lang: input.language });
}
