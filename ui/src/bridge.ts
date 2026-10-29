// Keep the host-independent activity RPCs separate so they can be exercised without
// loading the React theme adapter. The Companion imports this stable facade.

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";
export * from "./bridge-core.ts";
