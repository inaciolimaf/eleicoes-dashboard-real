import type { QueryClient } from "@tanstack/react-query";
import type { WsClienteMsg, WsServidorMsg } from "../api/types";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { aplicarMensagem } from "./aplicar";

type Ouvinte = (m: WsServidorMsg) => void;

/** Um único WebSocket por aba, com assinaturas por contagem de referência. */
class LiveSocket {
  private ws: WebSocket | null = null;
  private refs = new Map<string, number>();
  private ouvintes = new Set<Ouvinte>();
  private tentativa = 0;
  private reconTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private qc: QueryClient | null = null;
  private jaConectou = false;
  ultimoSeq = 0;

  iniciar(qc: QueryClient) {
    if (this.qc) return;
    this.qc = qc;
    this.conectar();
    let tokenAnterior = useAuth.getState().token;
    useAuth.subscribe((s) => {
      if (s.token === tokenAnterior) return;
      const saiu = tokenAnterior && !s.token;
      tokenAnterior = s.token;
      if (saiu) this.reiniciar();
      else if (s.token) this.enviar({ op: "auth", token: s.token });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.agendar(0);
      }
    });
  }

  private url() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/api/v1/ws`;
  }

  private conectar() {
    if (this.reconTimer) {
      clearTimeout(this.reconTimer);
      this.reconTimer = null;
    }
    useUi.getState().setWsEstado(this.jaConectou ? "reconectando" : "conectando");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.agendar();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const reconexao = this.jaConectou;
      this.jaConectou = true;
      this.tentativa = 0;
      useUi.getState().setWsEstado("aberto");
      const token = useAuth.getState().token;
      if (token) this.enviar({ op: "auth", token });
      const topicos = [...this.refs.keys()];
      if (topicos.length) this.enviar({ op: "sub", topicos });
      this.pingTimer = setInterval(() => this.enviar({ op: "ping" }), 25_000);
      // Recupera o que se perdeu enquanto estava desconectado
      if (reconexao && this.qc) {
        this.qc.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey;
            const raiz = k[0];
            if (raiz === "status" || raiz === "eventos" || raiz === "linha") return true;
            if (raiz === "resultados" || raiz === "filhos" || raiz === "locais" || raiz === "progresso")
              return k[k.length - 1] === null;
            return false;
          },
        });
      }
    };
    ws.onmessage = (ev) => {
      let msg: WsServidorMsg;
      try {
        msg = JSON.parse(String(ev.data)) as WsServidorMsg;
      } catch {
        return;
      }
      if (typeof msg.seq === "number") this.ultimoSeq = msg.seq;
      if (this.qc) aplicarMensagem(this.qc, msg);
      for (const o of this.ouvintes) o(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) {
        this.ws = null;
        useUi.getState().setWsEstado("reconectando");
        this.agendar();
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignora */
      }
    };
  }

  private agendar(ms?: number) {
    if (this.reconTimer) return;
    const espera = ms ?? Math.min(30_000, 1000 * 2 ** this.tentativa) + Math.random() * 500;
    this.tentativa++;
    this.reconTimer = setTimeout(() => {
      this.reconTimer = null;
      this.conectar();
    }, espera);
  }

  private reiniciar() {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* ignora */
    }
    this.agendar(100);
  }

  private enviar(m: WsClienteMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  assinar(topicos: string[]): () => void {
    const novos: string[] = [];
    for (const t of topicos) {
      const n = this.refs.get(t) ?? 0;
      this.refs.set(t, n + 1);
      if (n === 0) novos.push(t);
    }
    if (novos.length) this.enviar({ op: "sub", topicos: novos });
    return () => {
      const remover: string[] = [];
      for (const t of topicos) {
        const n = this.refs.get(t) ?? 0;
        if (n <= 1) {
          this.refs.delete(t);
          remover.push(t);
        } else this.refs.set(t, n - 1);
      }
      if (remover.length) this.enviar({ op: "unsub", topicos: remover });
    };
  }

  ouvir(o: Ouvinte): () => void {
    this.ouvintes.add(o);
    return () => this.ouvintes.delete(o);
  }
}

export const liveSocket = new LiveSocket();
