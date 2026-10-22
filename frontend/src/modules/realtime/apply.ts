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

/** Recounts each candidate's wins from the leaders of the children. */
function recountWins(data: ChildrenDto): ChildrenDto {
  const counts = new Map<string, number>();
  for (const item of data.items) {
    if (item.leader)
      counts.set(item.leader.tse_candidate_id, (counts.get(item.leader.tse_candidate_id) ?? 0) + 1);
  }
  return {
    ...data,
    candidates: data.candidates.map((c) => ({ ...c, wins: counts.get(c.tse_candidate_id) ?? 0 })),
  };
}

/** Merges one child into the cached list (appended when new), then recounts the wins. */
function patchChildren(old: ChildrenDto | undefined, item: ChildItemDto): ChildrenDto | undefined {
  if (!old) return old;
  let found = false;
  const items = old.items.map((i) => {
    if (i.id !== item.id) return i;
    found = true;
    return { ...i, ...item, values: item.values ?? i.values };
  });
  if (!found) items.push(item);
  return recountWins({ ...old, items });
}

/** Merges one polling place into the cached map list; unknown places are ignored. */
function patchPollingPlaces(
  old: MapPollingPlacesDto | undefined,
  item: MapPollingPlaceDto,
): MapPollingPlacesDto | undefined {
  if (!old) return old;
  let found = false;
  const items = old.items.map((i) => {
    if (i.id !== item.id) return i;
    found = true;
    return { ...i, ...item };
  });
  return found ? { ...old, items } : old;
}

/** Whether an event belongs to the list a cached query asks for. */
function eventMatches(e: EventDto, filter: EventFilter): boolean {
  if (filter.office && e.office_code && Number(e.office_code) !== filter.office) return false;
  if (filter.types?.length && !filter.types.includes(e.type as EventType)) return false;
  if (filter.level && filter.id && (e.level !== filter.level || e.geo_area_id !== filter.id)) return false;
  return true;
}

/** Browser notification, only when the user turned it on and the permission was granted. */
export function notifyBrowser(title: string, body: string) {
  if (!usePrefs.getState().push) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.svg", tag: title });
  } catch {
    /* some browsers only accept notifications through a service worker */
  }
}

function applyEvent(qc: QueryClient, e: EventDto, round: number, frozen: boolean) {
  for (const query of qc.getQueryCache().findAll({ queryKey: ["eventos", round] })) {
    const filter = (query.queryKey[2] ?? {}) as EventFilter;
    if (!eventMatches(e, filter)) continue;
    qc.setQueryData<EventDto[]>(query.queryKey, (old) =>
      old
        ? old.some((x) => x.id === e.id)
          ? old
          : [e, ...old].slice(0, Math.max(filter.limit ?? 100, 100))
        : old,
    );
  }
  if (e.level === "country" || e.level === "state") {
    qc.setQueryData(qk.linha(round), (old: TimelineDto | undefined) =>
      old && !old.events.some((x) => x.id === e.id) ? { ...old, events: [...old.events, e] } : old,
    );
  }
  if (frozen) useTime.getState().incNovidades();
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
  const prefs = usePrefs.getState();
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && prefs.push !== false) {
    try {
      new Notification(data.title, { body: data.description, icon: "/favicon.svg" });
    } catch {
      /* ignored */
    }
  }
}

/** Applies one WebSocket message to the query cache (and to the notifications). */
export function applyMessage(qc: QueryClient, msg: WsServerMessage) {
  const frozen = useTime.getState().t !== null;
  switch (msg.type) {
    case "status":
      qc.setQueryData(qk.status(), msg.data);
      return;
    case "alert":
      applyAlert(msg.data);
      return;
    case "event":
      applyEvent(qc, msg.data, Number(msg.topic.split(":")[1] ?? 1), frozen);
      return;
    case "results": {
      if (frozen) {
        useTime.getState().incNovidades();
        return;
      }
      const [, round, office, level, ...rest] = msg.topic.split(":");
      qc.setQueryData(
        qk.resultados(Number(round), Number(office), level as Level, rest.join(":"), null),
        msg.data,
      );
      return;
    }
    case "children": {
      if (frozen) return;
      const [, round, office, level, id, childrenLevel] = msg.topic.split(":");
      const parentLevel = level as Level;
      const targetLevel = (childrenLevel as Level | undefined) ?? childLevel(parentLevel);
      for (const query of qc
        .getQueryCache()
        .findAll({ queryKey: ["filhos", Number(round), Number(office), parentLevel, id] })) {
        const key = query.queryKey;
        const keyChildLevel = (key[5] as Level | null) ?? childLevel(parentLevel);
        if (key[7] !== null || keyChildLevel !== targetLevel) continue;
        qc.setQueryData<ChildrenDto>(key, (old) => patchChildren(old, msg.data));
      }
      return;
    }
    case "polling_place": {
      if (frozen) return;
      const [, round, office, municipality] = msg.topic.split(":");
      const state = municipality.slice(0, 2);
      for (const query of qc
        .getQueryCache()
        .findAll({ queryKey: ["locais", Number(round), Number(office)] })) {
        const key = query.queryKey;
        if (key[5] !== null) continue;
        const keyState = key[3] as string | null;
        const keyMunicipality = key[4] as string | null;
        if (keyMunicipality ? keyMunicipality !== municipality : keyState ? keyState !== state : false)
          continue;
        qc.setQueryData<MapPollingPlacesDto>(key, (old) => patchPollingPlaces(old, msg.data));
      }
      return;
    }
    case "progress": {
      if (frozen) return;
      const round = Number(msg.topic.split(":")[1] ?? 1);
      qc.setQueryData(qk.progresso(round, null), msg.data);
      return;
    }
    case "error":
      console.warn("[ws] erro do servidor:", msg.message);
      return;
    default:
      return;
  }
}
