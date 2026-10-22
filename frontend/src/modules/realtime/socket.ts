import type { QueryClient } from "@tanstack/react-query";
import type { WsClientMessage, WsServerMessage } from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { useUi } from "../../lib/ui-store";
import { applyMessage } from "./apply";

type Listener = (m: WsServerMessage) => void;

/** One WebSocket per tab, with subscriptions counted by reference (a topic is sent once per tab). */
class LiveSocket {
  private ws: WebSocket | null = null;
  private refs = new Map<string, number>();
  private listeners = new Set<Listener>();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private qc: QueryClient | null = null;
  private hasConnected = false;
  ultimoSeq = 0;

  /** Connects once and keeps the cache in sync: login/logout reauthenticate, a reconnect refetches. */
  iniciar(qc: QueryClient) {
    if (this.qc) return;
    this.qc = qc;
    this.connect();
    let previousToken = useAuth.getState().token;
    useAuth.subscribe((s) => {
      if (s.token === previousToken) return;
      const loggedOut = previousToken && !s.token;
      previousToken = s.token;
      if (loggedOut) this.restart();
      else if (s.token) this.send({ op: "auth", token: s.token });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.schedule(0);
      }
    });
  }

  private url() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/api/v1/ws`;
  }

  private connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    useUi.getState().setWsEstado(this.hasConnected ? "reconectando" : "conectando");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => this.handleOpen();
    ws.onmessage = (ev) => this.handleMessage(ev);
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) {
        this.ws = null;
        useUi.getState().setWsEstado("reconectando");
        this.schedule();
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignored */
      }
    };
  }

  private handleOpen() {
    const isReconnect = this.hasConnected;
    this.hasConnected = true;
    this.attempt = 0;
    useUi.getState().setWsEstado("aberto");
    const token = useAuth.getState().token;
    if (token) this.send({ op: "auth", token });
    const topics = [...this.refs.keys()];
    if (topics.length) this.send({ op: "subscribe", topics });
    this.pingTimer = setInterval(() => this.send({ op: "ping" }), 25_000);
    // Recovers what was missed while disconnected
    if (isReconnect && this.qc) {
      this.qc.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          const root = key[0];
          if (root === "status" || root === "eventos" || root === "linha") return true;
          if (root === "resultados" || root === "filhos" || root === "locais" || root === "progresso")
            return key[key.length - 1] === null;
          return false;
        },
      });
    }
  }

  private handleMessage(ev: MessageEvent) {
    let msg: WsServerMessage;
    try {
      msg = JSON.parse(String(ev.data)) as WsServerMessage;
    } catch {
      return;
    }
    if (typeof msg.seq === "number") this.ultimoSeq = msg.seq;
    if (this.qc) applyMessage(this.qc, msg);
    for (const listener of this.listeners) listener(msg);
  }

  /** Reconnects after a delay: exponential backoff, capped at 30 s, with jitter. */
  private schedule(ms?: number) {
    if (this.reconnectTimer) return;
    const delay = ms ?? Math.min(30_000, 1000 * 2 ** this.attempt) + Math.random() * 500;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private restart() {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* ignored */
    }
    this.schedule(100);
  }

  private send(m: WsClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Subscribes to topics; returns the function that releases them (a topic is unsubscribed at its last release). */
  subscribe(topics: string[]): () => void {
    const added: string[] = [];
    for (const topic of topics) {
      const count = this.refs.get(topic) ?? 0;
      this.refs.set(topic, count + 1);
      if (count === 0) added.push(topic);
    }
    if (added.length) this.send({ op: "subscribe", topics: added });
    return () => {
      const removed: string[] = [];
      for (const topic of topics) {
        const count = this.refs.get(topic) ?? 0;
        if (count <= 1) {
          this.refs.delete(topic);
          removed.push(topic);
        } else this.refs.set(topic, count - 1);
      }
      if (removed.length) this.send({ op: "unsubscribe", topics: removed });
    };
  }

  /** Listens to every server message; returns the function that stops listening. */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const liveSocket = new LiveSocket();
