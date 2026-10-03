import { ActionIcon, Anchor, Badge, Group, ScrollArea, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import {
  IconArrowsExchange,
  IconCircleCheck,
  IconClockPlay,
  IconFlag,
  IconMathFunction,
  IconPlayerPlay,
  IconRepeat,
  IconTrophy,
  type Icon,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import type { Evento, Nivel } from "../../api/types";
import { useEventos } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { fmtDataCurta, fmtHora } from "../../lib/time";
import { linkRecorte } from "../../lib/recortes";
import { NOME_CARGO } from "../../lib/cargos";
import { COR_EVENTO, ROTULO_EVENTO } from "../../realtime/aplicar";
import { useLive } from "../../realtime/useLive";
import { topico } from "../../realtime/topicos";
import { useTempo } from "../../store/tempo";
import { usePrefs } from "../../store/prefs";
import { Carregando, ErroView, SemDados } from "../common/Estados";

export const ICONE_EVENTO: Record<string, Icon> = {
  virada: IconArrowsExchange,
  marco: IconFlag,
  eleito: IconTrophy,
  segundo_turno: IconRepeat,
  matematicamente_definido: IconMathFunction,
  finalizado: IconCircleCheck,
  inicio: IconPlayerPlay,
};

export const TIPOS_EVENTO = Object.keys(ROTULO_EVENTO).map((k) => ({ value: k, label: ROTULO_EVENTO[k] }));

export function ItemEvento({ e, compacto }: { e: Evento; compacto?: boolean }) {
  const Icone = ICONE_EVENTO[e.tipo] ?? IconFlag;
  const cor = COR_EVENTO[e.tipo] ?? "blue";
  const setT = useTempo((s) => s.setT);
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
      <ThemeIcon variant="light" color={cor} radius="xl" size={compacto ? 26 : 32}>
        <Icone size={compacto ? 14 : 18} />
      </ThemeIcon>
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={700} lineClamp={1}>
            {e.nivel && e.recorte_id ? (
              <Anchor component={Link} to={linkRecorte(e.nivel as Nivel, e.recorte_id)} inherit c="inherit">
                {e.titulo}
              </Anchor>
            ) : (
              e.titulo
            )}
          </Text>
          <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
            {fmtHora(e.ocorrido_em, false)}
          </Text>
        </Group>
        {e.descricao && (
          <Text size="xs" c="dimmed" lineClamp={compacto ? 1 : 3}>
            {e.descricao}
          </Text>
        )}
        {!compacto && (
          <Group gap={6}>
            <Badge size="xs" variant="light" color={cor}>
              {ROTULO_EVENTO[e.tipo] ?? e.tipo}
            </Badge>
            {e.cargo ? (
              <Badge size="xs" variant="outline" color="gray">
                {NOME_CARGO[Number(e.cargo)] ?? `Cargo ${e.cargo}`}
              </Badge>
            ) : null}
            <Tooltip label={`Ver o painel como estava em ${fmtDataCurta(e.ocorrido_em)}`}>
              <ActionIcon size="xs" variant="subtle" onClick={() => setT(e.ocorrido_em)} aria-label="Ir para este momento">
                <IconClockPlay size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Stack>
    </Group>
  );
}

export interface FeedEventosProps {
  tipos?: string[];
  limite?: number;
  cargo?: number | null;
  nivel?: Nivel | null;
  id?: string | null;
  compacto?: boolean;
  alturaMax?: number | string;
}

export function FeedEventos({ tipos, limite = 50, cargo, nivel, id, compacto, alturaMax }: FeedEventosProps) {
  const f = useFiltroEfetivo();
  const animacoes = usePrefs((s) => s.animacoes);
  const q = useEventos(f.turno, { tipos, limite, cargo: cargo ?? null, nivel: nivel ?? null, id: id ?? null }, f.t);
  useLive([topico.eventos(f.turno)]);
  if (q.isLoading) return <Carregando linhas={5} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <SemDados titulo="Nenhum evento ainda">Viradas, marcos da apuração e eleitos aparecem aqui em tempo real.</SemDados>;
  const lista = (
    <Stack gap={0}>
      <AnimatePresence initial={false}>
        {q.data.map((e) => (
          <motion.div
            key={e.id}
            initial={animacoes ? { opacity: 0, x: -12, height: 0 } : false}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            <ItemEvento e={e} compacto={compacto} />
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
  return alturaMax ? (
    <ScrollArea.Autosize mah={alturaMax} className="scroll-fino">
      {lista}
    </ScrollArea.Autosize>
  ) : (
    lista
  );
}
