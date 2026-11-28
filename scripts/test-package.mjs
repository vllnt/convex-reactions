// Package test (`pnpm test:package`, run after `pnpm build`): pack the package,
// install the tarball in one temporary consumer on the lowest supported convex,
// import every runtime entry point, rerun the docs contract on the installed
// files, type-check every README and docs/API.md example and a consumer of every
// entry point against the built package, and run the README test, which mounts
// `register(t)` on a host schema with its own table.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
  checkDocumentation,
  convexHost,
  writeHost,
} from "./check-documentation.mjs";

/** Consumer toolchain: the lowest supported convex and a pinned TypeScript. */
const CONSUMER_DEPENDENCIES = [
  "convex@1.45.0",
  "typescript@5.9.3",
  "convex-test@0.0.56",
  "vite@8.2.2",
  "vitest@5.1.1",
  "@edge-runtime/vm@5.0.0",
];

const root = process.cwd();
/** @type {{ name: string, version: string }} */
const metadata = JSON.parse(readFileSync("package.json", "utf8"));
const tarball = `${metadata.name.replace("@", "").replace("/", "-")}-${metadata.version}.tgz`;
const temporary = mkdtempSync(join(tmpdir(), "reactions-consumer-"));

/** @param {string} command @param {string[]} arguments_ @param {string} [cwd] */
const run = (command, arguments_, cwd = temporary) =>
  execFileSync(command, arguments_, { cwd, stdio: "inherit" });

/** @param {"Bundler" | "NodeNext"} resolution @param {string[]} types @param {string[]} files */
const typecheck = (resolution, types, files) =>
  run("pnpm", [
    "exec",
    "tsc",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    resolution === "Bundler" ? "ESNext" : "NodeNext",
    "--moduleResolution",
    resolution,
    "--target",
    "ES2022",
    ...(types.length > 0 ? ["--types", types.join(",")] : []),
    ...files,
  ]);

try {
  if (!existsSync(join(root, "dist/client/index.js")))
    throw new Error("dist/ is missing: run `pnpm build` first");
  run("pnpm", ["pack", "--pack-destination", temporary], root);
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      pnpm: { ignoredBuiltDependencies: ["esbuild"] },
      private: true,
      type: "module",
    }),
  );
  // The repo's release-age gate (pnpm 10 reads it only from this file), plus the
  // build-script policy, which pnpm 11 reads from here and pnpm 10 from package.json.
  writeFileSync(
    join(temporary, "pnpm-workspace.yaml"),
    `${readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")}allowBuilds:\n  esbuild: false\n`,
  );
  run("pnpm", ["add", join(temporary, tarball), ...CONSUMER_DEPENDENCIES]);

  // Agents read the bundled docs from node_modules, so they must ship.
  const installed = join(temporary, "node_modules", metadata.name);
  const missing = [
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "llms.txt",
    ...readdirSync(join(root, "docs")).map((file) => `docs/${file}`),
  ].filter((file) => !existsSync(join(installed, file)));
  if (missing.length > 0)
    throw new Error(`tarball is missing ${missing.join(", ")}`);

  // Every runtime entry point imports.
  run("node", [
    "--input-type=module",
    "-e",
    [
      `import { Reactions } from "${metadata.name}";`,
      `import config from "${metadata.name}/convex.config";`,
      `import configJs from "${metadata.name}/convex.config.js";`,
      'if (typeof Reactions !== "function" || !config || config !== configJs) throw new Error("missing export");',
    ].join(" "),
  ]);

  // Docs contract on the installed files, then the examples against `dist`.
  const examples = checkDocumentation(installed, temporary);
  const hostFiles = writeHost(
    temporary,
    convexHost(installed, examples),
    examples,
  );
  typecheck("Bundler", ["vite/client"], hostFiles);
  // The README's vitest.config.mts runs its test example.
  run("pnpm", ["exec", "vitest", "run"]);

  // A consumer of every entry point, under both module resolutions.
  writeFileSync(
    join(temporary, "consumer.ts"),
    `
import { Reactions, type KindCount, type ReactResult, type ReactionView, type ReactionsComponent, type ReactionsOptions } from "${metadata.name}";
import type { ComponentApi } from "${metadata.name}/_generated/component";
import type { ComponentApi as ComponentApiJs } from "${metadata.name}/_generated/component.js";
import config from "${metadata.name}/convex.config";
import configJs from "${metadata.name}/convex.config.js";
import { register } from "${metadata.name}/test";
import { convexTest } from "convex-test";
import { defineApp, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
declare const component: ComponentApi;
declare const componentJs: ComponentApiJs;
const options: ReactionsOptions = { allowedKinds: ["up", "down"] };
const typed: ReactionsComponent = component;
const client = new Reactions(typed, options);
const other = new Reactions(componentJs);
const app = defineApp();
app.use(config);
app.use(configJs, { name: "votes" });
const host = defineSchema({ posts: defineTable({ title: v.string() }) });
register(convexTest(host, {}));
register(convexTest(host, {}), "votes");
const shapes: [KindCount?, ReactResult?, ReactionView?] = [];
void client; void other; void shapes;
`,
  );
  typecheck("Bundler", ["vite/client"], ["consumer.ts"]);
  // The shipped test helper is TypeScript source: it must compile for NodeNext too.
  typecheck("NodeNext", [], ["consumer.ts"]);
  console.log("Package test OK");
} finally {
  rmSync(temporary, { force: true, recursive: true });
}
