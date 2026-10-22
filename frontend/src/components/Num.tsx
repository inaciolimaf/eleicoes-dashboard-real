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
  value: number | null | undefined;
  kind?: "int" | "pct" | "pp" | "compact" | "dec";
  decimals?: number;
  className?: string;
  style?: CSSProperties;
  suffix?: string;
  prefix?: string;
  glow?: boolean;
}

/** Animated number (it rolls to the new value), formatted in pt-BR, with a glow when it changes. */
export function Num({
  value,
  kind = "int",
  decimals,
  className,
  style,
  suffix,
  prefix,
  glow = true,
}: NumProps) {
  const animated = usePrefs((s) => s.animacoes);
  const flash = useFlash(value);
  const classes = ["num", glow && flash ? "glow" : "", className ?? ""].join(" ");
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={classes} style={style}>
        —
      </span>
    );
  }
  const digits = decimals ?? (kind === "pct" || kind === "pp" ? 2 : kind === "dec" ? 1 : 0);
  const format: Format =
    kind === "compact"
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: kind === "int" ? 0 : digits, maximumFractionDigits: digits };
  const suffixText = suffix ?? (kind === "pct" ? "%" : kind === "pp" ? " p.p." : undefined);
  return (
    <span className={classes} style={{ display: "inline-block", ...style }}>
      <NumberFlow
        value={value}
        locales="pt-BR"
        format={format}
        suffix={suffixText}
        prefix={prefix}
        animated={animated}
        willChange
      />
    </span>
  );
}
