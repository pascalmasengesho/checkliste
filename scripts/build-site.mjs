import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "vendor"), { recursive: true });
await mkdir(path.join(output, "assets"), { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "template.pdf", "manifest.webmanifest"]) {
  await cp(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, "service-worker.js"), path.join(output, "service-worker.js"));
await cp(
  path.join(root, "assets", "masengesho-pascal-signature.png"),
  path.join(output, "assets", "masengesho-pascal-signature.png"),
);
for (const file of ["icon-180.png", "icon-192.png", "icon-512.png"]) {
  await cp(path.join(root, "assets", file), path.join(output, "assets", file));
}
for (const file of ["checklist-pdf.js", "pdf-lib.LICENSE"]) {
  await cp(path.join(root, "vendor", file), path.join(output, "vendor", file));
}
const indexPath = path.join(output, "index.html");
let html = await readFile(indexPath, "utf8");
for (const file of ["styles.css", "app.js", "vendor/checklist-pdf.js"]) {
  const contents = await readFile(path.join(output, file));
  const version = createHash("sha256").update(contents).digest("hex").slice(0, 12);
  html = html.replaceAll(`./${file}`, `./${file}?v=${version}`);
}
await writeFile(indexPath, html);
const buildFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "template.pdf",
  "vendor/checklist-pdf.js",
  "assets/masengesho-pascal-signature.png",
];
const buildId = createHash("sha256")
  .update(Buffer.concat(await Promise.all(buildFiles.map((file) => readFile(path.join(output, file))))))
  .digest("hex")
  .slice(0, 12);
const workerPath = path.join(output, "service-worker.js");
const worker = await readFile(workerPath, "utf8");
await writeFile(workerPath, worker.replace("__BUILD_ID__", buildId));
console.log(`GitHub Pages files are ready in ${output}`);
