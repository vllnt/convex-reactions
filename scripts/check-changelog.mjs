import { readFileSync } from "node:fs";

// Fail unless CHANGELOG.md has exactly one section for package.json `version`
// (the `## [X.Y.Z]` heading the release job greps for) and at most one
// unreleased (undated) section, placed first. Released sections carry a date:
// `## [X.Y.Z] - YYYY-MM-DD`.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const headings = readFileSync("CHANGELOG.md", "utf8")
  .split("\n")
  .filter((line) => line.startsWith("## "));
const dated = /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/;
const errors = [];

const versionHeadings = headings.filter((line) =>
  line.startsWith(`## [${version}]`),
);
if (versionHeadings.length !== 1) {
  errors.push(
    `expected one "## [${version}]" section, found ${versionHeadings.length}`,
  );
}
const undated = headings.filter((line) => !dated.test(line));
if (undated.length > 1) {
  errors.push(`more than one unreleased section: ${undated.join(" | ")}`);
}
if (undated.length === 1 && undated[0] !== headings[0]) {
  errors.push(`the unreleased section must come first: ${undated[0]}`);
}
if (errors.length > 0) {
  console.error(errors.map((error) => `CHANGELOG.md: ${error}`).join("\n"));
  process.exit(1);
}
console.log(`CHANGELOG OK (${version}, ${headings.length} sections)`);
