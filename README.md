# ryu-activity

The unified activity feed for Ryu — everything happening on this node (monitor alerts, finished tasks, runs, approvals, meetings, notes), newest first, grouped by day.

> **The public home of `ryu-activity`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/activity.ui.html`](./dist/activity.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

---

# com.ryu.activity — Activity

The unified activity feed: everything happening on this node — monitor alerts,
finished tasks, runs, approvals, meetings, and notes — newest first, grouped by day.
A read-only, cross-subsystem timeline.

## Parts

- **`ui/` — companion (companion-only app, no backend crate).** A sandboxed
  full-page Companion (Path B, `ui_format: "html"`), built to one self-contained
  `dist/index.html` via `vite-plugin-singlefile`. It calls Core's aggregated
  activity endpoint through the `window.ryu` bridge (`listActivity`,
  `openActivitySession`) — no direct `fetch`, no node token in the sandbox — and
  renders the merged stream grouped by day.

There is no dedicated backend crate or sidecar: Core aggregates the feed across
subsystems; this app is only the surface.

## Manifest (`plugin.json`)

- **Capability grant:** `activity:read` — a read-only bridge capability (the app
  never mutates node state; it only reads the feed and deep-links into a session).
- **Runnable:** one `companion` (`Activity`, icon `activity`).

## Surfaces as

A companion route in the shell (label **Activity**). Clicking an item deep-links to
the originating session/run via `host.navigate`.
