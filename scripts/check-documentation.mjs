// Agent-first documentation contract.
//
// `pnpm lint` runs it on the repository (exports read from `src/`);
// `pnpm test:package` runs it again on the installed tarball (exports read from
// the shipped types) and then type-checks the returned examples against the
// built package. External URLs are checked by hand before a docs change, not
// here: network failures would fail CI for reasons unrelated to the docs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/** README `##` sections, in this order. */
export const SECTIONS = [
  "For coding agents",
  "When to use",
  "Install",
  "Quick start",
  "API",
  "Common tasks",
  "Errors and fixes",
  "Limits and gotchas",
  "Compatibility",
  "Testing",
  "Security",
  "Related packages",
  "Contributing",
  "Links",
  "License",
];
const FIRST_LINES = 40;
const OSS = "https://oss.vllnt.com";
const AUTHOR = "https://bntvllnt.com";
/** The retired vllnt domain, assembled so this file never contains it. */
const RETIRED = new RegExp(["vllnt", "ai"].join(String.raw`\.`), "iu");
const MARKETING =
  /\b(?:blazing|seamless(?:ly)?|powerful|effortless(?:ly)?|robust|world-class|best-in-class|cutting-edge|recommend(?:s|ed)?)\b/iu;

/** @param {string} name package name without the scope */
export const footer = (name) =>
  `---\n\nPart of [vllnt open source](${OSS}) · [Package page](${OSS}/packages/${name}) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](${AUTHOR})\n`;

/** @param {string} name package name without the scope */
export const ecosystem = (name) =>
  [
    "## Ecosystem\n",
    `- [Package page](${OSS}/packages/${name})`,
    `- [Release feed](${OSS}/packages/${name}/rss.xml)`,
    `- [All @vllnt packages](${OSS}/llms.txt)`,
    "- [Search vllnt packages and docs](https://index.vllnt.com)",
    "- [vllnt](https://vllnt.com/llms.txt)",
    `- [Author](${AUTHOR})\n`,
  ].join("\n");

/**
 * Body of the README `## Links` section.
 * @param {string} name package name without the scope
 * @param {string} repository GitHub repository URL without `.git`
 */
export const links = (name, repository) =>
  [
    `- Docs and changelog: [oss.vllnt.com/packages/${name}](${OSS}/packages/${name}) · [release feed](${OSS}/packages/${name}/rss.xml)`,
    `- All @vllnt packages: [oss.vllnt.com](${OSS}) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)`,
    `- Source and issues: [GitHub](${repository}) · [issues](${repository}/issues) · [npm](https://www.npmjs.com/package/@vllnt/${name})`,
    `- Questions and updates: [Discord](${AUTHOR}/discord) · [X @bntvllnt](https://x.com/bntvllnt)`,
    `- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](${AUTHOR}) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)`,
    "- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)",
  ].join("\n");

/** GitHub heading anchor. @param {string} heading */
export const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, "")
    .replaceAll(/\s/gu, "-");

/**
 * Fenced code blocks with 1-based start lines. A fence closes only on a line
 * of fence characters, so "```js" inside a block does not close it.
 * @param {string} text
 */
export function codeBlocks(text) {
  /** @type {{ code: string, lang: string, line: number }[]} */
  const blocks = [];
  /** @type {{ fence: string, lang: string, line: number, lines: string[] } | undefined} */
  let open;
  text.split("\n").forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (open === undefined) {
      if (marker) {
        const [, fence = "", info = ""] = marker;
        open = { fence, lang: info.trim(), line: index + 1, lines: [] };
      }
      return;
    }
    const closes =
      marker !== null &&
      marker[1]?.[0] === open.fence[0] &&
      (marker[1]?.length ?? 0) >= open.fence.length &&
      marker[2]?.trim() === "";
    if (!closes) {
      open.lines.push(line);
      return;
    }
    blocks.push({
      code: open.lines.join("\n"),
      lang: open.lang,
      line: open.line,
    });
    open = undefined;
  });
  assert.equal(open, undefined, "unclosed code block");
  return blocks;
}

/** Lines outside code blocks with 1-based line numbers. @param {string} text */
function linesOutsideCode(text) {
  const inCode = new Set(
    codeBlocks(text).flatMap(({ code, line }) =>
      Array.from(
        { length: code.split("\n").length + 2 },
        (_, offset) => line + offset,
      ),
    ),
  );
  return text
    .split("\n")
    .map((content, index) => ({ content, line: index + 1 }))
    .filter(({ line }) => !inCode.has(line));
}

/** Heading anchors, skipping `#` lines in code blocks. @param {string} text */
function anchors(text) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  const headings = linesOutsideCode(text).flatMap(
    ({ content }) => /^#{1,6}\s+(.+)$/u.exec(content)?.slice(1) ?? [],
  );
  return new Set(
    headings.map((heading) => {
      const base = slug(heading);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${String(count)}`;
    }),
  );
}

/** `##` sections outside code blocks. @param {string} text */
function sections(text) {
  const lines = text.split("\n");
  const heads = linesOutsideCode(text).filter(({ content }) =>
    content.startsWith("## "),
  );
  return heads.map((head, index) => ({
    body: lines
      .slice(head.line, (heads[index + 1]?.line ?? lines.length + 1) - 1)
      .join("\n"),
    line: head.line,
    name: head.content.slice(3).trim(),
  }));
}

/** @typedef {ReturnType<typeof sections>[number]} Section */

/** @param {Section[]} parts @param {string} name */
function section(parts, name) {
  const found = parts.find((part) => part.name === name);
  assert.ok(found, `README has no section ${name}`);
  return found;
}

/** @param {string} directory */
const filesUnder = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

/** Title, fixed sections in order, no empty section, short agent note. @param {string} readme @param {string} packageName */
function checkStructure(readme, packageName) {
  assert.ok(
    readme.startsWith(`# ${packageName}\n\n`),
    "README starts with # <package name> and one sentence",
  );
  const intro = readme.split("\n\n")[1] ?? "";
  const stops = intro.match(/[!.?](?=\s|$)/gu) ?? [];
  assert.ok(stops.length === 1 && /[!.?]$/u.test(intro), "title: one sentence");
  const parts = sections(readme);
  assert.deepEqual(
    parts.map(({ name }) => name),
    SECTIONS,
    "README ## sections must be SECTIONS, in order",
  );
  parts.forEach((part) => {
    assert.ok(
      part.body.trim().length > 0,
      `section ${part.name} is empty; say in one line why it does not apply`,
    );
  });
  const note = section(parts, "For coding agents").body.trim();
  assert.ok(note.split("\n").length <= 3, "For coding agents: 3 lines at most");
  return parts;
}

/** 2-4 "Use it when" bullets, then 1-3 "Do not use it when" bullets naming the alternative. @param {string} body @param {string} file */
function checkWhenToUse(body, file) {
  const bullets = body
    .replaceAll(/\n {2,}/gu, " ")
    .split("\n")
    .filter((line) => line.startsWith("- "));
  const use = bullets.filter((line) => line.startsWith("- Use it when "));
  const avoid = bullets.filter((line) =>
    line.startsWith("- Do not use it when "),
  );
  assert.ok(
    use.length >= 2 && use.length <= 4,
    `${file}: 2 to 4 'Use it when'`,
  );
  assert.ok(
    avoid.length > 0 && avoid.length <= 3,
    `${file}: 1 to 3 'Do not use it when'`,
  );
  assert.deepEqual(bullets, [...use, ...avoid], `${file}: 'Use it when' first`);
  avoid.forEach((line) => {
    assert.match(line, /`[^`]+`/u, `${file}: 'Do not use it' names the choice`);
  });
}

/** Install and first example near the top; badges below Quick start. @param {string} readme @param {string} packageName */
function checkTop(readme, packageName) {
  const lines = readme.split("\n");
  const name = packageName.replaceAll(/[$()*+./?[\\\]^{|}]/gu, String.raw`\$&`);
  const pattern = new RegExp(String.raw`\b(?:add|install)\s+${name}\b`, "u");
  const install = lines.findIndex((line) => pattern.test(line));
  assert.ok(
    install !== -1 && install < FIRST_LINES,
    `install command within the first ${String(FIRST_LINES)} lines`,
  );
  const quick = section(sections(readme), "Quick start").line;
  const example = codeBlocks(readme).find((block) => block.line > quick);
  assert.ok(
    example && example.line <= FIRST_LINES,
    `first example within the first ${String(FIRST_LINES)} lines`,
  );
  lines.forEach((line, index) => {
    if (/img\.shields\.io|badge\.svg/u.test(line))
      assert.ok(index + 1 > quick, "badges go below Quick start");
  });
}

/**
 * Every block has a language; README and docs `ts` blocks are complete files
 * that start with a `// <path>.ts` comment and have no `...` gaps.
 * @param {Record<string, string>} texts
 */
function checkCode(texts) {
  Object.entries(texts).forEach(([file, text]) => {
    codeBlocks(text).forEach((block) => {
      assert.ok(block.lang, `${file}:${String(block.line)} has no language`);
    });
  });
  return ["README.md", "docs/API.md"].flatMap((file) =>
    codeBlocks(String(texts[file]))
      .filter((block) => block.lang === "ts")
      .map((block) => {
        const where = `${file}:${String(block.line)}`;
        const gap = /^\s*(?:\/\/\s*)?(?:\.\.\.|…)\s*$/mu;
        assert.doesNotMatch(block.code, gap, `${where} has a ... gap`);
        const path = /^\/\/ (\S+\.m?ts)\n/u.exec(block.code)?.[1];
        assert.ok(path, `${where} must start with a // <path>.ts comment`);
        return { code: block.code, path, where };
      }),
  );
}

/** Relative links and their anchors resolve inside the checked tree. @param {string} root @param {Record<string, string>} texts */
function checkLinks(root, texts) {
  Object.entries(texts).forEach(([file, text]) => {
    const found = text.matchAll(/\]\((?!https?:|mailto:)([^)\s]+)\)/gu);
    [...found].forEach((match) => {
      const link = String(match[1]);
      const [target = "", anchor] = link.split("#");
      const here = join(root, file);
      const resolved = target ? join(dirname(here), target) : here;
      assert.ok(existsSync(resolved), `${file}: ${link} does not resolve`);
      if (anchor !== undefined) {
        const has = anchors(readFileSync(resolved, "utf8")).has(anchor);
        assert.ok(has, `${file}: ${link} has no such anchor`);
      }
    });
  });
}

const COMPILER = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
};

/** @typedef {{ name: string, target: ts.Symbol }} Export */
/** @typedef {{ checker: ts.TypeChecker, entry: string, symbols: Export[] }} Entry */

/** @param {ts.TypeChecker} checker @param {ts.Symbol} module @param {string} entry @returns {Entry} */
function entryOf(checker, module, entry) {
  const symbols = checker.getExportsOfModule(module).map((symbol) => ({
    name: symbol.name,
    target:
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol,
  }));
  assert.ok(symbols.length > 0, `${entry} exports nothing`);
  return { checker, entry, symbols };
}

/**
 * Exports of each entry point from the installed package's types.
 * @param {string} consumer @param {string} packageName @param {string[]} entries
 */
function installedExports(consumer, packageName, entries) {
  const file = join(consumer, "documentation-probe.ts");
  const imports = entries.map(
    (key, index) =>
      `import * as e${String(index)} from "${packageName}${key.slice(1)}";`,
  );
  writeFileSync(file, imports.join("\n"));
  const program = ts.createProgram([file], { ...COMPILER, types: [] });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  assert.ok(source, "the export probe did not compile");
  const statements = source.statements.filter(ts.isImportDeclaration);
  return statements.map((statement, index) => {
    const entry = String(entries[index]);
    const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
    assert.ok(module, `cannot resolve ${entry}`);
    return entryOf(checker, module, entry);
  });
}

/** Source file behind an export target: `./dist/x.d.ts` is built from `src/x.ts`. @param {unknown} target */
function sourceOf(target) {
  const path =
    typeof target === "string"
      ? target
      : String(
          /** @type {{ types?: string, default?: string }} */ (target).types ??
            /** @type {{ default?: string }} */ (target).default,
        );
  return path.replace(/^\.\/dist\/(.+)\.d\.ts$/u, "src/$1.ts");
}

/**
 * Exports of each entry point from the repository sources.
 * @param {string} root @param {Record<string, unknown>} exports @param {string[]} entries
 */
function sourceExports(root, exports, entries) {
  const files = entries.map((key) => resolve(root, sourceOf(exports[key])));
  const program = ts.createProgram(files, {
    ...COMPILER,
    types: ["vite/client"],
  });
  const checker = program.getTypeChecker();
  return files.map((file, index) => {
    const entry = String(entries[index]);
    const source = program.getSourceFile(file);
    assert.ok(source, `${entry}: ${file} not found`);
    const module = checker.getSymbolAtLocation(source);
    assert.ok(module, `${entry}: ${file} is not a module`);
    return entryOf(checker, module, entry);
  });
}

/** @param {ts.TypeChecker} checker @param {ts.Symbol} symbol */
const hasSummary = (checker, symbol) =>
  ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
    .length > 0;

/** Public methods of a class symbol. @param {ts.TypeChecker} checker @param {ts.Symbol} symbol */
const publicMethods = (checker, symbol) =>
  checker
    .getDeclaredTypeOfSymbol(symbol)
    .getProperties()
    .filter((member) => {
      const declaration = member.declarations?.[0];
      if (!(member.flags & ts.SymbolFlags.Method) || !declaration) return false;
      const hidden = ts.ModifierFlags.NonPublicAccessibilityModifier;
      return !(ts.getCombinedModifierFlags(declaration) & hidden);
    });

/** @typedef {{ headings: Set<string>, table: string }} Documented */

/** TSDoc summary, README API row and reference heading. @param {Documented} documented @param {Entry} entry @param {Export} item */
function checkExport({ headings, table }, { checker, entry }, item) {
  const label = item.name === "default" ? entry.slice(2) : item.name;
  const row = item.name === "default" ? "`default" : `\`${label}\``;
  assert.ok(hasSummary(checker, item.target), `${label} has no TSDoc summary`);
  assert.ok(table.includes(row), `README API table lacks ${label}`);
  assert.ok(headings.has(slug(label)), `docs/API.md lacks a ${label} heading`);
  if (!(item.target.flags & ts.SymbolFlags.Class)) return;
  publicMethods(checker, item.target).forEach((method) => {
    const { name } = method;
    assert.ok(hasSummary(checker, method), `${name} has no TSDoc summary`);
    assert.ok(table.includes(`\`${name}(`), `README API table lacks ${name}`);
    assert.ok(headings.has(slug(name)), `docs/API.md lacks a ${name} heading`);
  });
}

/** A main-entry export carries `@see <package page>`. @param {Entry[]} entries @param {string} page */
function checkSee(entries, page) {
  const main = entries.find(({ entry }) => entry === ".");
  assert.ok(main, "package has no main entry");
  const linked = main.symbols.some(({ target }) =>
    target
      .getJsDocTags(main.checker)
      .some(
        (tag) =>
          tag.name === "see" &&
          ts.displayPartsToString(tag.text).includes(page),
      ),
  );
  assert.ok(linked, `a main-entry export needs TSDoc @see ${page}`);
}

/**
 * Every thrown error code and plain `Error` message is in the README errors
 * table and in docs/API.md.
 * @param {string} root @param {string} errors @param {string} reference
 */
function checkErrors(root, errors, reference) {
  const sources = filesUnder(join(root, "src"))
    .filter(
      (file) =>
        file.endsWith(".ts") &&
        !file.includes("_generated") &&
        !/\.(?:test|spec)\.ts$/u.test(file),
    )
    .map((file) => readFileSync(file, "utf8"));
  const codes = new Set(
    sources.flatMap((text) =>
      [...text.matchAll(/\bcode:\s*"([A-Z][\dA-Z_]+)"/gu)].map((match) =>
        String(match[1]),
      ),
    ),
  );
  assert.ok(codes.size > 0, "found no error codes; update the pattern");
  codes.forEach((code) => {
    assert.ok(errors.includes(`\`${code}\``), `Errors and fixes lacks ${code}`);
    assert.ok(reference.includes(code), `docs/API.md lacks ${code}`);
  });
  const messages = sources.flatMap((text) =>
    [...text.matchAll(/new Error\(\s*(?:`([^`]*)`|"([^"]*)")/gu)].map((match) =>
      String(match[1] ?? match[2]).replaceAll(/\$\{(\w+)\}/gu, "<$1>"),
    ),
  );
  messages.forEach((message) => {
    assert.ok(errors.includes(message), `Errors and fixes lacks "${message}"`);
    assert.ok(reference.includes(message), `docs/API.md lacks "${message}"`);
  });
}

/** Summary, when to use, links to the reference and errors, ecosystem block. @param {string} llms @param {string} name @param {string} description */
function checkLlms(llms, name, description) {
  assert.ok(
    llms.split("\n").includes(`> ${description}`),
    "llms.txt: > <package.json description>",
  );
  const when = sections(llms).find((part) => part.name === "When to use");
  assert.ok(when, "llms.txt: ## When to use");
  checkWhenToUse(when.body, "llms.txt");
  assert.ok(llms.includes("](./docs/API.md)"), "llms.txt: link ./docs/API.md");
  const errors = "](./README.md#errors-and-fixes)";
  assert.ok(llms.includes(errors), "llms.txt: link the errors table");
  assert.ok(llms.endsWith(ecosystem(name)), "llms.txt: ends with Ecosystem");
  const index = llms.split(`${OSS}/llms.txt`).length - 1;
  assert.equal(index, 1, "llms.txt links the package index once");
}

/**
 * @vllnt names under "Related packages" link their package page; no marketing
 * words in the docs; the retired vllnt domain appears in no checked file.
 * @param {Record<string, string>} texts @param {string[]} files
 */
function checkWording(texts, files) {
  Object.entries(texts).forEach(([file, text]) => {
    const related =
      sections(text).find((part) => part.name === "Related packages")?.body ??
      "";
    const names = related.matchAll(/\[`?@vllnt\/([\w-]+)`?\]\(([^)]+)\)/gu);
    [...names].forEach(([, other = "", url]) => {
      const page = `${OSS}/packages/${other}`;
      assert.equal(url, page, `${file}: link @vllnt/${other} to ${page}`);
    });
    if (file !== "CHANGELOG.md") {
      const word = MARKETING.exec(text)?.[0];
      assert.equal(word, undefined, `${file}: marketing word "${word}"`);
    }
  });
  files.forEach((file) => {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, RETIRED, `${file} names the retired domain`);
  });
}

/**
 * @typedef {{
 *   author?: { url?: unknown },
 *   bugs?: { url?: unknown },
 *   description?: unknown,
 *   exports: Record<string, unknown>,
 *   funding?: { url?: unknown },
 *   homepage?: unknown,
 *   keywords?: unknown,
 *   license?: unknown,
 *   name: string,
 *   repository?: string | { url?: unknown },
 * }} Metadata
 */

/** @param {Metadata} metadata */
function repositoryUrl({ repository }) {
  const source = typeof repository === "object" ? repository.url : repository;
  assert.ok(typeof source === "string", "package.json needs repository.url");
  return source.replace(/^git\+/u, "").replace(/\.git$/u, "");
}

/** Search and ownership metadata. @param {Metadata} metadata @param {string} name */
function checkMetadata(metadata, name) {
  const { description, keywords } = metadata;
  assert.ok(typeof description === "string", "package.json needs description");
  assert.ok(description.length <= 160, "description: 160 characters at most");
  assert.doesNotMatch(description, /vllnt/iu, "description: not 'for vllnt'");
  assert.ok(Array.isArray(keywords), "package.json needs keywords");
  const unique = new Set(keywords);
  assert.equal(unique.size, keywords.length, "keywords repeat");
  assert.ok(unique.size >= 8 && unique.size <= 12, "8 to 12 keywords");
  const repository = repositoryUrl(metadata);
  assert.equal(metadata.homepage, `${OSS}/packages/${name}`, "homepage");
  assert.equal(metadata.bugs?.url, `${repository}/issues`, "bugs.url");
  assert.ok(typeof metadata.funding?.url === "string", "funding.url");
  assert.equal(metadata.author?.url, AUTHOR, "author.url");
  assert.ok(typeof metadata.license === "string", "license");
}

/**
 * The package.json description opens the README; the README Links section and
 * footer match the shared blocks.
 * @param {string} readme @param {Section[]} parts @param {Metadata} metadata @param {string} name
 */
function checkIdentity(readme, parts, metadata, name) {
  const title = readme.indexOf("\n");
  const intro = readme.slice(title, readme.indexOf("\n## ", title)).trim();
  const sentence = intro.replaceAll(/\s*\n\s*/gu, " ");
  assert.equal(
    sentence,
    metadata.description,
    "README intro: package.json description",
  );
  const body = section(parts, "Links").body.trim();
  assert.equal(
    body,
    links(name, repositoryUrl(metadata)),
    "README Links: the shared block",
  );
  assert.ok(readme.endsWith(footer(name)), "README ends with the vllnt footer");
}

/** Docs keyed by package-relative path. @param {string} root */
function readTexts(root) {
  const references = readdirSync(join(root, "docs")).map(
    (file) => `docs/${file}`,
  );
  const files = ["README.md", "llms.txt", "CHANGELOG.md", ...references];
  return Object.fromEntries(
    files.map((file) => [file, readFileSync(join(root, file), "utf8")]),
  );
}

/**
 * Checks README.md, llms.txt, CHANGELOG.md and docs/ under `root` and returns
 * the README and docs/API.md `ts` examples for the caller to compile.
 * @param {string} root the repository, or the package directory in node_modules
 * @param {string} [consumer] project with the package installed; when set,
 *   exports are read from the installed types instead of `src/`
 */
export function checkDocumentation(root, consumer) {
  /** @type {Metadata} */
  const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const name = metadata.name.split("/").at(-1) ?? metadata.name;
  checkMetadata(metadata, name);
  const texts = readTexts(root);
  const readme = String(texts["README.md"]);
  const reference = String(texts["docs/API.md"]);
  const parts = checkStructure(readme, metadata.name);
  checkWhenToUse(section(parts, "When to use").body, "README.md");
  checkIdentity(readme, parts, metadata, name);
  checkTop(readme, metadata.name);
  checkLinks(root, texts);
  const keys = Object.keys(metadata.exports).filter(
    (key) => key !== "./package.json" && !key.endsWith(".js"),
  );
  const entries =
    consumer === undefined
      ? sourceExports(root, metadata.exports, keys)
      : installedExports(consumer, metadata.name, keys);
  /** @type {Documented} */
  const documented = {
    headings: anchors(reference),
    table: section(parts, "API")
      .body.split("\n")
      .filter((line) => line.startsWith("|"))
      .join("\n"),
  };
  entries.forEach((entry) => {
    entry.symbols.forEach((item) => {
      checkExport(documented, entry, item);
    });
  });
  checkSee(entries, `${OSS}/packages/${name}`);
  checkErrors(root, section(parts, "Errors and fixes").body, reference);
  checkLlms(String(texts["llms.txt"]), name, String(metadata.description));
  const files =
    consumer === undefined
      ? execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
          .split("\0")
          .filter((file) => file !== "" && existsSync(join(root, file)))
          .map((file) => join(root, file))
      : filesUnder(root);
  checkWording(texts, files);
  return checkCode(texts);
}

/**
 * Writes stub host files and the examples under `consumer`, renaming repeated
 * paths; a stub is skipped when an example provides that file.
 * @param {string} consumer @param {Record<string, string>} stubs @param {{ code: string, path: string }[]} examples
 */
export function writeHost(consumer, stubs, examples) {
  const provided = new Set(examples.map(({ path }) => path));
  /** @type {string[]} */
  const seen = [];
  /** @type {string[]} */
  const written = [];
  const files = [
    ...Object.entries(stubs).filter(([path]) => !provided.has(path)),
    ...examples.map(({ code, path }) => [path, code]),
  ];
  files.forEach(([path = "", code = ""]) => {
    const copies = seen.filter((file) => file === path).length;
    const target =
      copies === 0 ? path : path.replace(/\.(m?ts)$/u, `.${String(copies)}.$1`);
    seen.push(path);
    written.push(target);
    mkdirSync(dirname(join(consumer, target)), { recursive: true });
    writeFileSync(join(consumer, target), code);
  });
  return written;
}

/**
 * Component mount names used by the examples' `convex.config.ts` files.
 * @param {string} installed @param {{ code: string, path: string }[]} examples
 */
function mountsOf(installed, examples) {
  const config = join(installed, "src/component/convex.config.ts");
  const definition = /defineComponent\(\s*"([^"]+)"/u;
  const component = definition.exec(readFileSync(config, "utf8"))?.[1];
  assert.ok(component, "cannot read the component name");
  const use = /app\.use\(\s*\w+\s*(?:,\s*\{\s*name:\s*"([^"]+)"\s*\})?\s*\)/gu;
  const names = examples
    .filter(({ path }) => path.endsWith("convex.config.ts"))
    .flatMap(({ code }) => [...code.matchAll(use)])
    .map((match) => match[1] ?? component);
  return [...new Set(names)];
}

/** Example modules that define functions, as `api` keys. @param {{ path: string }[]} examples */
const modulesOf = (examples) =>
  [...new Set(examples.map(({ path }) => path))]
    .filter(
      (path) =>
        path.startsWith("convex/") &&
        !/convex\.config|\.test\.|_generated|schema/u.test(path),
    )
    .map((path) => path.slice("convex/".length, -".ts".length));

/**
 * Stub `convex/_generated` files typed from the examples (`api` and `internal`
 * from the example modules, `components` from their mounts), and a host schema
 * with its own table unless an example provides one.
 * @param {string} installed @param {{ code: string, path: string }[]} examples
 * @returns {Record<string, string>}
 */
export function convexHost(installed, examples) {
  /** @type {{ name: string }} */
  const { name } = JSON.parse(
    readFileSync(join(installed, "package.json"), "utf8"),
  );
  const modules = modulesOf(examples);
  const fields = modules.map(
    (module, index) => `"${module}": typeof m${String(index)};`,
  );
  const mounts = mountsOf(installed, examples).map(
    (mount) => `"${mount}": ComponentApi;`,
  );
  const api = [
    `import type { ComponentApi } from "${name}/_generated/component.js";`,
    `import { anyApi, componentsGeneric, type ApiFromModules, type FilterApi, type FunctionReference } from "convex/server";`,
    ...modules.map(
      (module, index) =>
        `import type * as m${String(index)} from "../${module}.js";`,
    ),
    `type FullApi = ApiFromModules<{ ${fields.join(" ")} }>;`,
    `export const api = anyApi as unknown as FilterApi<FullApi, FunctionReference<any, "public">>;`,
    `export const internal = anyApi as unknown as FilterApi<FullApi, FunctionReference<any, "internal">>;`,
    `export const components = componentsGeneric() as unknown as { ${mounts.join(" ")} };`,
  ];
  return {
    "convex/_generated/api.ts": `${api.join("\n")}\n`,
    "convex/_generated/server.ts": `export { internalMutationGeneric as internalMutation, internalQueryGeneric as internalQuery, mutationGeneric as mutation, queryGeneric as query } from "convex/server";\n`,
    "convex/schema.ts": `import { defineSchema, defineTable } from "convex/server";\nimport { v } from "convex/values";\nexport default defineSchema({ posts: defineTable({ title: v.string() }) });\n`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const examples = checkDocumentation(process.cwd());
  console.log(
    `Documentation OK (${String(SECTIONS.length)} README sections, ${String(examples.length)} ts examples)`,
  );
}
