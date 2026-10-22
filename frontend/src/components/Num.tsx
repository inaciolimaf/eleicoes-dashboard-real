import NumberFlow, { type Format } from "@number-flow/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePrefs } from "../lib/prefs-store";

/** How long the "changed cell" glow stays on. */
const FLASH_MS = 1400;

/** Returns true for ~1.4 s whenever `value` changes (the glow of a changed cell). */
export function useFlash(value: unknown): boolean {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (previous.current !== value && previous.current !== undefined) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), FLASH_MS);
      previous.current = value;
      return () => clearTimeout(timer);
    }
    previous.current = value;
  }, [value]);
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

/** Animated number (it rolls to the new value), formatted in pt-BR, with a glow when it changes. */
export function Num({
  valor,
  tipo = "int",
  casas,
  className,
  style,
  sufixo,
  prefixo,
  brilho = true,
}: NumProps) {
  const animated = usePrefs((s) => s.animacoes);
  const flash = useFlash(valor);
  const classes = ["num", brilho && flash ? "glow" : "", className ?? ""].join(" ");
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return (
      <span className={classes} style={style}>
        —
      </span>
    );
  }
  const decimals = casas ?? (tipo === "pct" || tipo === "pp" ? 2 : tipo === "dec" ? 1 : 0);
  const format: Format =
    tipo === "compact"
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: tipo === "int" ? 0 : decimals, maximumFractionDigits: decimals };
  const suffix = sufixo ?? (tipo === "pct" ? "%" : tipo === "pp" ? " p.p." : undefined);
  return (
    <span className={classes} style={{ display: "inline-block", ...style }}>
      <NumberFlow
        value={valor}
        locales="pt-BR"
        format={format}
        suffix={suffix}
        prefix={prefixo}
        animated={animated}
        willChange
      />
    </span>
  );
}
