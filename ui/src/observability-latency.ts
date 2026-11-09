import { activeLocale } from "@ryu/i18n/core";
import { formatDurationUnit } from "@ryu/i18n/format-intl";

/**
 * Formats a latency in whole milliseconds with the locale's digits and short
 * unit (`123ms` in English, `١٢٣ ملي ث` in Arabic). `null` renders as an em dash.
 */
export function formatLatencyMs(
	milliseconds: number | null,
	locale: string = activeLocale()
): string {
	if (milliseconds === null || !Number.isFinite(milliseconds)) {
		return "—";
	}
	return formatDurationUnit(Math.round(milliseconds), "millisecond", 0, locale);
}
