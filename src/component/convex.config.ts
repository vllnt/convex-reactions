import { defineComponent } from "convex/server";

/**
 * The reactions component definition. Mount it in the host's
 * `convex/convex.config.ts` with `app.use(reactions)`, or
 * `app.use(reactions, { name })` for another isolated instance.
 */
const component = defineComponent("reactions");

// Nest official child components here, e.g.:
// import aggregate from "@convex-dev/aggregate/convex.config";
// component.use(aggregate);

export default component;
