import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "backend/app/static");
const target = path.join(root, "frontend");
const check = process.argv.includes("--check");
const files = [
  "index.html",
  "panel.css",
  "panel.js",
  "academic.js",
  "attendance.js",
  "device.js",
  "admin.js",
  "experience.js",
  "logo-fatec.png",
  "logo-cps-t.png",
  "logo-sp-t.png",
  "onb1.png",
  "onb2.png",
  "onb3.png",
  "plus-jakarta-sans-latin-wght-normal.woff2",
  "PLUS-JAKARTA-SANS-LICENSE.txt",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "badge-96.png",
  "sw.js",
];
// Pages and the service worker live at the site root; the rest under assets/.
const rootFiles = new Set(["index.html", "sw.js"]);
if (!check) await mkdir(path.join(target, "assets"), { recursive: true });
let failures = 0;
for (const name of files) {
  let content = await readFile(path.join(source, name));
  if (name === "index.html")
    content = Buffer.from(
      content.toString("utf8").replaceAll("/panel/assets/", "/assets/"),
    );
  const destination = path.join(
    target,
    rootFiles.has(name) ? name : "assets/" + name,
  );
  if (check) {
    const actual = await readFile(destination).catch(() => Buffer.alloc(0));
    if (!content.equals(actual)) {
      console.error("Frontend desatualizado: " + name);
      failures++;
    }
  } else await writeFile(destination, content);
}
if (failures) {
  console.error(
    "Execute node scripts/sync-frontend.mjs e inclua os arquivos gerados no commit.",
  );
  process.exitCode = 1;
} else
  console.log(
    check
      ? "Frontend e backend sincronizados."
      : "Frontend atualizado a partir de backend/app/static.",
  );
