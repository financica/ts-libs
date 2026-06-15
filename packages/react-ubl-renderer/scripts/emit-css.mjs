// Emit dist/styles.css from the single CSS source so consumers can
// `import "@financica/react-ubl-renderer/styles.css"`. Run after tsup builds
// dist/styles.js (see the build script).
import { writeFileSync } from "node:fs";
import { ublInvoiceCss } from "../dist/styles.js";

writeFileSync(new URL("../dist/styles.css", import.meta.url), `${ublInvoiceCss}\n`);
