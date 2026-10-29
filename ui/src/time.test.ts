import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { compactAge } from "./time.ts";

// Pin "now" so the Date.now()-relative thresholds are deterministic.
const NOW = new Date("2026-07-23T12:00:00.000Z");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): number {
	return NOW.getTime() - ms;
}

afterEach(() => {
	setSystemTime(); // restore the real clock
});

describe("compactAge", () => {
	it("reports 'now' for anything under a minute", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(0))).toBe("now");
		expect(compactAge(ago(59 * SECOND))).toBe("now");
	});

	it("reports minutes from 1 up to 59", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(MINUTE))).toBe("1m");
		expect(compactAge(ago(59 * MINUTE))).toBe("59m");
	});

	it("reports hours from 1 up to 23", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(HOUR))).toBe("1h");
		expect(compactAge(ago(23 * HOUR))).toBe("23h");
	});

	it("reports days from 1 up to 6", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(DAY))).toBe("1d");
		expect(compactAge(ago(6 * DAY))).toBe("6d");
	});

	it("reports weeks from 7 up to 29 days", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(7 * DAY))).toBe("1w");
		expect(compactAge(ago(29 * DAY))).toBe("4w");
	});

	it("reports months from 30 up to 364 days", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(30 * DAY))).toBe("1mo");
		expect(compactAge(ago(364 * DAY))).toBe("12mo");
	});

	it("reports years at 365 days and beyond", () => {
		setSystemTime(NOW);
		expect(compactAge(ago(365 * DAY))).toBe("1y");
		expect(compactAge(ago(2 * 365 * DAY))).toBe("2y");
	});

	it("rounds down at each boundary (just-under vs just-at)", () => {
		setSystemTime(NOW);
		// 1 second under a full hour is still 59 minutes.
		expect(compactAge(ago(HOUR - SECOND))).toBe("59m");
		// 1 second under a full day is still 23 hours.
		expect(compactAge(ago(DAY - SECOND))).toBe("23h");
	});
});
