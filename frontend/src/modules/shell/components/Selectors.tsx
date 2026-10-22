import { SegmentedControl, Select } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { useElections } from "../../results";
import { OFFICE_OPTIONS, officeForState, officesOfRound, segmentValue } from "../../../lib/offices";
import { stateOfId } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";

const DEFAULT_CYCLE = "ele2026";
/** Office codes that share one place in the selector: governor (7) and senator (8). */
const SHARED_OFFICE_PAIRS: Record<number, number> = { 7: 8, 8: 7 };

/** Election and round selector ("2026 · 1º turno"). The value is `cycle|round`. */
export function ElectionSelector({ width = 158 }: { width?: number | string }) {
  const elections = useElections();
  const { ciclo: cycle, turno: round, setFiltro: setFilter } = useFilter();
  const options = useMemo(() => {
    const byValue = new Map<string, string>();
    for (const election of elections.data ?? []) {
      const electionCycle = election.cycle ?? DEFAULT_CYCLE;
      const year = electionCycle.replace(/\D/g, "") || "2026";
      byValue.set(`${electionCycle}|${election.round}`, `${year} · ${election.round}º turno`);
    }
    if (!byValue.size) {
      byValue.set("ele2026|1", "2026 · 1º turno");
      byValue.set("ele2026|2", "2026 · 2º turno");
    }
    return [...byValue.entries()].map(([value, label]) => ({ value, label }));
  }, [elections.data]);
  const value =
    options.find((o) => o.value === `${cycle ?? DEFAULT_CYCLE}|${round}`)?.value ??
    options.find((o) => o.value.endsWith(`|${round}`))?.value ??
    null;
  return (
    <Select
      size="sm"
      w={width}
      data={options}
      value={value}
      onChange={(next) => {
        if (!next) return;
        const [nextCycle, nextRound] = next.split("|");
        setFilter({ ciclo: nextCycle, turno: Number(nextRound) });
      }}
      allowDeselect={false}
      aria-label="Eleição e turno"
      comboboxProps={{ withinPortal: true }}
    />
  );
}

/** Office selector: a segmented control on wide screens, a select on narrow ones (or only the select when `onlySelect`). */
export function OfficeSelector({ onlySelect }: { onlySelect?: boolean }) {
  const elections = useElections();
  const { cargo: office, turno: round, ciclo: cycle, nivel: level, id, setFiltro: setFilter } = useFilter();
  const available = officesOfRound(elections.data, round, cycle).map((c) => Number(c.office_code));
  const options = OFFICE_OPTIONS.map((o) => ({
    value: o.valor,
    label: o.rotulo,
    disabled: available.length > 0 && !o.cds.some((cd) => available.includes(cd)),
  }));
  // when the office does not exist in this round (e.g. the 2nd round), go to the first one that does
  useEffect(() => {
    const sharedOffice = SHARED_OFFICE_PAIRS[office];
    const isAvailable =
      available.includes(office) || (sharedOffice !== undefined && available.includes(sharedOffice));
    if (available.length && !isAvailable) setFilter({ cargo: available[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.join(","), office]);
  const changeOffice = (value: string) => {
    const code = Number(value);
    const uf = stateOfId(level, id);
    const next = officeForState(code, uf);
    // the abroad zone only exists for President: keep the scope when it still makes sense
    if (uf === "zz" && next !== 1) setFilter({ cargo: next, nivel: "country", id: "br", nome: "Brasil" });
    else setFilter({ cargo: next });
  };
  if (onlySelect)
    return (
      <Select
        size="sm"
        label="Cargo"
        value={segmentValue(office)}
        onChange={(v) => v && changeOffice(v)}
        data={options}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
    );
  return (
    <>
      <SegmentedControl
        size="sm"
        value={segmentValue(office)}
        onChange={changeOffice}
        data={options}
        visibleFrom="xl"
        aria-label="Cargo"
      />
      <Select
        size="sm"
        w={170}
        value={segmentValue(office)}
        onChange={(v) => v && changeOffice(v)}
        data={options}
        hiddenFrom="xl"
        allowDeselect={false}
        aria-label="Cargo"
        comboboxProps={{ withinPortal: true }}
        visibleFrom="sm"
      />
    </>
  );
}
