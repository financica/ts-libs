import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildNbbFiling, renderNbbFiling, validateNbbFiling } from "../src/index.js";
import type { NbbFilingInput } from "../src/index.js";
import m87f25 from "../src/taxonomies/25.0/m87-f.js";
import {
	ASSOCIATION_FILING,
	FULL_MICRO_FILING,
	INCOMPLETE_MICRO_FILING,
} from "./filing.js";

/**
 * Validates rendered instances with Arelle against the NBB's own taxonomy
 * package: XBRL 2.1, XBRL Dimensions (closed hypercubes, typed members) and
 * every formula linkbase of the entry point, the completeness rules included.
 * That is the processing the Filing application runs on upload, and the
 * independent check on what this package writes.
 *
 * Needs `NBB_ARELLE` (the `arelleCmdLine` executable) and
 * `NBB_TAXONOMY_PACKAGE` (the `nbb-cbso-<version>.zip` from nbb.be). Without
 * them the suite is skipped, unless `NBB_ARELLE_REQUIRED` is set, as the CI
 * job does, in which case their absence fails it.
 */
const arelle = process.env["NBB_ARELLE"];
const taxonomyPackage = process.env["NBB_TAXONOMY_PACKAGE"];
const required = Boolean(process.env["NBB_ARELLE_REQUIRED"]);
const configured = Boolean(arelle && taxonomyPackage);

const run = promisify(execFile);
const workdir = configured ? mkdtempSync(join(tmpdir(), "nbb-arelle-")) : "";

interface Message {
	level: string;
	code: string;
	message: string;
}

/** Every message Arelle logs at warning level or above for one instance. */
async function validate(name: string, xbrl: string): Promise<Message[]> {
	const file = join(workdir, `${name}.xbrl`);
	const log = join(workdir, `${name}.log`);
	writeFileSync(file, xbrl);
	writeFileSync(log, "");
	await run(
		arelle ?? "",
		[
			"--packages",
			taxonomyPackage ?? "",
			"--internetConnectivity=offline",
			"--file",
			file,
			"--validate",
			"--formula=run",
			"--logLevel=warning",
			"--logFormat=%(levelname)s|%(messageCode)s|%(message)s",
			"--logFile",
			log,
		],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	return readFileSync(log, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => {
			const [level = "", code = "", ...rest] = line.split("|");
			return {
				level,
				code: code.replace(/^message:/, ""),
				message: rest.join("|"),
			};
		});
}

const render = (input: NbbFilingInput) => renderNbbFiling(buildNbbFiling(input));

/** The NBB rule identifiers our own validation reports. */
const ourRules = (input: NbbFilingInput) => {
	const result = validateNbbFiling(buildNbbFiling(input));
	return [
		...new Set(
			[...result.errors, ...result.warnings]
				.map((finding) => finding.check)
				.filter((check) => check.startsWith("oa_")),
		),
	].sort();
};

// Each run loads the 1.2 GB taxonomy afresh, which takes Arelle 15 to 30 s.
const TIMEOUT = 300_000;

describe("Arelle configuration", () => {
	it.runIf(required)("is present where the suite is required", () => {
		expect({ arelle, taxonomyPackage }).toEqual({
			arelle: expect.any(String),
			taxonomyPackage: expect.any(String),
		});
	});
});

describe.runIf(configured)("validation by Arelle against the NBB taxonomy", () => {
	it(
		"accepts the NBB-accepted filing the conformance tests use, which calibrates it",
		async () => {
			const xbrl = readFileSync(
				new URL("./fixtures/m87-micro-example.xbrl", import.meta.url),
				"utf8",
			);
			expect(await validate("accepted", xbrl)).toEqual([]);
		},
		TIMEOUT,
	);

	it.each([
		{ name: "full-26.0-m87", input: FULL_MICRO_FILING },
		{
			name: "full-25.0-m87",
			input: {
				...FULL_MICRO_FILING,
				taxonomy: m87f25,
				identification: {
					...FULL_MICRO_FILING.identification,
					exercise: { startDate: "2024-01-01", endDate: "2024-12-31" },
					previousExercise: {
						startDate: "2023-01-01",
						endDate: "2023-12-31",
					},
					generalMeetingDate: "2025-06-15",
				},
			},
		},
		{ name: "association-26.0-m04", input: ASSOCIATION_FILING },
	])(
		"finds nothing to report on $name",
		async ({ name, input }) => {
			expect(await validate(name, render(input))).toEqual([]);
		},
		TIMEOUT,
	);

	it(
		"reports, on a filing broken once per row, exactly the rules our validation reports",
		async () => {
			const messages = await validate(
				"incomplete",
				render(INCOMPLETE_MICRO_FILING),
			);
			// Nothing but completeness rules: no XBRL, schema or dimensional error.
			expect(messages.filter((m) => !m.code.startsWith("oa_"))).toEqual([]);
			expect([...new Set(messages.map((m) => m.code))].sort()).toEqual(
				ourRules(INCOMPLETE_MICRO_FILING),
			);
		},
		TIMEOUT,
	);
});
