import { Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconMap2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useEleicoes, useResultados } from "../../api/hooks";
import type { Nivel, ResultadosComDados } from "../../api/types";
import { abrangenciaPadrao, infoCargo, NOME_CARGO } from "../../lib/cargos";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { UFS } from "../../lib/recortes";
import { topico } from "../../realtime/topicos";
import { useLive } from "../../realtime/useLive";
import { Carregando, ErroView, SemDados } from "../common/Estados";

/** true quando o cargo é estadual e o recorte é o Brasil (não existe resultado único). */
export function useCargoSemResultadoBr(cargo: number, nivel: Nivel): boolean {
  const el = useEleicoes();
  const abr = infoCargo(el.data, cargo)?.abrangencia ?? abrangenciaPadrao(cargo);
  return abr === "uf" && nivel === "br";
}

export function EscolhaUf({ cargo, onUf }: { cargo: number; onUf?: (uf: string, nome: string) => void }) {
  return (
    <Stack align="center" gap="xs" py="md" px="sm">
      <ThemeIcon variant="light" size={40} radius="xl">
        <IconMap2 size={22} />
      </ThemeIcon>
      <Text fw={600} ta="center">
        {NOME_CARGO[cargo] ?? "Este cargo"} é disputado por UF
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
  nivel?: Nivel;
  id?: string;
  children: (res: ResultadosComDados) => ReactNode;
  linhasSkeleton?: number;
  onUf?: (uf: string, nome: string) => void;
}

/** Busca /resultados do filtro efetivo (com tempo real) e cuida de carregando / sem dados / erro. */
export function ComResultados({ nivel, id, children, linhasSkeleton = 4, onUf }: Props) {
  const f = useFiltroEfetivo();
  const n = nivel ?? f.nivel;
  const i = id ?? f.id;
  const semBr = useCargoSemResultadoBr(f.cargo, n);
  const q = useResultados({ turno: f.turno, cargo: f.cargo, nivel: n, id: i, t: f.t }, !semBr);
  useLive([!semBr && topico.res(f.turno, f.cargo, n, i)]);
  if (semBr) return <EscolhaUf cargo={f.cargo} onUf={onUf} />;
  if (q.isLoading) return <Carregando linhas={linhasSkeleton} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || q.data.sem_dados) return <SemDados />;
  return <>{children(q.data)}</>;
}
