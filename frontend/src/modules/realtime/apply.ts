import type { QueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import type {
  ChildItemDto,
  ChildrenDto,
  EventDto,
  EventType,
  Level,
  MapPollingPlaceDto,
  MapPollingPlacesDto,
  TimelineDto,
  WsServerMessage,
} from "../../api/models";
import { qk, type EventFilter } from "../../api/query-keys";
import { useTime } from "../../lib/time-store";
import { usePrefs } from "../../lib/prefs-store";
import { childLevel } from "../../lib/geo-areas";
import { EVENT_COLORS, EVENT_LABELS } from "../events";

function recontarVitorias(r: ChildrenDto): ChildrenDto {
  const cont = new Map<string, number>();
  for (const it of r.items) {
    if (it.leader) cont.set(it.leader.tse_candidate_id, (cont.get(it.leader.tse_candidate_id) ?? 0) + 1);
  }
  return {
    ...r,
    candidates: r.candidates.map((c) => ({ ...c, wins: cont.get(c.tse_candidate_id) ?? 0 })),
  };
}

function patchFilho(old: ChildrenDto | undefined, item: ChildItemDto): ChildrenDto | undefined {
  if (!old) return old;
  let achou = false;
  const items = old.items.map((i) => {
    if (i.id !== item.id) return i;
    achou = true;
    return { ...i, ...item, values: item.values ?? i.values };
  });
  if (!achou) items.push(item);
  return recontarVitorias({ ...old, items });
}

function patchLocal(
  old: MapPollingPlacesDto | undefined,
  item: MapPollingPlaceDto,
): MapPollingPlacesDto | undefined {
  if (!old) return old;
  let achou = false;
  const items = old.items.map((i) => {
    if (i.id !== item.id) return i;
    achou = true;
    return { ...i, ...item };
  });
  return achou ? { ...old, items } : old;
}

function eventoCasa(e: EventDto, f: EventFilter): boolean {
  if (f.cargo && e.office_code && Number(e.office_code) !== f.cargo) return false;
  if (f.tipos?.length && !f.tipos.includes(e.type as EventType)) return false;
  if (f.nivel && f.id && (e.level !== f.nivel || e.geo_area_id !== f.id)) return false;
  return true;
}

export function notifyBrowser(titulo: string, corpo: string) {
  if (!usePrefs.getState().push) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(titulo, { body: corpo, icon: "/favicon.svg", tag: titulo });
  } catch {
    /* alguns navegadores só aceitam via service worker */
  }
}

function applyEvent(qc: QueryClient, e: EventDto, turno: number, congelado: boolean) {
  for (const q of qc.getQueryCache().findAll({ queryKey: ["eventos", turno] })) {
    const f = (q.queryKey[2] ?? {}) as EventFilter;
    if (!eventoCasa(e, f)) continue;
    qc.setQueryData<EventDto[]>(q.queryKey, (old) =>
      old
        ? old.some((x) => x.id === e.id)
          ? old
          : [e, ...old].slice(0, Math.max(f.limite ?? 100, 100))
        : old,
    );
  }
  if (e.level === "country" || e.level === "state") {
    qc.setQueryData(qk.linha(turno), (old: TimelineDto | undefined) =>
      old && !old.events.some((x) => x.id === e.id) ? { ...old, events: [...old.events, e] } : old,
    );
  }
  if (congelado) useTime.getState().incNovidades();
  const prefs = usePrefs.getState();
  if (prefs.toasts.includes(e.type)) {
    notifications.show({
      title: e.title,
      message: e.description ?? EVENT_LABELS[e.type as EventType] ?? e.type,
      color: EVENT_COLORS[e.type as EventType] ?? "blue",
      autoClose: 7000,
    });
    if (e.type === "elected" || e.type === "lead_change") notifyBrowser(e.title, e.description ?? "");
  }
}

function applyAlert(data: { title: string; description: string }) {
  notifications.show({
    title: `🔔 ${data.title}`,
    message: data.description,
    color: "grape",
    autoClose: 10000,
  });
  const p = usePrefs.getState();
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && p.push !== false) {
    try {
      new Notification(data.title, { body: data.description, icon: "/favicon.svg" });
    } catch {
      /* ignora */
    }
  }
}

export function applyMessage(qc: QueryClient, msg: WsServerMessage) {
  const congelado = useTime.getState().t !== null;
  switch (msg.type) {
    case "status":
      qc.setQueryData(qk.status(), msg.data);
      return;
    case "alert":
      applyAlert(msg.data);
      return;
    case "event":
      applyEvent(qc, msg.data, Number(msg.topic.split(":")[1] ?? 1), congelado);
      return;
    case "results": {
      if (congelado) {
        useTime.getState().incNovidades();
        return;
      }
      const [, turno, cargo, nivel, ...resto] = msg.topic.split(":");
      qc.setQueryData(
        qk.resultados(Number(turno), Number(cargo), nivel as Level, resto.join(":"), null),
        msg.data,
      );
      return;
    }
    case "children": {
      if (congelado) return;
      const [, turno, cargo, nivel, id, filhosNivel] = msg.topic.split(":");
      const nv = nivel as Level;
      const alvo = (filhosNivel as Level | undefined) ?? childLevel(nv);
      for (const q of qc
        .getQueryCache()
        .findAll({ queryKey: ["filhos", Number(turno), Number(cargo), nv, id] })) {
        const k = q.queryKey;
        const kFilhos = (k[5] as Level | null) ?? childLevel(nv);
        if (k[7] !== null || kFilhos !== alvo) continue;
        qc.setQueryData<ChildrenDto>(k, (old) => patchFilho(old, msg.data));
      }
      return;
    }
    case "polling_place": {
      if (congelado) return;
      const [, turno, cargo, municipio] = msg.topic.split(":");
      const uf = municipio.slice(0, 2);
      for (const q of qc.getQueryCache().findAll({ queryKey: ["locais", Number(turno), Number(cargo)] })) {
        const k = q.queryKey;
        if (k[5] !== null) continue;
        const kUf = k[3] as string | null;
        const kMun = k[4] as string | null;
        if (kMun ? kMun !== municipio : kUf ? kUf !== uf : false) continue;
        qc.setQueryData<MapPollingPlacesDto>(k, (old) => patchLocal(old, msg.data));
      }
      return;
    }
    case "progress": {
      if (congelado) return;
      const turno = Number(msg.topic.split(":")[1] ?? 1);
      qc.setQueryData(qk.progresso(turno, null), msg.data);
      return;
    }
    case "error":
      console.warn("[ws] erro do servidor:", msg.message);
      return;
    default:
      return;
  }
}
