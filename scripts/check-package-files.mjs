import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

// Fail when a doc coding agents read from node_modules/@vllnt/convex-reactions/ is
// missing from the npm tarball, or when llms.txt links to a file that does not ship.
// What must not ship is enforced by scripts/check-package-contents.sh.
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "llms.txt",
  "docs/API.md",
];

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
