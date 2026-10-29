// The activity feed model — ported verbatim from the desktop client
// `apps/desktop/src/lib/api/activity.ts` (snake_case, mirroring Core's serde
// shapes), which the host bridge reuses: its closure calls `listActivity` and
// forwards the result unchanged over the bridge, so the app reads exactly what the
// desktop page read.

import type { z } from "zod";
import type { activityItemSchema } from "./schemas.ts";

export type ActivityItem = z.output<typeof activityItemSchema>;
export type ActivityLevel = ActivityItem["level"];
