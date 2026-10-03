import NumberFlow, { type Format } from "@number-flow/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePrefs } from "../../store/prefs";

/** Devolve true por ~1,4 s sempre que `valor` muda (para o brilho de "célula alterada"). */
export function useFlash(valor: unknown): boolean {
  const anterior = useRef(valor);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (anterior.current !== valor && anterior.current !== undefined) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 1400);
      anterior.current = valor;
      return () => clearTimeout(id);
    }
    anterior.current = valor;
  }, [valor]);
  return flash;
}

interface NumProps {
  valor: number | null | undefined;
  tipo?: "int" | "pct" | "pp" | "compact" | "dec";
  casas?: number;
  className?: string;
  style?: CSSProperties;
  sufixo?: string;
  prefixo?: string;
  brilho?: boolean;
}

/** Número animado (rola até o novo valor), formatado em pt-BR e com glow quando muda. */
export function Num({ valor, tipo = "int", casas, className, style, sufixo, prefixo, brilho = true }: NumProps) {
  const animacoes = usePrefs((s) => s.animacoes);
  const flash = useFlash(valor);
  const cls = ["num", brilho && flash ? "glow" : "", className ?? ""].join(" ");
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return (
      <span className={cls} style={style}>
        —
      </span>
    );
  }
  const c = casas ?? (tipo === "pct" || tipo === "pp" ? 2 : tipo === "dec" ? 1 : 0);
  const format: Format =
    tipo === "compact"
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: tipo === "int" ? 0 : c, maximumFractionDigits: c };
  const suf = sufixo ?? (tipo === "pct" ? "%" : tipo === "pp" ? " p.p." : undefined);
  return (
    <span className={cls} style={{ display: "inline-block", ...style }}>
      <NumberFlow
        value={valor}
        locales="pt-BR"
        format={format}
        suffix={suf}
        prefix={prefixo}
        animated={animacoes}
        willChange
      />
    </span>
  );
}
