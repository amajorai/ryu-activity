// `compactAge`: a list badge's age ("now", "5m", "3h", "2d", "4w", "6mo",
// "1y" in English), with the same thresholds as the desktop shell's
// `apps/desktop/src/lib/time.ts` (the shell util cannot be imported into the
// sandboxed frame). Other locales get their own unit abbreviations ("5分",
// "5 мин") from `formatCompactAge` in the language the Companion shows.

import { activeLocale, formatCompactAge } from "@ryu/i18n/core";

export function compactAge(timestamp: number, locale = activeLocale()): string {
	return formatCompactAge(locale, timestamp);
}
