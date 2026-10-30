// `compactAge` — ported VERBATIM from the desktop shell `apps/desktop/src/lib/
// time.ts` (the shell util cannot be imported into the sandboxed frame). Same
// thresholds, same output ("now" / "5m" / "3h" / "2d" / "4w" / "6mo" / "1y") so
// the rendered relative timestamps are identical to the desktop page.

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

export function compactAge(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < SECONDS_PER_MINUTE) {
		return "now";
	}
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) {
		return `${minutes}m`;
	}
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	if (hours < HOURS_PER_DAY) {
		return `${hours}h`;
	}
	const days = Math.floor(hours / HOURS_PER_DAY);
	if (days < DAYS_PER_WEEK) {
		return `${days}d`;
	}
	if (days < DAYS_PER_MONTH) {
		return `${Math.floor(days / DAYS_PER_WEEK)}w`;
	}
	if (days < DAYS_PER_YEAR) {
		return `${Math.floor(days / DAYS_PER_MONTH)}mo`;
	}
	return `${Math.floor(days / DAYS_PER_YEAR)}y`;
}
