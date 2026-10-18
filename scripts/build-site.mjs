import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "vendor"), { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "template.pdf"]) {
  await cp(path.join(root, file), path.join(output, file));
}
for (const file of ["checklist-pdf.js", "pdf-lib.LICENSE"]) {
  await cp(path.join(root, "vendor", file), path.join(output, "vendor", file));
}
console.log(`GitHub Pages files are ready in ${output}`);
