// The client layer the ported page calls. It mirrors the desktop
// `lib/api/activity.ts` surface — SAME function name, SAME (target-first)
// signature, SAME return type — but the call goes over the `window.ryu` bridge
// instead of a direct `fetch`. The `target` argument is IGNORED (the host holds
// the node token; the sandboxed frame never sees it), kept only so the copied
// component call-sites need no edits. Return shapes match the desktop client
// verbatim because the host closure reuses that very client.

import type { RyuBridge } from "./ryu.d.ts";
import type { ActivityItem } from "./types";

/** A node target the shell passes around. In the sandbox it is inert (the host
 *  owns the token); kept so the ported call-sites type-check unchanged. */
export interface ApiTarget {
	token: string | null;
	url: string;
}

export interface ListActivityOptions {
	before?: number;
	limit?: number;
}

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The activity capability is not available for this app (grant activity:read)."
		);
	}
	return b;
}

/** GET /api/activity — the unified feed (capped, newest-first). */
export function listActivity(
	_t?: ApiTarget,
	options: ListActivityOptions = {}
): Promise<ActivityItem[]> {
	return ryu().activity.list({ limit: options.limit }) as Promise<
		ActivityItem[]
	>;
}

/** Subscribe to the host-owned activity channel and return a disposer. */
export function subscribeLiveActivity(onEvent: () => void): () => void {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	const subscribeEvents = bridge?.shell?.subscribeEvents;
	if (!subscribeEvents) {
		return () => undefined;
	}
	const subscription = subscribeEvents({
		channels: ["activity"],
		onEvent: (event) => {
			if (event.channel === "activity") {
				onEvent();
			}
		},
	});
	return () => subscription.dispose();
}

/** Open the chat tab for a session id — the desktop row-click behavior, routed
 *  through the GENERIC, route-allowlisted `shell.openTab` primitive (was the bespoke
 *  `activity.openSession` verb; docs/renderer-host-slice-1.md). Behavior-identical:
 *  the host opens `/chat` with this conversation, respecting single-tab reuse. */
export function openActivitySession(sessionId: string): void {
	// Fire-and-forget: the sandboxed frame does not await navigation. A denial
	// (e.g. missing `shell:integrate` grant) rejects the promise; swallow it so a
	// row click can never surface an unhandled rejection.
	ryu()
		.shell.openTab({
			path: "/chat",
			conversationId: sessionId,
			title: "Chat",
		})
		.catch(() => undefined);
}

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";
