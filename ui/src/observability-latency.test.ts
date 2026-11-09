import { describe, expect, it } from "bun:test";
import { formatLatencyMs } from "./observability-latency.ts";

describe("formatLatencyMs", () => {
	it("keeps the compact English form", () => {
		expect(formatLatencyMs(123, "en")).toBe("123ms");
		expect(formatLatencyMs(122.6, "en")).toBe("123ms");
		expect(formatLatencyMs(1234, "en")).toBe("1234ms");
	});

	it("renders an em dash for a missing latency", () => {
		expect(formatLatencyMs(null, "de")).toBe("—");
		expect(formatLatencyMs(Number.NaN, "ar")).toBe("—");
	});

	it("uses German grouping and the localized unit", () => {
		const value = formatLatencyMs(1234, "de");
		expect(value).toContain("1.234");
		expect(value).toContain("ms");
		expect(value).not.toBe("1234ms");
	});

	it("uses Japanese grouping", () => {
		const value = formatLatencyMs(1234, "ja");
		expect(value).toContain("1,234");
		expect(value).not.toBe("1234ms");
	});

	it("uses the Arabic unit and the locale's digits", () => {
		const arabic = formatLatencyMs(123, "ar");
		expect(arabic).toContain("ملي");
		expect(arabic).not.toContain("ms");
		const egyptian = formatLatencyMs(123, "ar-EG");
		expect(egyptian).toContain("١٢٣");
		expect(egyptian).not.toContain("123");
	});
});
