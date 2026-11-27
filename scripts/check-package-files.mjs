import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

// Docs coding agents read from node_modules/@vllnt/convex-reactions/. Each must ship.
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "llms.txt",
  "docs/API.md",
];
// Contributor files, tests, and specs never ship; docs/ ships only the files listed above.
const forbidden =
  /^(?:AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|\.claude\/|\.github\/|example\/|scripts\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/;

const [pack] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const packed = new Set(pack.files.map((file) => file.path));
const errors = [];
for (const path of required) {
  if (!packed.has(path)) errors.push(`missing from the npm tarball: ${path}`);
}
for (const path of packed) {
  if (
    forbidden.test(path) ||
    (path.startsWith("docs/") && !required.includes(path))
  ) {
    errors.push(`must not ship in the npm tarball: ${path}`);
  }
}
// Relative llms.txt links must resolve inside the installed package.
for (const [, target] of readFileSync("llms.txt", "utf8").matchAll(
  /\]\(([^)]+)\)/g,
)) {
  if (/^(?:https?:|#)/.test(target)) continue;
  const path = posix.normalize(target.split("#")[0]);
  if (!packed.has(path))
    errors.push(`llms.txt links to a file outside the tarball: ${target}`);
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Package files OK (${packed.size} files, ${required.length} required present)`,
);
