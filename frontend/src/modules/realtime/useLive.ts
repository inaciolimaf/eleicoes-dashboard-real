import { useEffect } from "react";
import { liveSocket } from "./socket";

/** Assina tópicos do WebSocket enquanto o componente estiver montado (contagem de referência). */
export function useLive(topicos: (string | null | undefined | false)[]) {
  const lista = topicos.filter((t): t is string => typeof t === "string" && t.length > 0);
  const chave = [...new Set(lista)].sort().join("|");
  useEffect(() => {
    if (!chave) return;
    return liveSocket.assinar(chave.split("|"));
  }, [chave]);
}
