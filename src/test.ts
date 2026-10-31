/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import schema from "./component/schema.js";
import { COMPONENT_NAME } from "./shared.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register this component with a `convex-test` instance so consuming apps can
 * test integration: `import { register } from "@vllnt/convex-reactions/test"`.
 */
export function register(
  t: TestConvex<typeof schema>,
  name: string = COMPONENT_NAME,
): void {
  t.registerComponent(name, schema, modules);
}
