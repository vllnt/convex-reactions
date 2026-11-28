import { readFileSync } from "node:fs";

// Fail unless CHANGELOG.md has exactly one section for package.json `version`
// (the `## [X.Y.Z]` heading the release job greps for) and at most one
// unreleased (undated) section, placed first. Released sections carry a date:
// `## [X.Y.Z] - YYYY-MM-DD`.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
// CRLF is normalised, trailing whitespace on a heading is ignored, and `## `
// lines inside fenced code blocks are not headings. A fence closes only on a
// line of fence characters (at least as many as the opener), so an inner
// "```js" line does not close it.
const headings = [];
let fence = null;
for (const raw of readFileSync(process.argv[2] ?? "CHANGELOG.md", "utf8").split(
  /\r?\n/,
)) {
  const line = raw.trimEnd();
  const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
  const closing = /^\s{0,3}(`{3,}|~{3,})$/.exec(line)?.[1];
  if (fence === null && marker !== undefined) {
    fence = marker;
  } else if (
    fence !== null &&
    closing !== undefined &&
    closing[0] === fence[0] &&
    closing.length >= fence.length
  ) {
    fence = null;
  } else if (fence === null && line.startsWith("## ")) {
    headings.push(line);
  }
}
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
