import { buildXbrlInstance, serializeXbrl } from "@financica/xbrl";
import type { XbrlContext, XbrlFact, XbrlQName } from "@financica/xbrl";
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
	let needsUnit = false;

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
			scenario: Object.entries(dimensions)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([dimension, member]) => ({
					dimension: qname(dimension),
					member: qname(member),
				})),
		});

		const monetary = isMonetary(fact.datapoint.metric);
		if (monetary) needsUnit = true;
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
			...(monetary ? { unitRef: "EUR", decimals: "INF" as const } : {}),
			value: fact.value,
			isNil: false,
		});
	});

	const document = buildXbrlInstance({
		namespaces: taxonomy.namespaces,
		schemaRefs: [{ href: taxonomy.schemaRef }],
		contexts,
		units: needsUnit
			? [
					{
						id: "EUR",
						measures: [
							{
								namespace: NS_ISO4217,
								localName: "EUR",
								prefix: "iso4217",
							},
						],
					},
				]
			: [],
		facts,
	});

	return serializeXbrl(document, { lang: input.language });
}
