import { describe, expect, it } from "bun:test";
import {
	normalizeAudit,
	observabilityAuditStatus,
} from "./observability-state.ts";

describe("observability audit state", () => {
	it("treats missing or malformed responses as unreachable", () => {
		expect(normalizeAudit(undefined)).toEqual({
			entries: [],
			reachable: false,
		});
		expect(normalizeAudit({})).toEqual({ entries: [], reachable: false });
		expect(normalizeAudit({ entries: [] })).toEqual({
			entries: [],
			reachable: false,
		});
	});

	it("preserves an explicit gateway reachability result", () => {
		expect(normalizeAudit({ entries: [], reachable: true })).toEqual({
			entries: [],
			reachable: true,
		});
		expect(normalizeAudit({ entries: [], reachable: false })).toEqual({
			entries: [],
			reachable: false,
		});
	});

	it("keeps the status checking until the first request settles", () => {
		expect(
			observabilityAuditStatus({
				isError: false,
				isLoading: true,
				reachable: false,
			})
		).toBe("checking");
	});

	it("does not report live after an error or an unavailable response", () => {
		expect(
			observabilityAuditStatus({
				isError: true,
				isLoading: false,
				reachable: true,
			})
		).toBe("unavailable");
		expect(
			observabilityAuditStatus({
				isError: false,
				isLoading: false,
				reachable: false,
			})
		).toBe("unavailable");
	});

	it("reports live only for a settled reachable response", () => {
		expect(
			observabilityAuditStatus({
				isError: false,
				isLoading: false,
				reachable: true,
			})
		).toBe("live");
	});
});
