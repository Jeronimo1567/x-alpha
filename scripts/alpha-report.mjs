// Runs alpha-report.ts with the app's "@/" imports resolved. Usage: node scripts/alpha-report.mjs
import { createJiti } from "jiti";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { main } = await jiti.import(path.join(root, "scripts/" + (process.argv[2] ?? "alpha-report") + ".ts"));
await main();
