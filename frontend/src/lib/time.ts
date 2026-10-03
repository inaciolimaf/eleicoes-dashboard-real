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

export function fmtHora(iso?: string | null, comSegundos = true): string {
  if (!iso) return "—";
  return brt(iso).format(comSegundos ? "HH:mm:ss" : "HH:mm");
}

export function fmtDataHora(iso?: string | null): string {
  if (!iso) return "—";
  return brt(iso).format("DD/MM/YYYY HH:mm:ss");
}

export function fmtDataCurta(iso?: string | null): string {
  if (!iso) return "—";
  return brt(iso).format("DD/MM HH:mm");
}

export function fmtRelativo(iso?: string | null): string {
  if (!iso) return "—";
  return dayjs(iso).fromNow();
}

export function minutosDesde(iso?: string | null, agora?: string | null): number | null {
  if (!iso) return null;
  return dayjs(agora ?? undefined).diff(dayjs(iso), "minute", true);
}

export { dayjs };
