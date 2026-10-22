import { useEffect } from "react";
import { liveSocket } from "./socket";

/** Subscribes to WebSocket topics while the component is mounted (reference-counted). */
export function useLive(topics: (string | null | undefined | false)[]) {
  const list = topics.filter((t): t is string => typeof t === "string" && t.length > 0);
  const key = [...new Set(list)].sort().join("|");
  useEffect(() => {
    if (!key) return;
    return liveSocket.subscribe(key.split("|"));
  }, [key]);
}
