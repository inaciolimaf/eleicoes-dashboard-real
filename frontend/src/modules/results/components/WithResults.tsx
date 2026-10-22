import { Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconMap2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useElections, useResults } from "../hooks";
import type { Level, ResultsWithDataDto } from "../../../api/models";
import { defaultScope, officeInfo, OFFICE_NAME } from "../../../lib/offices";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { UFS } from "../../../lib/geo-areas";
import { topic } from "../../realtime";
import { useLive } from "../../realtime";
import { Loading, ErrorView, NoData } from "../../../components/States";

/** true quando o cargo é estadual e o recorte é o Brasil (não existe resultado único). */
export function useOfficeWithoutBrResult(cargo: number, nivel: Level): boolean {
  const el = useElections();
  const abr = officeInfo(el.data, cargo)?.coverage ?? defaultScope(cargo);
  return abr === "uf" && nivel === "country";
}

export function StateChoice({ cargo, onUf }: { cargo: number; onUf?: (uf: string, nome: string) => void }) {
  return (
    <Stack align="center" gap="xs" py="md" px="sm">
      <ThemeIcon variant="light" size={40} radius="xl">
        <IconMap2 size={22} />
      </ThemeIcon>
      <Text fw={600} ta="center">
        {OFFICE_NAME[cargo] ?? "Este cargo"} é disputado por UF
      </Text>
      <Text size="sm" c="dimmed" ta="center" maw={420}>
        Não existe um resultado nacional único. Escolha uma UF (ou use o mapa de UFs).
      </Text>
      {onUf && (
        <Group gap={4} justify="center" maw={520}>
          {UFS.filter((u) => cargo !== 8 || u.uf === "df").map((u) => (
            <Button key={u.uf} size="compact-xs" variant="default" onClick={() => onUf(u.uf, u.nome)}>
              {u.uf.toUpperCase()}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  );
}

interface Props {
  nivel?: Level;
  id?: string;
  children: (res: ResultsWithDataDto) => ReactNode;
  linhasSkeleton?: number;
  onUf?: (uf: string, nome: string) => void;
}

/** Busca /resultados do filtro efetivo (com tempo real) e cuida de carregando / sem dados / erro. */
export function WithResults({ nivel, id, children, linhasSkeleton = 4, onUf }: Props) {
  const f = useEffectiveFilter();
  const n = nivel ?? f.nivel;
  const i = id ?? f.id;
  const semBr = useOfficeWithoutBrResult(f.cargo, n);
  const q = useResults({ turno: f.turno, cargo: f.cargo, nivel: n, id: i, t: f.t }, !semBr);
  useLive([!semBr && topic.results(f.turno, f.cargo, n, i)]);
  if (semBr) return <StateChoice cargo={f.cargo} onUf={onUf} />;
  if (q.isLoading) return <Loading linhas={linhasSkeleton} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || q.data.no_data) return <NoData />;
  return <>{children(q.data)}</>;
}
