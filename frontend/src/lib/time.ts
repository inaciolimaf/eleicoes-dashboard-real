import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale("pt-br");

export const TZ = "America/Sao_Paulo";

export const brt = (iso?: string | number | Date | null) => dayjs(iso ?? undefined).tz(TZ);

export function fmtTime(iso?: string | null, withSeconds = true): string {
  if (!iso) return "—";
  return brt(iso).format(withSeconds ? "HH:mm:ss" : "HH:mm");
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return brt(iso).format("DD/MM/YYYY HH:mm:ss");
}

export function fmtShortDate(iso?: string | null): string {
  if (!iso) return "—";
  return brt(iso).format("DD/MM HH:mm");
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  return dayjs(iso).fromNow();
}

/** Minutes from `iso` to `now` (default: the current instant); null when there is no `iso`. */
export function minutesSince(iso?: string | null, now?: string | null): number | null {
  if (!iso) return null;
  return dayjs(now ?? undefined).diff(dayjs(iso), "minute", true);
}

export { dayjs };
