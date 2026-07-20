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
export type ApiTarget = { url: string; token: string | null };

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

/** Subscribe to the host's LIVE theme tokens and apply them as inline custom
 *  properties on `<html>` (inline style beats both the app's own `:root{}` defaults
 *  and the host's mount-time `html:root{}` injection), so the companion re-themes
 *  when the user toggles light/dark WITHOUT a remount. This is a NET-NEW shell
 *  privilege a decoupled companion had no path to before slice 1 (theme was a
 *  mount-time snapshot only). Returns a disposer. No-op if `shell` is unavailable. */
export function subscribeLiveTheme(): () => void {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	if (!bridge?.shell?.subscribeTheme) {
		return () => undefined;
	}
	const sub = bridge.shell.subscribeTheme({
		onChange: (tokens) => {
			const root = document.documentElement;
			for (const [name, value] of Object.entries(tokens)) {
				if (name.startsWith("--") && typeof value === "string") {
					root.style.setProperty(name, value);
				}
			}
		},
	});
	return () => sub.dispose();
}
