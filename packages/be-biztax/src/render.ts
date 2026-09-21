import {
	buildXbrlInstance,
	serializeXbrl,
	type XbrlContext,
	type XbrlDimensionMember,
	type XbrlFact,
	type XbrlQName,
	type XbrlUnit,
} from "@financica/xbrl";
import type { BiztaxItem, BiztaxNode, BiztaxReturn, FactMoment } from "./build.js";
import { BiztaxBuildError } from "./errors.js";
import type { TaxonomyModule } from "./taxonomy.js";

/** The scheme the taxonomy identifies a Belgian entity under: the KBO/BCE. */
export const ENTERPRISE_NUMBER_SCHEME = "http://www.fgov.be";

const ISO4217 = "http://www.xbrl.org/2003/iso4217";
const XBRLI = "http://www.xbrl.org/2003/instance";

const CONTEXT_ID: Readonly<Record<FactMoment, string>> = {
	period: "D",
	start: "I-Start",
	end: "I-End",
};

const UNITS = {
	EUR: {
		id: "EUR",
		measures: [{ namespace: ISO4217, localName: "EUR", prefix: "iso4217" }],
	},
	pure: {
		id: "U-Pure",
		measures: [{ namespace: XBRLI, localName: "pure", prefix: "xbrli" }],
	},
} as const satisfies Record<string, XbrlUnit>;

function qname(module: TaxonomyModule, name: string): XbrlQName {
	const [prefix, localName] = name.split(":");
	const namespace = prefix ? module.namespaces[prefix] : undefined;
	if (!prefix || !localName || !namespace) {
		throw new BiztaxBuildError(`"${name}" has no namespace in this taxonomy`);
	}
	return { namespace, localName, prefix };
}

/** The day before, which is where an opening balance sits: see {@link contextPeriod}. */
function dayBefore(date: string): string {
	const moment = new Date(`${date}T00:00:00Z`);
	moment.setUTCDate(moment.getUTCDate() - 1);
	return moment.toISOString().slice(0, 10);
}

/**
 * The XBRL period of each of the return's three moments.
 *
 * A date-only instant means the end of that day. The closing balance is
 * therefore at the period's last day, and the opening balance at the day
 * before its first, which is what the taxonomy's rules test for
 * (`period-instant eq PeriodStartDate`, the instant being midnight after).
 */
function contextPeriod(
	filing: BiztaxReturn,
	moment: FactMoment,
): XbrlContext["period"] {
	const { startDate, endDate } = filing.input.period;
	if (moment === "period") return { type: "duration", startDate, endDate };
	return {
		type: "instant",
		instant: moment === "start" ? dayBefore(startDate) : endDate,
	};
}

/**
 * Render a built return as the `.xbrl` instance document.
 *
 * One return is one instance. To upload it, wrap it, alone or with others,
 * with `wrapBiztax`.
 */
export function renderBiztaxReturn(filing: BiztaxReturn): string {
	const module = filing.module;
	const contexts = new Map<string, XbrlContext>();
	const units = new Map<string, XbrlUnit>();
	let dimensional = 0;

	const contextFor = (item: BiztaxItem): string => {
		const names = Object.keys(item.dimensions).sort();
		const key = `${item.moment}|${names.map((n) => `${n}=${item.dimensions[n]}`).join(",")}`;
		const existing = contexts.get(key);
		if (existing) return existing.id;

		const scenario = names.map((name): XbrlDimensionMember => {
			const dimension = module.dimensions[name];
			const member = item.dimensions[name] ?? "";
			return dimension?.typed
				? {
						dimension: qname(module, name),
						typedElement: qname(module, dimension.typed.element),
						typedValue: member,
					}
				: { dimension: qname(module, name), member: qname(module, member) };
		});
		const context: XbrlContext = {
			id:
				names.length === 0
					? CONTEXT_ID[item.moment]
					: `${CONTEXT_ID[item.moment]}-${++dimensional}`,
			entity: {
				scheme: ENTERPRISE_NUMBER_SCHEME,
				value: filing.entityIdentifier,
			},
			period: contextPeriod(filing, item.moment),
			...(scenario.length > 0 ? { scenario } : {}),
		};
		contexts.set(key, context);
		return context.id;
	};

	const fact = (node: BiztaxNode): XbrlFact => {
		if (node.kind === "tuple") {
			return {
				type: "tuple",
				name: qname(module, node.name),
				children: node.children.map(fact),
			};
		}
		const base = node.dataType?.base;
		const unit =
			base === "monetary"
				? UNITS.EUR
				: base === "decimal" || base === "integer"
					? UNITS.pure
					: undefined;
		if (unit) units.set(unit.id, unit);
		return {
			type: "item",
			name: qname(module, node.name),
			contextRef: contextFor(node),
			...(unit ? { unitRef: unit.id, decimals: "INF" as const } : {}),
			value: node.value,
			isNil: false,
		};
	};

	const facts = filing.facts.map(fact);
	const instance = buildXbrlInstance({
		schemaRefs: [{ href: module.schemaRef }],
		contexts: [...contexts.values()],
		units: [...units.values()],
		facts,
	});
	return serializeXbrl(instance);
}
