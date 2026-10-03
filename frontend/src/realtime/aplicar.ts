import type { QueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import type { Evento, FilhosResp, ItemFilho, LocaisResp, LocalMapa, Nivel, WsServidorMsg } from "../api/types";
import { qk, type EventosFiltro } from "../api/hooks";
import { useTempo } from "../store/tempo";
import { usePrefs } from "../store/prefs";
import { nivelFilho } from "../lib/recortes";

const ROTULO_EVENTO: Record<string, string> = {
  virada: "Virada",
  marco: "Marco da apuração",
  eleito: "Eleito",
  segundo_turno: "2º turno",
  matematicamente_definido: "Matematicamente definido",
  finalizado: "Apuração finalizada",
  inicio: "Início da divulgação",
};
const COR_EVENTO: Record<string, string> = {
  virada: "orange",
  marco: "blue",
  eleito: "green",
  segundo_turno: "yellow",
  matematicamente_definido: "teal",
  finalizado: "grape",
  inicio: "cyan",
};
export { ROTULO_EVENTO, COR_EVENTO };

function recontarVitorias(r: FilhosResp): FilhosResp {
  const cont = new Map<string, number>();
  for (const it of r.itens) if (it.lider) cont.set(it.lider.sqcand, (cont.get(it.lider.sqcand) ?? 0) + 1);
  return { ...r, candidatos: r.candidatos.map((c) => ({ ...c, vitorias: cont.get(c.sqcand) ?? 0 })) };
}

function patchFilho(old: FilhosResp | undefined, item: ItemFilho): FilhosResp | undefined {
  if (!old) return old;
  let achou = false;
  const itens = old.itens.map((i) => {
    if (i.id !== item.id) return i;
    achou = true;
    return { ...i, ...item, valores: item.valores ?? i.valores };
  });
  if (!achou) itens.push(item);
  return recontarVitorias({ ...old, itens });
}

function patchLocal(old: LocaisResp | undefined, item: LocalMapa): LocaisResp | undefined {
  if (!old) return old;
  let achou = false;
  const itens = old.itens.map((i) => {
    if (i.id !== item.id) return i;
    achou = true;
    return { ...i, ...item };
  });
  return achou ? { ...old, itens } : old;
}

function eventoCasa(e: Evento, f: EventosFiltro): boolean {
  if (f.cargo && e.cargo && Number(e.cargo) !== f.cargo) return false;
  if (f.tipos?.length && !f.tipos.includes(e.tipo)) return false;
  if (f.nivel && f.id && (e.nivel !== f.nivel || e.recorte_id !== f.id)) return false;
  return true;
}

export function notificarNavegador(titulo: string, corpo: string) {
  if (!usePrefs.getState().push) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(titulo, { body: corpo, icon: "/favicon.svg", tag: titulo });
  } catch {
    /* alguns navegadores só aceitam via service worker */
  }
}

export function aplicarMensagem(qc: QueryClient, msg: WsServidorMsg) {
  const congelado = useTempo.getState().t !== null;
  switch (msg.tipo) {
    case "status":
      qc.setQueryData(qk.status(), msg.dados);
      return;
    case "alerta": {
      notifications.show({ title: `🔔 ${msg.dados.titulo}`, message: msg.dados.descricao, color: "grape", autoClose: 10000 });
      const p = usePrefs.getState();
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && p.push !== false) {
        try {
          new Notification(msg.dados.titulo, { body: msg.dados.descricao, icon: "/favicon.svg" });
        } catch {
          /* ignora */
        }
      }
      return;
    }
    case "evento": {
      const e = msg.dados;
      const turno = Number(msg.topico.split(":")[1] ?? 1);
      for (const q of qc.getQueryCache().findAll({ queryKey: ["eventos", turno] })) {
        const f = (q.queryKey[2] ?? {}) as EventosFiltro;
        if (!eventoCasa(e, f)) continue;
        qc.setQueryData<Evento[]>(q.queryKey, (old) =>
          old ? (old.some((x) => x.id === e.id) ? old : [e, ...old].slice(0, Math.max(f.limite ?? 100, 100))) : old,
        );
      }
      if (e.nivel === "br" || e.nivel === "uf") {
        qc.setQueryData(qk.linha(turno), (old: { eventos: Evento[] } | undefined) =>
          old && !old.eventos.some((x) => x.id === e.id) ? { ...old, eventos: [...old.eventos, e] } : old,
        );
      }
      if (congelado) useTempo.getState().incNovidades();
      const prefs = usePrefs.getState();
      if (prefs.toasts.includes(e.tipo)) {
        notifications.show({
          title: e.titulo,
          message: e.descricao ?? ROTULO_EVENTO[e.tipo] ?? e.tipo,
          color: COR_EVENTO[e.tipo] ?? "blue",
          autoClose: 7000,
        });
        if (e.tipo === "eleito" || e.tipo === "virada") notificarNavegador(e.titulo, e.descricao ?? "");
      }
      return;
    }
    case "res": {
      if (congelado) {
        useTempo.getState().incNovidades();
        return;
      }
      const [, turno, cargo, nivel, ...resto] = msg.topico.split(":");
      qc.setQueryData(qk.resultados(Number(turno), Number(cargo), nivel as Nivel, resto.join(":"), null), msg.dados);
      return;
    }
    case "filho": {
      if (congelado) return;
      const [, turno, cargo, nivel, id, filhosNivel] = msg.topico.split(":");
      const nv = nivel as Nivel;
      const alvo = (filhosNivel as Nivel | undefined) ?? nivelFilho(nv);
      for (const q of qc.getQueryCache().findAll({ queryKey: ["filhos", Number(turno), Number(cargo), nv, id] })) {
        const k = q.queryKey;
        const kFilhos = (k[5] as Nivel | null) ?? nivelFilho(nv);
        if (k[7] !== null || kFilhos !== alvo) continue;
        qc.setQueryData<FilhosResp>(k, (old) => patchFilho(old, msg.dados));
      }
      return;
    }
    case "local": {
      if (congelado) return;
      const [, turno, cargo, municipio] = msg.topico.split(":");
      const uf = municipio.slice(0, 2);
      for (const q of qc.getQueryCache().findAll({ queryKey: ["locais", Number(turno), Number(cargo)] })) {
        const k = q.queryKey;
        if (k[5] !== null) continue;
        const kUf = k[3] as string | null;
        const kMun = k[4] as string | null;
        if (kMun ? kMun !== municipio : kUf ? kUf !== uf : false) continue;
        qc.setQueryData<LocaisResp>(k, (old) => patchLocal(old, msg.dados));
      }
      return;
    }
    case "progresso": {
      if (congelado) return;
      const turno = Number(msg.topico.split(":")[1] ?? 1);
      qc.setQueryData(qk.progresso(turno, null), msg.dados);
      return;
    }
    case "erro":
      console.warn("[ws] erro do servidor:", msg.mensagem);
      return;
    default:
      return;
  }
}
