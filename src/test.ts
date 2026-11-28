/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";
import { COMPONENT_NAME } from "./shared.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register this component with a `convex-test` instance so consuming apps can
 * test integration: `import { register } from "@vllnt/convex-reactions/test"`.
 *
 * @param t - A `convexTest(hostSchema, modules)` instance; any host schema works.
 * @param name - The mount name (default `"reactions"`), matching `app.use(component, { name })`.
 * @example
 * const t = convexTest(schema, modules);
 * register(t);
 * register(t, "votes");
 */
export function register<TSchema extends GenericSchema>(
  t: TestConvex<SchemaDefinition<TSchema, boolean>>,
  name: string = COMPONENT_NAME,
): void {
  t.registerComponent(name, schema, modules);
}
