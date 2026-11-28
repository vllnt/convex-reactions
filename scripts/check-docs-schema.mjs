import { readFileSync } from "node:fs";

// Fail when the docs name a table or index the component schema does not define,
// or when AGENTS.md or docs/API.md leave a defined table or index out. The schema
// file is the single source; this keeps the docs from describing an old one.
const schemaPath = "src/component/schema.ts";
const mentionDocs = ["AGENTS.md", "docs/API.md"];
const scanDocs = [...mentionDocs, "README.md", "llms.txt"];

const schema = readFileSync(schemaPath, "utf8");
const tables = [...schema.matchAll(/^\s*(\w+):\s*defineTable\(/gm)].map(
  ([, name]) => name,
);
const indexes = new Set(
  [...schema.matchAll(/\.index\(\s*"(\w+)"/g)].map(([, name]) => name),
);
const errors = [];
if (tables.length === 0 || indexes.size === 0) {
  errors.push(`${schemaPath}: found no tables or indexes to check against`);
}
for (const doc of scanDocs) {
  const text = readFileSync(doc, "utf8");
  for (const [, name] of text.matchAll(/`(by_\w+)`/g)) {
    if (!indexes.has(name)) {
      errors.push(
        `${doc}: names index \`${name}\`, not defined in ${schemaPath}`,
      );
    }
  }
}
for (const doc of mentionDocs) {
  const text = readFileSync(doc, "utf8");
  for (const name of [...tables, ...indexes]) {
    if (!text.includes(`\`${name}\``)) {
      errors.push(`${doc}: does not mention \`${name}\` from ${schemaPath}`);
    }
  }
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Docs match the schema (${tables.length} tables, ${indexes.size} indexes)`,
);
